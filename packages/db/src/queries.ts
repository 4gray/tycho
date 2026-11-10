import type BetterSqlite3 from 'better-sqlite3';
import type { OverviewData, SessionRow, SourceRow } from '@tycho/core';

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
        `SELECT substr(u.timestamp,1,10) day, s.harness harness, SUM(u.cost_usd) costUsd
         FROM usage_events u JOIN sessions s ON s.id = u.session_id
         WHERE u.timestamp >= ? GROUP BY day, s.harness ORDER BY day`,
      )
      .all(dayStart(13, now)) as OverviewData['daily'],
    byModel: db
      .prepare(
        `SELECT u.model model, s.harness harness, SUM(u.cost_usd) costUsd
         FROM usage_events u JOIN sessions s ON s.id = u.session_id
         WHERE u.timestamp >= ? GROUP BY u.model, s.harness ORDER BY costUsd DESC LIMIT 8`,
      )
      .all(since30) as OverviewData['byModel'],
    cacheReadShare: cache.t ? (cache.r ?? 0) / cache.t : null,
  };
}

export function sessions(
  db: BetterSqlite3.Database,
  q: { harness?: string; limit?: number; offset?: number },
  now = new Date(),
): SessionRow[] {
  const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS).toISOString();
  const rows = db
    .prepare(
      `SELECT s.id, s.harness, COALESCE(s.title, '(untitled)') title, s.project_path projectPath,
         s.started_at startedAt, s.updated_at updatedAt,
         (SELECT model FROM usage_events WHERE session_id = s.id GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1) model,
         COALESCE((SELECT SUM(input_tokens+output_tokens+cache_read_tokens+cache_write_tokens) FROM usage_events WHERE session_id = s.id),0) totalTokens,
         (SELECT COUNT(*) FROM tool_calls WHERE session_id = s.id) toolCalls,
         (SELECT COUNT(*) FROM tool_calls WHERE session_id = s.id AND status = 'error') toolErrors,
         COALESCE((SELECT SUM(cost_usd) FROM usage_events WHERE session_id = s.id),0) costUsd,
         (SELECT CASE WHEN SUM(cost_source='estimated')>0 THEN 'estimated'
                      WHEN SUM(cost_source='computed')>0 THEN 'computed'
                      WHEN COUNT(*)>0 THEN 'reported' END FROM usage_events WHERE session_id = s.id) costSource,
         s.updated_at >= @liveSince live
       FROM sessions s
       WHERE s.parent_session_id IS NULL AND (@harness IS NULL OR s.harness = @harness)
       ORDER BY s.updated_at DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ liveSince, harness: q.harness ?? null, limit: q.limit ?? 200, offset: q.offset ?? 0 }) as (Omit<SessionRow, 'live'> & { live: number })[];
  return rows.map((r) => ({ ...r, live: r.live === 1 }));
}

export function sources(db: BetterSqlite3.Database): SourceRow[] {
  return db
    .prepare(
      `SELECT source_ref sourceRef, harness, health, last_error lastError, last_ingest_at lastIngestAt, records
       FROM sources ORDER BY harness, source_ref`,
    )
    .all() as SourceRow[];
}
