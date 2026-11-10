import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Build a Cursor `User/` directory: globalStorage/state.vscdb with the same tables and key layout
 * as a real install (composerData:<id>, bubbleId:<composer>:<bubble>), plus one workspace.json.
 * Content is synthetic.
 */
export function makeCursorUser(root: string) {
  mkdirSync(path.join(root, 'globalStorage'), { recursive: true });
  mkdirSync(path.join(root, 'workspaceStorage', 'ws-old'), { recursive: true });
  writeFileSync(path.join(root, 'workspaceStorage', 'ws-old', 'workspace.json'), JSON.stringify({ folder: 'file:///Users/dev/old-app' }));
  const db = new Database(path.join(root, 'globalStorage', 'state.vscdb'));
  db.exec(`
    CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);
    CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);
    CREATE TABLE composerHeaders (composerId TEXT PRIMARY KEY, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, recency INTEGER, checkpointAt INTEGER, value TEXT, subagentTypeName TEXT);
  `);
  const T = 1_762_000_000_000;
  const put = db.prepare(`INSERT INTO cursorDiskKV VALUES (?, ?)`);
  const kv = (k: string, v: unknown) => put.run(k, JSON.stringify(v));
  kv('composerData:c-new', {
    _v: 18, composerId: 'c-new', name: 'Invoice validation', createdAt: T, lastUpdatedAt: T + 60_000, status: 'completed',
    modelConfig: { modelName: 'claude-4.5-sonnet' }, subagentComposerIds: ['c-sub'], usageData: {},
    workspaceIdentifier: { id: 'ws-new', uri: { fsPath: '/Users/dev/rechnify', scheme: 'file' } },
    conversationState: '~' + 'x'.repeat(5000),
  });
  kv('composerData:c-sub', { _v: 18, composerId: 'c-sub', name: 'Explore validators', createdAt: T + 5000, lastUpdatedAt: T + 9000, usageData: {} });
  kv('composerData:c-old', {
    _v: 3, composerId: 'c-old', createdAt: T - 86_400_000, lastUpdatedAt: T - 86_000_000,
    usageData: { 'claude-4.5-sonnet-thinking': { costInCents: 49, amount: 5 } },
    fullConversationHeadersOnly: [{ bubbleId: 'b1', type: 1 }], workspaceIdentifier: { id: 'ws-old' },
  });
  kv('composerData:c-empty', { _v: 18, composerId: 'c-empty', createdAt: T, lastUpdatedAt: T });
  const bubble = (c: string, b: string, v: object) => kv(`bubbleId:${c}:${b}`, { _v: 3, bubbleId: b, tokenCount: { inputTokens: 0, outputTokens: 0 }, conversationState: '~blob', ...v });
  bubble('c-new', 'b1', { type: 1, text: 'Validate invoice totals before export', createdAt: new Date(T).toISOString() });
  bubble('c-new', 'b2', { type: 2, text: 'I will add a validator.', createdAt: new Date(T + 1000).toISOString(), modelInfo: { modelName: 'claude-4.5-sonnet' }, thinking: { text: 'long thinking'.repeat(100) } });
  bubble('c-new', 'b3', {
    type: 2, createdAt: new Date(T + 2000).toISOString(), startedAtMs: T + 2000, completedAtMs: T + 3500,
    toolFormerData: { toolCallId: 'call-1', name: 'read_file_v2', status: 'completed', rawArgs: '{"path":"a.py"}', result: '{"totalLinesInFile":10}' },
  });
  bubble('c-new', 'b4', {
    type: 2, createdAt: new Date(T + 4000).toISOString(), startedAtMs: T + 4000, completedAtMs: T + 9000,
    toolFormerData: { toolCallId: 'call-2', name: 'run_terminal_command_v2', status: 'error', rawArgs: '{"command":"pytest"}', result: 'exit 1' },
  });
  // The rare bubble that does carry tokens.
  bubble('c-new', 'b5', { type: 2, text: 'Done.', createdAt: new Date(T + 10_000).toISOString(), modelInfo: { modelName: 'claude-4.5-sonnet' }, tokenCount: { inputTokens: 1200, outputTokens: 300 } });
  bubble('c-sub', 'b1', { type: 2, text: 'Found pydantic validators.', createdAt: new Date(T + 6000).toISOString() });
  bubble('c-old', 'b1', { type: 1, text: 'Old chat about caching', createdAt: new Date(T - 86_400_000).toISOString(), tokenCount: { inputTokens: 50, outputTokens: 5 } });
  // A neighbouring key range that must not leak into c-new's bubbles.
  bubble('c-newer', 'zz', { type: 1, text: 'orphan', createdAt: new Date(T).toISOString() });
  kv('checkpointId:c-new:x', { big: true });
  db.prepare(`INSERT INTO composerHeaders (composerId, workspaceId, createdAt, lastUpdatedAt) VALUES ('c-new','ws-new',?,?)`).run(T, T + 60_000);
  db.close();
  return T;
}

/** Simulate Cursor appending to a conversation. */
export function appendBubble(root: string, T: number) {
  const db = new Database(path.join(root, 'globalStorage', 'state.vscdb'));
  db.prepare(`INSERT INTO cursorDiskKV VALUES ('bubbleId:c-new:b6', ?)`).run(JSON.stringify({ type: 1, text: 'Also check VAT', createdAt: new Date(T + 120_000).toISOString(), tokenCount: {} }));
  const c = JSON.parse(db.prepare(`SELECT value FROM cursorDiskKV WHERE key='composerData:c-new'`).pluck().get() as string);
  c.lastUpdatedAt = T + 120_000;
  db.prepare(`UPDATE cursorDiskKV SET value = ? WHERE key='composerData:c-new'`).run(JSON.stringify(c));
  db.close();
}
