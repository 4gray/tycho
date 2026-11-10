import Database from 'better-sqlite3';

/**
 * Build an OpenCode database fixture with the column layout from OpenCode's drizzle schema
 * (packages/core/src/session/sql.ts) plus legacy v1 tables. Content is synthetic.
 * `withV1` adds a v1 copy of one session, as OpenCode's in-place migration leaves behind.
 */
export function makeOpencodeDb(file: string, opts: { withV1?: boolean } = {}) {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE session_v2 (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT, slug TEXT NOT NULL, directory TEXT NOT NULL,
      title TEXT, version TEXT NOT NULL, cost REAL NOT NULL DEFAULT 0, model TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL);
    CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE session_part (message_id TEXT NOT NULL, session_id TEXT NOT NULL, ordinal INTEGER NOT NULL, type TEXT NOT NULL,
      call_id TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (message_id, ordinal));
  `);
  const T = 1_762_000_000_000;
  db.prepare(`INSERT INTO session_v2 VALUES ('ses_a','p1',NULL,'brave-fox','/Users/dev/shop','Add billing retries','1.2.0',0.05,NULL,?,?)`).run(T, T + 90_000);
  db.prepare(`INSERT INTO session_v2 VALUES ('ses_child','p1','ses_a','calm-owl','/Users/dev/shop','Explore retry libs','1.2.0',0,NULL,?,?)`).run(T + 10_000, T + 20_000);
  const msg = db.prepare(`INSERT INTO session_message VALUES (?,?,?,?,?,?,?)`);
  msg.run('msg_u1', 'ses_a', 'user', 1, T, T, JSON.stringify({ time: { created: T }, text: 'Add retries to the billing webhook' }));
  msg.run('msg_a1', 'ses_a', 'assistant', 2, T + 1000, T + 60_000, JSON.stringify({
    time: { created: T + 1000, completed: T + 60_000 }, agent: 'build', model: { id: 'claude-sonnet-4-5', providerID: 'anthropic' },
    content: [], cost: 0.042, tokens: { input: 2000, output: 500, reasoning: 0, cache: { read: 10_000, write: 1000 } },
  }));
  // Subscription provider: reports cost 0, so Tycho computes the API-equivalent instead.
  msg.run('msg_a2', 'ses_a', 'assistant', 3, T + 70_000, T + 90_000, JSON.stringify({
    time: { created: T + 70_000 }, agent: 'build', model: { id: 'gpt-4o', providerID: 'github-copilot' },
    content: [{ type: 'text', text: 'Inline content is also supported.' }], cost: 0, tokens: { input: 100, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
  }));
  msg.run('msg_c1', 'ses_child', 'assistant', 1, T + 12_000, T + 20_000, JSON.stringify({
    time: { created: T + 12_000 }, agent: 'explore', model: { id: 'claude-haiku-4-5', providerID: 'anthropic' },
    content: [], cost: 0.001, tokens: { input: 300, output: 40, reasoning: 0, cache: { read: 0, write: 0 } },
  }));
  msg.run('msg_x', 'ses_a', 'idle', 4, T + 90_000, T + 90_000, JSON.stringify({ time: { created: T + 90_000 }, outcome: 'succeeded' }));
  const part = db.prepare(`INSERT INTO session_part VALUES (?,?,?,?,?,?,?,?)`);
  part.run('msg_a1', 'ses_a', 0, 'reasoning', null, T + 1000, T + 1000, JSON.stringify({ type: 'reasoning', text: 'thinking' }));
  part.run('msg_a1', 'ses_a', 1, 'text', null, T + 1000, T + 1000, JSON.stringify({ type: 'text', text: 'I will add exponential backoff.' }));
  part.run('msg_a1', 'ses_a', 2, 'tool', 'call_ok', T + 1000, T + 5000, JSON.stringify({
    type: 'tool', id: 'call_ok', name: 'Edit', state: { status: 'completed', input: { path: 'webhook.ts' }, content: [{ type: 'text', text: 'edited' }] },
    time: { created: T + 2000, ran: T + 2100, completed: T + 4000 },
  }));
  part.run('msg_a1', 'ses_a', 3, 'tool', 'call_err', T + 1000, T + 9000, JSON.stringify({
    type: 'tool', id: 'call_err', name: 'bash', state: { status: 'error', input: { command: 'npm test' }, error: { name: 'Exit', message: 'exit 1' } },
    time: { created: T + 6000, completed: T + 9000 },
  }));
  if (opts.withV1) {
    db.exec(`
      CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER);
      CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
      CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
    `);
    db.prepare(`INSERT INTO session VALUES ('ses_a','p1',NULL,'/Users/dev/shop','Add billing retries',?,?)`).run(T, T + 90_000);
    db.prepare(`INSERT INTO message VALUES ('msg_a1','ses_a',?,?,?)`).run(T + 1000, T + 60_000, JSON.stringify({
      role: 'assistant', modelID: 'claude-sonnet-4-5', providerID: 'anthropic', cost: 0.042,
      tokens: { input: 2000, output: 500, reasoning: 0, cache: { read: 10_000, write: 1000 } }, time: { created: T + 1000 },
    }));
    db.prepare(`INSERT INTO message VALUES ('msg_v1only','ses_a',?,?,?)`).run(T + 95_000, T + 95_000, JSON.stringify({ role: 'user', time: { created: T + 95_000 } }));
    db.prepare(`INSERT INTO part VALUES ('prt_1','msg_v1only','ses_a',?,?,?)`).run(T + 95_000, T + 95_000, JSON.stringify({ type: 'text', text: 'one more thing' }));
  }
  db.close();
  return T;
}
