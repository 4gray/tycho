import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NormalizedRecord } from '@tycho/core';
import type { SourceCtx } from '../types';

const H = 'opencode';
const OUTPUT_LIMIT = 8 * 1024;
type Obj = Record<string, unknown>;
type Tokens = { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } };

const sid = (id: string) => `${H}:${id}`;
const iso = (ms: unknown) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : undefined);
const clip = (s: string) => (s.length > OUTPUT_LIMIT ? `${s.slice(0, OUTPUT_LIMIT)}\n… [truncated ${s.length - OUTPUT_LIMIT} chars]` : s);
const json = (v: unknown): Obj => (typeof v === 'string' ? (JSON.parse(v) as Obj) : ((v ?? {}) as Obj));
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

function session(id: string, ctx: SourceCtx, f: { created?: unknown; updated?: unknown; directory?: unknown; title?: unknown; parent?: unknown }): NormalizedRecord[] {
  const base = {
    kind: 'session' as const, id: sid(id), harness: H, nativeId: id, sourceRef: ctx.file,
    projectPath: str(f.directory), parentSessionId: str(f.parent) ? sid(str(f.parent)!) : undefined,
  };
  const title = str(f.title);
  const out: NormalizedRecord[] = [];
  const c = iso(f.created);
  const u = iso(f.updated);
  if (c) out.push({ ...base, timestamp: c, title: title ? { text: title, rank: 2 } : undefined });
  if (u && u !== c) out.push({ ...base, timestamp: u });
  return out;
}

/** Touch a session's span from any message so "running" and last-activity stay right. */
const touch = (sessionId: string, ts: string, ctx: SourceCtx): NormalizedRecord => ({
  kind: 'session', id: sid(sessionId), harness: H, nativeId: sessionId, sourceRef: ctx.file, timestamp: ts,
});

function usage(messageId: string, sessionId: string, ts: string, model: string | undefined, provider: string | undefined, tokens: Tokens | undefined, cost: unknown): NormalizedRecord[] {
  if (!tokens || !model) return [];
  const t = {
    inputTokens: tokens.input ?? 0, outputTokens: tokens.output ?? 0,
    cacheReadTokens: tokens.cache?.read ?? 0, cacheWriteTokens: tokens.cache?.write ?? 0,
  };
  if (t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens === 0) return [];
  // OpenCode reports cost per message. Zero means "not billed per token" (e.g. a subscription
  // provider), so fall back to the API-equivalent price instead of showing $0.
  const reported = typeof cost === 'number' && cost > 0 ? cost : undefined;
  return [{
    kind: 'usage', id: `${H}:${messageId}`, sessionId: sid(sessionId), messageId: `${H}:${messageId}`, timestamp: ts,
    provider, model, ...t, reasoningTokens: tokens.reasoning ?? 0,
    ...(reported !== undefined ? { costUsd: reported, costSource: 'reported' as const } : {}),
  }];
}

function toolStatus(s: unknown): 'ok' | 'error' | 'pending' | 'unknown' {
  if (s === 'completed') return 'ok';
  if (s === 'error') return 'error';
  if (s === 'pending' || s === 'running' || s === 'streaming') return 'pending';
  return 'unknown';
}

function contentText(c: unknown): string | undefined {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return undefined;
  const t = c.map((b: Obj) => (b?.type === 'text' ? str(b.text) ?? '' : '')).filter(Boolean).join('\n');
  return t || undefined;
}

const toolName = (n: string) => n.toLowerCase();

/* ---------- v2 (session_v2 / session_message / session_part) ---------- */

function v2Content(part: Obj, messageId: string, ordinal: number, sessionId: string, ts: string): NormalizedRecord[] {
  if (part.type === 'text' && str(part.text)) {
    return [{ kind: 'message', id: `${H}:${messageId}:${ordinal}`, sessionId: sid(sessionId), role: 'assistant', timestamp: ts, text: str(part.text) }];
  }
  if (part.type === 'tool' && str(part.id) && str(part.name)) {
    const state = (part.state ?? {}) as Obj;
    const time = (part.time ?? {}) as Obj;
    const err = state.error as Obj | undefined;
    const output = contentText(state.content) ?? (err ? str(err.message) ?? JSON.stringify(err) : undefined);
    return [{
      kind: 'tool_call', id: `${H}:${part.id}`, sessionId: sid(sessionId), messageId: `${H}:${messageId}`,
      name: toolName(str(part.name)!), nativeName: str(part.name)!,
      input: state.input === undefined ? undefined : clip(typeof state.input === 'string' ? state.input : JSON.stringify(state.input)),
      output: output ? clip(output) : undefined, status: toolStatus(state.status),
      startedAt: iso(time.ran) ?? iso(time.created) ?? ts, endedAt: iso(time.completed),
    }];
  }
  return [];
}

