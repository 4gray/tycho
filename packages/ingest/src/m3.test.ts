import { cpSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeCode, opencode, type AdapterSpec } from '@tycho/adapters';
import { openDb, queries } from '@tycho/db';
import { makeOpencodeDb } from '../../adapters/src/opencode/fixtures/make-db';
import { Ingestor } from './ingestor';

const at = (dir: string, spec: AdapterSpec): AdapterSpec => ({ ...spec, discover: { ...spec.discover, roots: { default: [dir] }, env: undefined } });

function both() {
  const db = openDb(':memory:');
  const cc = mkdtempSync(path.join(os.tmpdir(), 'tycho-'));
  cpSync(path.resolve(__dirname, '../../adapters/src/claude-code/fixtures/projects'), cc, { recursive: true });
  new Ingestor(db, at(cc, claudeCode)).backfill();
  const oc = mkdtempSync(path.join(os.tmpdir(), 'tycho-'));
  makeOpencodeDb(path.join(oc, 'opencode.db'));
  new Ingestor(db, at(oc, opencode)).backfill();
  return db;
}

describe('tools', () => {
  it('counts calls, errors and durations per tool and harness', () => {
    const db = both();
    const rows = queries.tools(db, {});
    expect(rows.find((r) => r.name === 'bash' && r.harness === 'claude-code')).toEqual({ name: 'bash', harness: 'claude-code', calls: 1, errors: 1, avgMs: 6000, p90Ms: 6000 });
    expect(rows.find((r) => r.name === 'edit' && r.harness === 'opencode')).toMatchObject({ calls: 1, errors: 0, avgMs: 1900 });
    expect(queries.tools(db, { harness: 'opencode' }).every((r) => r.harness === 'opencode')).toBe(true);
  });
});

describe('harnesses', () => {
  it('compares cost, sessions and error rate per harness', () => {
    const db = both();
    const rows = queries.harnesses(db, {});
    expect(rows.map((r) => r.harness).sort()).toEqual(['claude-code', 'opencode']);
    const oc = rows.find((r) => r.harness === 'opencode')!;
    expect(oc).toMatchObject({ sessions: 1, toolCalls: 2, toolErrors: 1 });
    expect(oc.costPerSession).toBeCloseTo(oc.costUsd);
  });
});

describe('search', () => {
  it('finds prefix matches across harnesses with highlighted snippets', () => {
    const db = both();
    const hits = queries.search(db, { q: 'retr' });
    expect(hits.map((h) => h.harness)).toContain('opencode');
    expect(hits[0]!.snippet).toContain('\u0002');
    expect(queries.search(db, { q: 'flaky login' }).map((h) => h.sessionId)).toContain('claude-code:sess-1');
  });

  it('attributes subagent hits to the parent session and filters by harness', () => {
    const db = both();
    const [hit] = queries.search(db, { q: 'login helpers' });
    expect(hit).toMatchObject({ sessionId: 'claude-code:sess-1/agent-abc', sessionTitle: 'Fix flaky login test' });
    expect(queries.search(db, { q: 'login', harness: 'opencode' })).toEqual([]);
  });

  it('never throws on FTS syntax in user input', () => {
    const db = both();
    for (const q of ['"', 'AND OR NOT', '(*', 'a:b', 'NEAR(', '']) expect(() => queries.search(db, { q })).not.toThrow();
    expect(queries.ftsQuery('  ')).toBeNull();
  });
});

describe('redaction', () => {
  it('redacts on write and re-scans rows stored before redaction, once', async () => {
    const { redactExisting } = await import('./redact-pass');
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO messages (id, session_id, role, timestamp, text) VALUES ('m','s','user','t', ?)`).run('key is AKIAABCDEFGHIJKLMNOP ok');
    expect(redactExisting(db)).toBe(1);
    expect(db.prepare(`SELECT text FROM messages`).pluck().get()).toBe('key is AKIA…[redacted] ok');
    expect(queries.search(db, { q: 'AKIAABCDEFGHIJKLMNOP' })).toEqual([]);
    expect(redactExisting(db)).toBe(0);
  });
});
