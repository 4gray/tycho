# Tycho — Handover

> Tycho Brahe recorded the raw observations that Kepler later turned into laws.
> Tycho does the same for coding agents: it quietly records what every harness did and makes it analyzable.

## 1. What we're building

A **local-only Electron desktop app** that gives one unified view across all AI coding harnesses on the machine (Claude Code, OpenCode, Cursor, and more later):

- **Chats**: every session and message, searchable across harnesses
- **Tool calls**: what was called, with which input, result, duration and failures
- **Tokens and cost**: input, output, cache read and cache write, by model, with cost per session, project and day
- **Past and live**: backfill all existing history on first run, then update live while agents run

## 2. Non-negotiable principles

1. **Harness-agnostic, zero-touch.** Nothing is installed or configured inside any harness: no plugins, hooks or env vars required. Tycho only *reads* what harnesses already write to disk.
2. **Read-only toward harnesses.** Never write to, lock or migrate a harness's files. Open SQLite sources with `mode=ro`, or snapshot-copy them.
3. **Local-only.** No data leaves the machine. Transcripts contain secrets and customer data. Network access is optional and limited to refreshing the price table.
4. **Declarative adapters.** The core knows only the normalized model. Each harness is described by an adapter *spec* (discovery paths, reader type, field mappings), plus a small code escape hatch where a spec can't express the mapping. Adding a harness should mostly mean adding config, not changing the engine.
5. **Cost provenance is explicit.** Every cost carries `reported | computed | estimated`. Never present an estimate as exact.

## 3. Tech stack

| Concern | Choice |
|---|---|
| Shell | Electron, scaffolded with Electron Forge (Vite + TypeScript template) |
| Language | TypeScript, strict mode, everywhere |
| UI | React plus ECharts (or Recharts), Tailwind optional |
| DB | SQLite via `better-sqlite3` (rebuild for Electron; Forge handles this), FTS5 for search |
| File watching | `chokidar` |
| Schema / validation | `zod` for adapter specs and parsed records |
| Tests | `vitest`, with fixture files per harness |

Process model:

- **Main process**: owns the DB, the adapter registry and the watchers, and pushes events to the renderer.
- **`utilityProcess`**: runs the initial backfill and heavy parsing so the UI never blocks.
- **Renderer**: talks to main only through a typed `contextBridge` preload API (`contextIsolation: true`, `nodeIntegration: false`).
- **Tray / menu-bar item**: shows today's cost and active sessions.

## 4. Repo layout

```
tycho/
  apps/desktop/            electron main, preload, renderer (React)
  packages/core/           normalized model, zod schemas, pricing, cost calc
  packages/adapters/       one folder per harness: spec.ts (+ optional transform.ts) + fixtures/
  packages/ingest/         discovery, watchers, readers (jsonl/json/sqlite), offsets, dedupe, db writer
  packages/db/             migrations, queries
  HANDOVER.md
```

## 5. Normalized data model

```ts
type Harness = 'claude-code' | 'opencode' | 'cursor' | string;

interface Session {
  id: string;               // `${harness}:${nativeId}`
  harness: Harness;
  nativeId: string;
  projectPath?: string;     // cwd / workspace folder
  title?: string;
  startedAt: string;        // ISO
  updatedAt: string;
  parentSessionId?: string; // subagents / sidechains
  sourceRef: string;        // file path or db key it came from
}

interface Message {
  id: string;               // stable, dedupe key
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  timestamp: string;
  model?: string;
  text?: string;            // flattened text for display + FTS
  raw?: string;             // original JSON (optional, compressed) for debugging
  isSidechain?: boolean;
}

interface ToolCall {
  id: string;               // native tool_use id where available
  sessionId: string;
  messageId: string;
  name: string;             // normalized lowercase (e.g. "bash", "edit", "read")
  nativeName: string;
  input?: string;           // JSON
  output?: string;          // truncated
  status: 'ok' | 'error' | 'pending' | 'unknown';
  startedAt?: string;
  endedAt?: string;
}

interface UsageEvent {
  id: string;               // dedupe key (e.g. messageId + requestId)
  sessionId: string;
  messageId?: string;
  timestamp: string;
  provider?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens?: number;
  costUsd?: number;
  costSource: 'reported' | 'computed' | 'estimated';
}
```

