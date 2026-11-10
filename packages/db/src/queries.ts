import type BetterSqlite3 from 'better-sqlite3';
import type { OverviewData, SessionDetail, SessionRow, SourceRow } from '@tycho/core';

const LIVE_WINDOW_MS = 2 * 60 * 1000;

function dayStart(daysAgo: number, now: Date): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

export function overview(db: BetterSqlite3.Database, now = new Date()): OverviewData {
  const costSince = db.prepare('SELECT COALESCE(SUM(cost_usd),0) c FROM usage_events WHERE timestamp >= ?').pluck();
  const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS).toISOString();
  const since30 = dayStart(29, now);
  const cache = db
    .prepare('SELECT SUM(cache_read_tokens) r, SUM(input_tokens + cache_read_tokens + cache_write_tokens) t FROM usage_events WHERE timestamp >= ?')
    .get(since30) as { r: number | null; t: number | null };
  return {
    costToday: costSince.get(dayStart(0, now)) as number,
    cost7d: costSince.get(dayStart(6, now)) as number,
    cost30d: costSince.get(since30) as number,
    liveCount: db.prepare('SELECT COUNT(*) FROM sessions WHERE updated_at >= ?').pluck().get(liveSince) as number,
    sessionCount: db.prepare('SELECT COUNT(*) FROM sessions').pluck().get() as number,
    daily: db
      .prepare(
        `SELECT substr(u.timestamp,1,10) day, s.harness harness, COALESCE(SUM(u.cost_usd),0) costUsd
         FROM usage_events u JOIN sessions s ON s.id = u.session_id
         WHERE u.timestamp >= ? GROUP BY day, s.harness ORDER BY day`,
      )
      .all(dayStart(13, now)) as OverviewData['daily'],
    byModel: db
      .prepare(
        `SELECT u.model model, s.harness harness, COALESCE(SUM(u.cost_usd),0) costUsd, MAX(u.cost_usd IS NULL) unpriced
         FROM usage_events u JOIN sessions s ON s.id = u.session_id
         WHERE u.timestamp >= ? GROUP BY u.model, s.harness ORDER BY costUsd DESC LIMIT 8`,
      )
      .all(since30)
      .map((r) => ({ ...(r as OverviewData['byModel'][number]), unpriced: (r as { unpriced: number }).unpriced === 1 })),
    cacheReadShare: cache.t ? (cache.r ?? 0) / cache.t : null,
  };
}

// A session row rolls up its subagents (children are not listed separately, so nothing is counted twice).
const FAM = '(SELECT id FROM sessions WHERE id = s.id OR parent_session_id = s.id)';
const SESSION_SELECT = `
  SELECT s.id, s.harness, COALESCE(s.title, '(untitled)') title, s.project_path projectPath,
    s.started_at startedAt, s.updated_at updatedAt,
    (SELECT model FROM usage_events WHERE session_id = s.id GROUP BY model ORDER BY SUM(output_tokens) DESC LIMIT 1) model,
    COALESCE((SELECT SUM(input_tokens+output_tokens+cache_read_tokens+cache_write_tokens) FROM usage_events WHERE session_id IN ${FAM}),0) totalTokens,
    (SELECT COUNT(*) FROM tool_calls WHERE session_id IN ${FAM}) toolCalls,
    (SELECT COUNT(*) FROM tool_calls WHERE session_id IN ${FAM} AND status = 'error') toolErrors,
    COALESCE((SELECT SUM(cost_usd) FROM usage_events WHERE session_id IN ${FAM}),0) costUsd,
    (SELECT CASE WHEN SUM(cost_source='estimated')>0 THEN 'estimated'
                 WHEN SUM(cost_source='computed')>0 THEN 'computed'
                 WHEN COUNT(*)>0 THEN 'reported' END FROM usage_events WHERE session_id IN ${FAM}) costSource,
    EXISTS (SELECT 1 FROM usage_events WHERE session_id IN ${FAM} AND cost_usd IS NULL) unpriced,
    (SELECT COUNT(*) FROM sessions WHERE parent_session_id = s.id) subagents,
    (SELECT MAX(updated_at) FROM sessions WHERE id IN ${FAM}) >= @liveSince live
  FROM sessions s`;

type RawRow = Omit<SessionRow, 'live' | 'unpriced'> & { live: number; unpriced: number };
const toRow = (r: RawRow): SessionRow => ({ ...r, live: r.live === 1, unpriced: r.unpriced === 1 });

export function sessions(
  db: BetterSqlite3.Database,
  q: { harness?: string; limit?: number; offset?: number },
  now = new Date(),
): SessionRow[] {
  const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS).toISOString();
  const rows = db
    .prepare(
      `${SESSION_SELECT}
       WHERE s.parent_session_id IS NULL AND (@harness IS NULL OR s.harness = @harness)
       ORDER BY updatedAt DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ liveSince, harness: q.harness ?? null, limit: q.limit ?? 200, offset: q.offset ?? 0 }) as RawRow[];
  return rows.map(toRow);
}

const MESSAGE_CAP = 2000;

export function session(db: BetterSqlite3.Database, id: string, now = new Date()): SessionDetail | null {
  const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS).toISOString();
  const row = db
    .prepare(
      `${SESSION_SELECT} WHERE s.id = @id`,
    )
    .get({ id, liveSince }) as RawRow | undefined;
  if (!row) return null;
  const fam = `(SELECT id FROM sessions WHERE id = @id OR parent_session_id = @id)`;
  const messages = db
    .prepare(`SELECT id, role, timestamp, model, text, session_id sessionId FROM messages WHERE session_id IN ${fam} AND text IS NOT NULL ORDER BY timestamp LIMIT ${MESSAGE_CAP + 1}`)
    .all({ id }) as SessionDetail['messages'];
  return {
    session: toRow(row),
    toolCalls: db
      .prepare(`SELECT id, name, status, started_at startedAt, ended_at endedAt, session_id sessionId FROM tool_calls WHERE session_id IN ${fam} ORDER BY started_at`)
      .all({ id }) as SessionDetail['toolCalls'],
    turns: db
      .prepare(
        `SELECT timestamp, model, input_tokens inputTokens, output_tokens outputTokens, cache_read_tokens cacheReadTokens,
           cache_write_tokens cacheWriteTokens, cost_usd costUsd FROM usage_events WHERE session_id = @id ORDER BY timestamp`,
      )
      .all({ id }) as SessionDetail['turns'],
    messages: messages.slice(0, MESSAGE_CAP),
    truncated: messages.length > MESSAGE_CAP,
  };
}

export function sources(db: BetterSqlite3.Database): SourceRow[] {
  return db
    .prepare(
      `SELECT source_ref sourceRef, harness, health, last_error lastError, last_ingest_at lastIngestAt, records
       FROM sources ORDER BY harness, source_ref`,
    )
    .all() as SourceRow[];
}
