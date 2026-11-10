import { appendFileSync, cpSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { opencode, opencodeJson, type AdapterSpec } from '@tycho/adapters';
import { openDb, queries } from '@tycho/db';
import { makeOpencodeDb } from '../../adapters/src/opencode/fixtures/make-db';
import { Ingestor } from './ingestor';

const at = (dir: string, spec: AdapterSpec): AdapterSpec => ({ ...spec, discover: { ...spec.discover, roots: { default: [dir] }, env: undefined } });
const one = <T>(db: Database.Database, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
const n = (db: Database.Database, sql: string) => db.prepare(sql).pluck().get() as number;

function sqliteSetup(withV1 = false) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tycho-oc-'));
  const T = makeOpencodeDb(path.join(dir, 'opencode.db'), { withV1 });
  const db = openDb(':memory:');
  return { dir, T, db, ing: new Ingestor(db, at(dir, opencode)) };
}

describe('opencode sqlite (v2)', () => {
  it('discovers channel databases only', () => {
    expect(opencode.discover.match('opencode.db')).toBe(true);
    expect(opencode.discover.match('opencode-beta.db')).toBe(true);
    expect(opencode.discover.match('opencode.db-wal')).toBe(false);
    expect(opencode.discover.match(path.join('log', 'x.db'))).toBe(false);
  });

  it('ingests sessions, subagents, tools and usage', () => {
    const { db, ing, T } = sqliteSetup();
    expect(ing.backfill()[0]).toMatchObject({ skipped: 0 });
    expect(one(db, `SELECT title, project_path p, started_at s, updated_at u FROM sessions WHERE id='opencode:ses_a'`)).toEqual({
      title: 'Add billing retries', p: '/Users/dev/shop', s: new Date(T).toISOString(), u: new Date(T + 90_000).toISOString(),
    });
    expect(one(db, `SELECT parent_session_id p FROM sessions WHERE id='opencode:ses_child'`)).toEqual({ p: 'opencode:ses_a' });
    expect(db.prepare(`SELECT name, status, ended_at IS NOT NULL done, output FROM tool_calls ORDER BY name`).all()).toEqual([
      { name: 'bash', status: 'error', done: 1, output: 'exit 1' },
      { name: 'edit', status: 'ok', done: 1, output: 'edited' },
    ]);
    const msgs = db.prepare(`SELECT role, text FROM messages ORDER BY timestamp, id`).all();
    expect(msgs).toEqual([
      { role: 'user', text: 'Add retries to the billing webhook' },
      { role: 'assistant', text: 'I will add exponential backoff.' },
      { role: 'assistant', text: 'Inline content is also supported.' },
    ]);
  });

  it('uses reported cost, and computes it when the provider reports zero', () => {
    const { db, ing } = sqliteSetup();
    ing.backfill();
    expect(one(db, `SELECT cost_usd c, cost_source s FROM usage_events WHERE id='opencode:msg_a1'`)).toEqual({ c: 0.042, s: 'reported' });
    const copilot = one<{ c: number; s: string }>(db, `SELECT cost_usd c, cost_source s FROM usage_events WHERE id='opencode:msg_a2'`);
    expect(copilot.s).toBe('computed');
    expect(copilot.c).toBeGreaterThan(0);
    const [row] = queries.sessions(db, {}, new Date(0));
    expect(row).toMatchObject({ id: 'opencode:ses_a', subagents: 1, toolCalls: 2, toolErrors: 1, costSource: 'computed' });
  });

  it('picks up only changed rows and updates streaming tokens in place', () => {
    const { dir, db, ing, T } = sqliteSetup();
    ing.backfill();
    const h = new Database(path.join(dir, 'opencode.db'));
    const data = JSON.parse(h.prepare(`SELECT data FROM session_message WHERE id='msg_a1'`).pluck().get() as string);
    data.tokens.output = 900;
    data.cost = 0.05;
    h.prepare(`UPDATE session_message SET data = ?, time_updated = ? WHERE id='msg_a1'`).run(JSON.stringify(data), T + 200_000);
    h.close();
    ing.backfill();
    expect(n(db, `SELECT COUNT(*) FROM usage_events`)).toBe(3);
    expect(one(db, `SELECT output_tokens o, cost_usd c FROM usage_events WHERE id='opencode:msg_a1'`)).toEqual({ o: 900, c: 0.05 });
  });

  it('never writes to the harness database', () => {
    const { dir, ing } = sqliteSetup();
    const file = path.join(dir, 'opencode.db');
    const before = new Database(file, { readonly: true }).prepare('PRAGMA data_version').pluck().get();
    ing.backfill();
    expect(new Database(file, { readonly: true }).prepare('PRAGMA data_version').pluck().get()).toBe(before);
  });

  it('collapses a session present in both v1 and v2 tables', () => {
    const { db, ing } = sqliteSetup(true);
    ing.backfill();
    expect(n(db, `SELECT COUNT(*) FROM usage_events WHERE id='opencode:msg_a1'`)).toBe(1);
    expect(n(db, `SELECT COUNT(*) FROM sessions WHERE id='opencode:ses_a'`)).toBe(1);
    expect(n(db, `SELECT COUNT(*) FROM messages WHERE text='one more thing' AND role='user'`)).toBe(1);
  });

  it('fails soft on a corrupt database', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tycho-oc-'));
    appendFileSync(path.join(dir, 'opencode.db'), 'not a database');
    const db = openDb(':memory:');
    new Ingestor(db, at(dir, opencode)).backfill();
    expect(one(db, `SELECT health FROM sources`)).toEqual({ health: 'failing' });
  });
});

describe('opencode JSON storage (oldest layout)', () => {
  it('reads sessions, messages and parts from files', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tycho-ocj-'));
    cpSync(path.resolve(__dirname, '../../adapters/src/opencode/fixtures'), dir, { recursive: true });
    const db = openDb(':memory:');
    const ing = new Ingestor(db, at(dir, opencodeJson));
    const res = ing.backfill();
    expect(res).toHaveLength(6);
    expect(one(db, `SELECT title, project_path p FROM sessions`)).toEqual({ title: 'Port the CLI to Go', p: '/Users/dev/legacy' });
    expect(one(db, `SELECT cost_usd c, cost_source s, model FROM usage_events`)).toEqual({ c: 0.0123, s: 'reported', model: 'claude-sonnet-4-5' });
    expect(db.prepare(`SELECT role, text FROM messages ORDER BY role DESC`).all()).toEqual([
      { role: 'user', text: 'Port the CLI to Go\nkeep flags' },
      { role: 'assistant', text: 'Built successfully.' },
    ]);
    expect(one(db, `SELECT name, status FROM tool_calls`)).toEqual({ name: 'bash', status: 'ok' });
    // Unchanged files are skipped on the next pass.
    expect(ing.backfill().every((r) => r.records === 0)).toBe(true);
  });
});