Also persist `ingest_state(sourceRef, kind, offset | lastKey | mtime, updatedAt)` so restarts are incremental.

## 6. Adapter spec (declarative)

```ts
interface AdapterSpec {
  harness: Harness;
  displayName: string;
  discover: {                       // per-OS candidate roots; globs relative to root
    darwin?: string[]; linux?: string[]; win32?: string[];
    globs: string[];
  };
  reader: 'jsonl' | 'json-tree' | 'sqlite-kv' | 'sqlite-table';
  watch: { mode: 'append' | 'mtime'; debounceMs: number };
  map: {                            // JSON-path-ish selectors into a raw record
    sessionId: string; messageId: string; timestamp: string;
    role?: string; model?: string; usage?: Record<string, string>;
    // ...
  };
  transform?: (raw: unknown, ctx: Ctx) => NormalizedRecord[]; // escape hatch
}
```

Readers are generic (`jsonl` tails from a byte offset; `sqlite-*` opens read-only and diffs by key or rowid). Adapters are specs plus an optional `transform`.

## 7. Harness notes

> ⚠️ **None of these formats are documented or stable.** Before writing each adapter, inspect real files on the machine, save anonymized samples as `fixtures/`, and write the tests first. Treat everything below as a starting hypothesis.

### Claude Code (start here: richest and most reliable data)
- **Location:** `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` (respect `CLAUDE_CONFIG_DIR` if set).
- **One JSON object per line.** Expected fields: `type`, `uuid`, `parentUuid`, `sessionId`, `timestamp`, `cwd`, `gitBranch`, `isSidechain`, `requestId`, `message`.
- **Assistant `message`:** `id`, `model`, `content[]` (blocks `text`, `thinking`, `tool_use{id,name,input}`), `usage{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`.
- **Tool results:** arrive in later `user` lines as `tool_result{tool_use_id, content, is_error}`. Join them on `tool_use_id`.
- **Dedupe:** one API response can appear on several lines. Dedupe usage on `message.id + requestId`, the same rule ccusage uses.
- **Cost:** not reported in the files, so compute it from the price table (`computed`).
- **Watch:** append mode, using byte offsets. Handle partial last lines by buffering until a newline arrives.

### OpenCode
- **Location (verify):** `~/.local/share/opencode/storage/` (XDG data dir) with `session/`, `message/<sessionID>/`, `part/<messageID>/` JSON files. Newer versions may use a SQLite DB instead, so detect both.
- **Messages:** expected to carry `modelID`, `providerID`, `tokens{input, output, reasoning, cache{read, write}}` and `cost`. Use `cost` as `reported` when present.
- **Tool calls:** parts with `type: "tool"`, containing `tool` and `state{status, input, output, time}`.
- **Watch:** mtime and new-file events (`json-tree` reader).

### Cursor (hardest: build last)
- **Location (macOS):** `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`. Linux: `~/.config/Cursor/...`. Windows: `%APPDATA%\Cursor\...`.
- **Data:** table `cursorDiskKV`, with keys like `composerData:<composerId>` (conversation metadata and order) and `bubbleId:<composerId>:<bubbleId>` (individual messages). Workspace mapping is in `workspaceStorage/<hash>/state.vscdb` (`ItemTable`).
- **Constraints:**
  - Cursor holds the DB open and writes to it constantly, and the file can be many GB. Open it with `file:...?mode=ro` (or `immutable=1` on a snapshot copy) and never write.
  - Poll on mtime with a long debounce (≥5s), and diff by key.
