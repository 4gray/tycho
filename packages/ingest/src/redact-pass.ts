import type BetterSqlite3 from 'better-sqlite3';
import { redact } from '@tycho/core';

/** Bump when redaction rules change so existing rows are re-scanned once. */
export const REDACTION_VERSION = 1;

/**
 * Re-apply redaction to rows stored before the current rules existed. Runs once per version,
 * in batches, inside the single-writer worker. Updating `messages.text` also refreshes FTS via triggers.
 */
export function redactExisting(db: BetterSqlite3.Database): number {
  const done = Number(db.prepare(`SELECT value FROM meta WHERE key = 'redaction_version'`).pluck().get() ?? 0);
  if (done >= REDACTION_VERSION) return 0;
  let changed = 0;
  const batch = 2000;
  const passes: { select: string; update: string; cols: string[] }[] = [
    { select: `SELECT rowid, text a FROM messages WHERE rowid > ? AND text IS NOT NULL ORDER BY rowid LIMIT ${batch}`, update: `UPDATE messages SET text = ? WHERE rowid = ?`, cols: ['a'] },
    {
      select: `SELECT rowid, input a, output b FROM tool_calls WHERE rowid > ? ORDER BY rowid LIMIT ${batch}`,
      update: `UPDATE tool_calls SET input = ?, output = ? WHERE rowid = ?`,
      cols: ['a', 'b'],
    },
    { select: `SELECT rowid, title a FROM sessions WHERE rowid > ? AND title IS NOT NULL ORDER BY rowid LIMIT ${batch}`, update: `UPDATE sessions SET title = ? WHERE rowid = ?`, cols: ['a'] },
  ];
  for (const p of passes) {
    const sel = db.prepare(p.select);
    const upd = db.prepare(p.update);
    let last = 0;
    for (;;) {
      const rows = sel.all(last) as Record<string, string | number | null>[];
      if (rows.length === 0) break;
      db.transaction(() => {
        for (const r of rows) {
          const before = p.cols.map((c) => r[c] as string | null);
          const after = before.map((v) => (v == null ? v : redact(v)));
          if (after.some((v, i) => v !== before[i])) {
            upd.run(...after, r.rowid);
            changed++;
          }
        }
      })();
      last = Number(rows[rows.length - 1]!.rowid);
    }
  }
  db.prepare(`INSERT INTO meta (key, value) VALUES ('redaction_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(REDACTION_VERSION));
  return changed;
}
