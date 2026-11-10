import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type BetterSqlite3 from 'better-sqlite3';
import { computeCost, type NormalizedRecord } from '@tycho/core';

export interface WriteStats {
  records: number;
  usage: number;
}

/**
 * Idempotent upserts keyed on stable ids, so re-reading a file never double-counts.
 * Sessions widen their time span and only accept a title of equal or higher rank.
 */
export class Writer {
  private s;
  constructor(private db: BetterSqlite3.Database, private aliases: Record<string, string> = {}) {
    this.s = {
      session: db.prepare(`
        INSERT INTO sessions (id, harness, native_id, project_path, title, title_rank, started_at, updated_at, parent_session_id, source_ref)
        VALUES (@id, @harness, @nativeId, @projectPath, @title, @titleRank, @ts, @ts, @parentSessionId, @sourceRef)
        ON CONFLICT(id) DO UPDATE SET
          project_path = COALESCE(sessions.project_path, excluded.project_path),
          title = CASE WHEN excluded.title_rank >= sessions.title_rank AND excluded.title IS NOT NULL THEN excluded.title ELSE sessions.title END,
          title_rank = MAX(sessions.title_rank, excluded.title_rank),
          started_at = CASE WHEN excluded.started_at = '' THEN sessions.started_at WHEN sessions.started_at = '' THEN excluded.started_at ELSE MIN(sessions.started_at, excluded.started_at) END,
          updated_at = MAX(sessions.updated_at, excluded.updated_at)`),
      message: db.prepare(`
        INSERT INTO messages (id, session_id, role, timestamp, model, text, is_sidechain, raw)
        VALUES (@id, @sessionId, @role, @timestamp, @model, @text, @isSidechain, @raw)
        ON CONFLICT(id) DO UPDATE SET text = excluded.text, model = COALESCE(excluded.model, messages.model)`),
      toolCall: db.prepare(`
        INSERT INTO tool_calls (id, session_id, message_id, name, native_name, input, status, started_at)
        VALUES (@id, @sessionId, @messageId, @name, @nativeName, @input, @status, @startedAt)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, native_name = excluded.native_name, message_id = excluded.message_id,
          input = excluded.input, started_at = excluded.started_at,
          status = CASE WHEN tool_calls.status IN ('ok','error') THEN tool_calls.status ELSE excluded.status END`),
      toolResult: db.prepare(`
        INSERT INTO tool_calls (id, session_id, message_id, name, native_name, output, output_sha256, status, ended_at)
        VALUES (@id, @sessionId, '', 'unknown', 'unknown', @output, @sha, @status, @endedAt)
        ON CONFLICT(id) DO UPDATE SET output = excluded.output, output_sha256 = excluded.output_sha256,
          status = excluded.status, ended_at = excluded.ended_at`),
      usage: db.prepare(`
        INSERT INTO usage_events (id, session_id, message_id, timestamp, provider, model, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, reasoning_tokens, cost_usd, cost_source)
        VALUES (@id, @sessionId, @messageId, @timestamp, @provider, @model, @inputTokens, @outputTokens,
          @cacheReadTokens, @cacheWriteTokens, @cacheWrite1hTokens, @reasoningTokens, @costUsd, @costSource)
        ON CONFLICT(id) DO NOTHING`),
    };
  }

  write(records: NormalizedRecord[]): WriteStats {
    let usage = 0;
    for (const r of records) {
      switch (r.kind) {
        case 'session':
          this.s.session.run({
            id: r.id, harness: r.harness, nativeId: r.nativeId, projectPath: r.projectPath ?? null,
            title: r.title?.text ?? null, titleRank: r.title?.rank ?? 0, ts: r.timestamp,
            parentSessionId: r.parentSessionId ?? null, sourceRef: r.sourceRef,
          });
          break;
        case 'message':
          this.s.message.run({
            id: r.id, sessionId: r.sessionId, role: r.role, timestamp: r.timestamp, model: r.model ?? null,
            text: r.text ?? null, isSidechain: r.isSidechain ? 1 : 0, raw: r.raw ? gzipSync(r.raw) : null,
          });
          break;
        case 'tool_call':
          this.s.toolCall.run({ ...r, input: r.input ?? null, startedAt: r.startedAt ?? null });
          break;
        case 'tool_result':
          this.s.toolResult.run({
            id: r.id, sessionId: r.sessionId, output: r.output ?? null, status: r.status, endedAt: r.endedAt,
            sha: r.output ? createHash('sha256').update(r.output).digest('hex') : null,
          });
          break;
        case 'usage': {
          const reported = r.costUsd !== undefined;
          const cost = reported ? r.costUsd : computeCost(r.model, r, undefined, this.aliases);
          const info = this.s.usage.run({
            id: r.id, sessionId: r.sessionId, messageId: r.messageId ?? null, timestamp: r.timestamp, provider: r.provider ?? null,
            model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens,
            cacheWriteTokens: r.cacheWriteTokens, cacheWrite1hTokens: r.cacheWrite1hTokens ?? 0, reasoningTokens: r.reasoningTokens ?? null, costUsd: cost ?? null,
            costSource: r.costSource ?? (reported ? 'reported' : 'computed'),
          });
          usage += info.changes;
          break;
        }
      }
    }
    return { records: records.length, usage };
  }
}