function v2Message(row: Obj, ctx: SourceCtx): NormalizedRecord[] {
  const id = String(row.id);
  const sessionId = String(row.session_id);
  const data = json(row.data);
  const ts = iso(row.time_created) ?? iso((data.time as Obj | undefined)?.created) ?? new Date(0).toISOString();
  const out: NormalizedRecord[] = [touch(sessionId, iso(row.time_updated) ?? ts, ctx)];
  const model = data.model as { id?: string; providerID?: string } | undefined;
  switch (row.type) {
    case 'user': {
      const text = str(data.text);
      if (text) {
        out.push({ kind: 'message', id: `${H}:${id}`, sessionId: sid(sessionId), role: 'user', timestamp: ts, text });
        out.push({ kind: 'session', id: sid(sessionId), harness: H, nativeId: sessionId, sourceRef: ctx.file, timestamp: ts, title: { text: text.split('\n')[0]!.slice(0, 120), rank: 1 } });
      }
      break;
    }
    case 'assistant': {
      (Array.isArray(data.content) ? (data.content as Obj[]) : []).forEach((p, i) => out.push(...v2Content(p, id, i, sessionId, ts)));
      out.push(...usage(id, sessionId, ts, model?.id, model?.providerID, data.tokens as Tokens, data.cost));
      break;
    }
    case 'compaction': {
      const summary = str(data.summary);
      if (summary) out.push({ kind: 'message', id: `${H}:${id}`, sessionId: sid(sessionId), role: 'system', timestamp: ts, text: summary });
      out.push(...usage(id, sessionId, ts, model?.id, model?.providerID, data.tokens as Tokens, data.cost));
      break;
    }
  }
  return out;
}

/* ---------- v1 (session / message / part rows, and the JSON-file layout) ---------- */

function v1Message(m: Obj, ctx: SourceCtx): NormalizedRecord[] {
  const id = str(m.id);
  const sessionId = str(m.sessionID);
  if (!id || !sessionId) return [];
  const time = (m.time ?? {}) as Obj;
  const ts = iso(time.created) ?? new Date(0).toISOString();
  const out: NormalizedRecord[] = [touch(sessionId, iso(time.completed) ?? ts, ctx)];
  if (m.role === 'assistant') {
    out.push(...usage(id, sessionId, ts, str(m.modelID), str(m.providerID), m.tokens as Tokens, m.cost));
  }
  return out;
}

function v1Part(p: Obj, role: unknown, ctx: SourceCtx): NormalizedRecord[] {
  const id = str(p.id);
  const sessionId = str(p.sessionID);
  const messageId = str(p.messageID);
  if (!id || !sessionId || !messageId) return [];
  if (p.type === 'text' && str(p.text) && !p.synthetic) {
    const time = (p.time ?? {}) as Obj;
    const ts = iso(time.start) ?? new Date(0).toISOString();
    const r = role === 'user' ? 'user' : 'assistant';
    const out: NormalizedRecord[] = [{ kind: 'message', id: `${H}:${messageId}:${id}`, sessionId: sid(sessionId), role: r, timestamp: ts, text: str(p.text) }];
    if (r === 'user') out.push({ kind: 'session', id: sid(sessionId), harness: H, nativeId: sessionId, sourceRef: ctx.file, timestamp: ts, title: { text: str(p.text)!.split('\n')[0]!.slice(0, 120), rank: 1 } });
    return out;
  }
  if (p.type === 'tool' && str(p.callID) && str(p.tool)) {
    const state = (p.state ?? {}) as Obj;
    const time = (state.time ?? {}) as Obj;
    const output = str(state.output) ?? str(state.error);
    return [{
      kind: 'tool_call', id: `${H}:${p.callID}`, sessionId: sid(sessionId), messageId: `${H}:${messageId}`,
      name: toolName(str(p.tool)!), nativeName: str(p.tool)!,
      input: state.input === undefined ? undefined : clip(JSON.stringify(state.input)),
      output: output ? clip(output) : undefined, status: toolStatus(state.status),
      startedAt: iso(time.start), endedAt: iso(time.end),
    }];
  }
  return [];
}

export function transformRow(raw: { table: string; row: Obj }, ctx: SourceCtx): NormalizedRecord[] {
  const { table, row } = raw;
  switch (table) {
    case 'session_v2':
    case 'session':
      return session(String(row.id), ctx, { created: row.time_created, updated: row.time_updated, directory: row.directory, title: row.title, parent: row.parent_id });
    case 'session_message':
      return v2Message(row, ctx);
    case 'session_part': {
      const data = json(row.data);
      return v2Content(data, String(row.message_id), Number(row.ordinal), String(row.session_id), iso(row.time_created) ?? new Date(0).toISOString());
    }
    case 'message':
      return v1Message({ ...json(row.data), id: row.id, sessionID: row.session_id }, ctx);
    case 'part':
      return v1Part({ ...json(row.data), id: row.id, messageID: row.message_id, sessionID: row.session_id }, row.role, ctx);
    default:
      return [];
  }
}

/* ---------- JSON-file layout: storage/{session,message,part}/<group>/<id>.json ---------- */

const roleCache = new Map<string, string | undefined>();

function roleOf(root: string, sessionId: string, messageId: string): string | undefined {
  const key = `${sessionId}/${messageId}`;
  if (roleCache.has(key)) return roleCache.get(key);
  let role: string | undefined;
  try {
    role = str(json(readFileSync(path.join(root, 'storage', 'message', sessionId, `${messageId}.json`), 'utf8')).role);
  } catch {
    role = undefined;
  }
  if (roleCache.size > 5000) roleCache.clear();
  roleCache.set(key, role);
  return role;
}

export function transformJsonFile(raw: unknown, ctx: SourceCtx): NormalizedRecord[] {
  const kind = path.relative(ctx.root, ctx.file).split(path.sep)[1];
  const o = raw as Obj;
  if (kind === 'session') {
    const time = (o.time ?? {}) as Obj;
    return str(o.id) ? session(str(o.id)!, ctx, { created: time.created, updated: time.updated, directory: o.directory, title: o.title, parent: o.parentID }) : [];
  }
  if (kind === 'message') return v1Message(o, ctx);
  if (kind === 'part') return v1Part(o, roleOf(ctx.root, str(o.sessionID) ?? '', str(o.messageID) ?? ''), ctx);
  return [];
}