- **Tokens:** often missing or zero. Model calls go through Cursor's backend, so mark cost as `estimated` (from token counts if present, otherwise none). Show a "Cursor cost is approximate" badge.
- **Schema drift:** expect breakage between Cursor versions. The adapter must fail soft: log it, mark the source unhealthy in the UI, and keep everything else working.

## 8. Ingestion pipeline

1. **Discover** sources for each enabled adapter, and re-scan periodically (new projects appear).
2. **Backfill** in the `utilityProcess`, in batches, streaming progress to the UI.
3. **Watch** sources: append-tail for JSONL, mtime diff for JSON trees and SQLite.
4. **Normalize** each record to `Session / Message / ToolCall / UsageEvent` and validate with zod. Invalid records are logged and skipped, never fatal.
5. **Upsert** idempotently on stable IDs, so re-ingesting the same file never double-counts.
6. **Emit** live events to the renderer (throttled to roughly 4–10 Hz).

## 9. Pricing

- Bundle a snapshot of LiteLLM's `model_prices_and_context_window.json` in the app. An optional "refresh prices" button fetches the latest; this is the app's only network call.
- Model-name aliasing: normalize dated or suffixed model IDs to price keys, and allow user overrides in settings.
- Cost = input × in-price + output × out-price + cache-write × cache-write-price + cache-read × cache-read-price.
- Label it **"API-equivalent cost"**: on subscription plans the user isn't billed per token.

## 10. UI (v1)

- **Overview:**
  - today, 7-day and 30-day cost
  - cost over time, stacked by harness
  - cost by model
  - cache-read share
- **Sessions:** a list filterable by harness, project, model and date, with columns for cost, tokens and tool-call count.
- **Session detail:**
  - the transcript
  - a tool-call timeline (Gantt-style)
  - per-turn token bars
- **Tools:** top tools by count, error rate and average duration, per harness.
- **Search:** FTS5 across all messages.
- **Sources:** each discovered harness and path, with health status, last ingest and record counts.
- **Tray:** today's cost, live session count, and a click to open.

## 11. Milestones

1. **M0 scaffold:** Forge + TS + React, typed preload API, SQLite and migrations, empty dashboard.
2. **M1 Claude Code:** backfill, live tail, dedupe, pricing, the Sessions and Session-detail views. *Done when the totals match `npx ccusage` for the same period.*
3. **M2 OpenCode adapter:** handles both storage variants, and its reported cost is used.
4. **M3 Overview, Tools and Search views, plus the tray.**
5. **M4 Cursor adapter:** read-only, fails soft, estimated cost.
6. **M5 (optional) "Precise mode" local proxy:**
   - An opt-in proxy on `127.0.0.1` for harnesses that support a custom base URL (`ANTHROPIC_BASE_URL`, OpenCode provider `baseURL`). It parses Anthropic and OpenAI wire formats and merges with file data by message ID or timestamp.
   - This step requires user config, so it's never the default. It doesn't work for Cursor.

## 12. Gotchas checklist

- [ ] Partial JSONL lines while a harness is still writing
- [ ] File rotation or truncation: if a file shrinks, reset its offset
- [ ] Subagents and sidechains: link them to the parent and don't double-count them in parent totals
- [ ] Context compaction or summary entries: don't count these as user messages
- [ ] Large tool outputs: truncate before storing, keep a hash, and optionally a pointer to the source
- [ ] Huge Cursor DB: never load it fully, query by key prefix
- [ ] Timezones: store UTC and render in local time
- [ ] Privacy: optional redaction of secrets (API keys, tokens) before FTS indexing

## 13. Open questions for the owner

- Ship publicly, or keep it personal? This decides signing and notarization and any name clash checks for "Tycho".
- Store full raw records, or normalized data only? This trades disk use against debuggability.
- Which harness comes after Cursor (Codex CLI, Gemini CLI, Aider, Copilot)? The declarative spec should make these cheap.
