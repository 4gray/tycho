import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Open a harness database without ever writing to it. Read-only first; if the file is locked or
 * needs WAL recovery we cannot perform read-only, fall back to a snapshot copy opened immutable.
 */
export function openReadOnly(file: string): { db: Database.Database; close: () => void } {
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    db.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
    return { db, close: () => db.close() };
  } catch {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tycho-snap-'));
    const copy = path.join(dir, path.basename(file));
    copyFileSync(file, copy);
    for (const ext of ['-wal', '-shm']) if (existsSync(file + ext)) copyFileSync(file + ext, copy + ext);
    const db = new Database(copy, { readonly: true });
    return {
      db,
      close: () => {
        db.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }
}

export function tableColumns(db: Database.Database): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).pluck().all() as string[];
  for (const t of tables) {
    out.set(t, new Set((db.prepare(`SELECT name FROM pragma_table_info(?)`).pluck().all(t) as string[])));
  }
  return out;
}
