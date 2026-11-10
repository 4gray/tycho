import { statSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import type { NormalizedRecord } from '@tycho/core';
import type { AdapterSpec } from '@tycho/adapters';
import { discover, rootsFor, type Source } from './discover';
import { readJsonl } from './jsonl';
import { Writer } from './writer';

export interface IngestProgress {
  harness: string;
  done: number;
  total: number;
}

export interface IngestResult {
  file: string;
  records: number;
  skipped: number;
}

/**
 * Drives one adapter: reads each source from its stored offset, normalizes, writes, and advances the
 * offset in the same transaction so a crash can never skip data.
 */
export class Ingestor {
  private writer: Writer;
  private getState;
  private putState;
  private putSource;
  private failSource;

  constructor(private db: BetterSqlite3.Database, readonly spec: AdapterSpec, aliases?: Record<string, string>) {
    this.writer = new Writer(db, aliases);
    this.getState = db.prepare('SELECT offset FROM ingest_state WHERE source_ref = ?').pluck();
    this.putState = db.prepare(`INSERT INTO ingest_state (source_ref, kind, offset, mtime_ms, updated_at) VALUES (?, 'offset', ?, ?, ?)
      ON CONFLICT(source_ref) DO UPDATE SET offset = excluded.offset, mtime_ms = excluded.mtime_ms, updated_at = excluded.updated_at`);
    this.putSource = db.prepare(`INSERT INTO sources (source_ref, harness, health, last_error, skipped, last_ingest_at, records)
      VALUES (@ref, @harness, @health, @err, @skipped, @at, @records)
      ON CONFLICT(source_ref) DO UPDATE SET health = excluded.health, last_error = excluded.last_error,
        skipped = sources.skipped + excluded.skipped, last_ingest_at = excluded.last_ingest_at, records = sources.records + excluded.records`);
    this.failSource = db.prepare(`INSERT INTO sources (source_ref, harness, health, last_error) VALUES (?, ?, 'failing', ?)
      ON CONFLICT(source_ref) DO UPDATE SET health = 'failing', last_error = excluded.last_error`);
  }

  roots(): string[] {
    return rootsFor(this.spec);
  }

  discover(): Source[] {
    return discover(this.spec);
  }

  /** Ingest everything new in one file. Never throws: failures mark the source unhealthy. */
  ingestFile(src: Source): IngestResult {
    if (this.spec.reader !== 'jsonl') throw new Error(`reader ${this.spec.reader} not implemented yet`);
    try {
      let offset = (this.getState.get(src.file) as number | undefined) ?? 0;
      let total = 0;
      let skipped = 0;
      let lastError: string | null = null;
      for (;;) {
        const chunk = readJsonl(src.file, offset);
        if (chunk.lines.length === 0 && !chunk.reset) break;
        const records: NormalizedRecord[] = [];
        for (const line of chunk.lines) {
          try {
            records.push(...this.spec.transform(JSON.parse(line), src));
          } catch (e) {
            skipped++;
            lastError = `Unreadable record: ${(e as Error).message}`;
          }
        }
        const mtime = statSync(src.file).mtimeMs;
        this.db.transaction(() => {
          this.writer.write(records);
          this.putState.run(src.file, chunk.nextOffset, mtime, new Date().toISOString());
          this.putSource.run({
            ref: src.file, harness: this.spec.harness, health: skipped ? 'degraded' : 'ok', err: lastError,
            skipped, at: new Date().toISOString(), records: chunk.lines.length,
          });
        })();
        total += records.length;
        if (chunk.nextOffset === offset) break;
        offset = chunk.nextOffset;
      }
      return { file: src.file, records: total, skipped };
    } catch (e) {
      this.failSource.run(src.file, this.spec.harness, (e as Error).message);
      return { file: src.file, records: 0, skipped: 0 };
    }
  }

  backfill(onProgress?: (p: IngestProgress) => void): IngestResult[] {
    const sources = this.discover();
    return sources.map((s, i) => {
      const r = this.ingestFile(s);
      onProgress?.({ harness: this.spec.harness, done: i + 1, total: sources.length });
      return r;
    });
  }
}
