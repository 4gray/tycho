import { describe, expect, it } from 'vitest';
import { openDb, queries } from './index';

describe('db', () => {
  it('migrates idempotently and answers empty queries', () => {
    const db = openDb(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(queries.overview(db).cost30d).toBe(0);
    expect(queries.sessions(db, {})).toEqual([]);
  });

  it('aggregates cost, tools and provenance per session', () => {
    const db = openDb(':memory:');
    const now = new Date();
    const ts = now.toISOString();
    db.prepare(`INSERT INTO sessions VALUES ('claude-code:a','claude-code','a','/p','Fix tests',?,?,NULL,'f')`).run(ts, ts);
    const ins = db.prepare(`INSERT INTO usage_events VALUES (?, 'claude-code:a', NULL, ?, 'anthropic', 'opus', 100, 50, 900, 10, NULL, ?, 'computed')`);
    ins.run('u1', ts, 1.5);
    ins.run('u2', ts, 0.5);
    db.prepare(`INSERT INTO tool_calls VALUES ('t1','claude-code:a','m','bash','Bash',NULL,NULL,NULL,'error',NULL,NULL)`).run();
    const [row] = queries.sessions(db, {}, now);
    expect(row).toMatchObject({ costUsd: 2, toolCalls: 1, toolErrors: 1, costSource: 'computed', live: true, model: 'opus' });
    const ov = queries.overview(db, now);
    expect(ov.costToday).toBe(2);
    expect(ov.cacheReadShare).toBeCloseTo(1800 / (200 + 1800 + 20));
  });

  it('indexes message text in FTS', () => {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO messages (id, session_id, role, timestamp, text) VALUES ('m1','s','user','t','add a migration for usage')`).run();
    const hit = db.prepare(`SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'migration'`).all();
    expect(hit).toHaveLength(1);
  });
});
