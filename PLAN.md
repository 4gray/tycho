# Tycho: implementation plan

Source of truth for scope: [HANDOVER.md](HANDOVER.md). Product facts: [PRODUCT.md](PRODUCT.md). Visual direction: "flight strips", prototyped in [design/prototype/index.html](design/prototype/index.html).

## Decisions taken
- Personal first, public later: no signing or notarization until a public release.
- Store raw records gzipped next to normalized rows (`raw BLOB`), so adapter drift can be debugged and re-normalized without re-reading source files.
- UI world: each session is a flight progress strip. Harness = holder colour. Cost always shows a provenance stamp (R/C/E).

## Repo setup (M0, ~2 days)
- npm workspaces (Forge handles native modules more reliably than with pnpm): `apps/desktop`, `packages/{core,db,ingest,adapters}`.
- `apps/desktop`: Electron Forge, Vite + TypeScript template, React 19, strict TS. `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer.
- `better-sqlite3` lives in main/utility only. Forge's `@electron-forge/plugin-auto-unpack-natives` plus `electron-rebuild` handle the native module.
- Typed IPC: one `api.ts` contract in `packages/core` (zod schemas for each request/response) exposed by preload as `window.tycho`. Main validates every call.
- `packages/db`: numbered SQL migrations run at startup in a transaction. Tables: `sessions`, `messages`, `tool_calls`, `usage_events`, `ingest_state`, `sources`, `prices`, plus `messages_fts` (FTS5, external-content on `messages.text`, kept in sync by triggers). WAL mode. Indexes on `(session_id)`, `(timestamp)`, `(model)`.
- Empty Rack view from the prototype ported to React components (`Strip`, `Tape`, `Readout`, `Rack`).

## Ingestion engine (M1 core)
Process layout (as built in M1):
- **Main**: migrates the DB on startup, then only reads. Serves IPC queries, owns the tray, and forwards change events to the renderer at most ~4 times a second.
- **utilityProcess `ingest-worker`**: the single writer. Runs discovery, backfill and the chokidar watchers, and writes batches in one transaction per chunk together with the file offset. It reports progress and changes to main over `parentPort`. Having only one writer avoids SQLITE_BUSY with no extra coordination.

Pipeline per source:
1. `discover(spec)` expands per-OS roots and globs, honoring `CLAUDE_CONFIG_DIR`. Re-runs every 60s.
2. Reader by spec type:
   - `jsonl`: open, seek to the stored byte offset, read in chunks, split on `\n`, and keep the trailing partial line in a buffer. If the file is now smaller than the offset, reset to 0 (truncation or rotation).
   - `json-tree`: walk the directory, compare mtimes against `ingest_state`, and re-read only changed files.
   - `sqlite-kv` / `sqlite-table`: open `file:…?mode=ro` (snapshot copy plus `immutable=1` if locked). Diff by key prefix or rowid, and never `SELECT *` over the whole table.
3. Adapter `map` / `transform` produces `NormalizedRecord[]`. Each record is validated with zod; failures are logged to `source_errors` and skipped.
4. Upsert with `INSERT … ON CONFLICT(id) DO UPDATE`. Usage dedupe key for Claude Code: `message.id + requestId`.
5. After the batch commits, `ingest_state` is updated in the same transaction, so a crash never skips data.
6. Post-pass joins `tool_result` to `tool_use` by id, sets status and duration, and truncates output to 8 KB plus a sha256.

Adapter health: each source carries `ok | degraded | failing`, with last error and skip count. A throwing adapter never stops the others.

## Pricing (M1)
- Bundle a trimmed LiteLLM snapshot (`packages/core/src/pricing/litellm-snapshot.json`; refresh with `npm run prices`).
- `normalizeModel()` strips date and suffix variants and applies user aliases from settings.
- Cost is computed at write time and stored. 1-hour cache writes use LiteLLM's `cache_creation_input_token_cost_above_1hr`, and the 200k tier is applied. A price refresh will need a re-cost pass (planned with the refresh button). `reported` cost (OpenCode) is stored and wins. Cursor gets `estimated`.
- Verified on 2026-11-10: every completed day matches `ccusage daily` to the cent. Acceptance test: Claude Code totals match `npx ccusage daily --json` for the same date range (vitest integration test against a fixture dir plus a manual check on the real machine).

## Adapters
| Milestone | Harness | Reader | Notes |
|---|---|---|---|
| M1 | claude-code | jsonl, append | sidechains → `parentSessionId`; skip summary/compaction lines as user messages |
| M2 | opencode | sqlite-table (v2 + v1 tables) and json-tree (oldest `storage/`) | built from OpenCode's source (not installed on the dev machine); `cost` > 0 → `reported`, `cost` = 0 → computed API-equivalent; v1/v2 copies share ids and collapse |
| M4 | cursor | sqlite-table over `cursorDiskKV` key ranges, 5s debounce | verified on a real 6.5 GB store: 1,118 chats, 34k messages, 64k tool calls; first backfill ~40 s, incremental 150–500 ms. Fields are pulled with `json_extract` so 2.1 GB of bubble blobs never reach JS. Tokens are almost never recorded (21 of 40k bubbles), so Cursor cost appears only from bubble tokens or Cursor's own `usageData`, always `estimated`; chats with neither show “—”, not $0. |

Per adapter: inspect real files first, copy anonymized samples into `packages/adapters/<h>/fixtures/`, write the vitest expectations, then write `spec.ts` (+ `transform.ts`).

## UI (renderer)
Routes are a simple state machine, no router needed: Rack (overview), Sessions, Session (full transcript), Tools, Search, Sources, Settings.
- Data via `window.tycho.query.*` with TanStack Query; live events invalidate the matching keys.
- Sessions list virtualized (`@tanstack/react-virtual`): a strip is a fixed 52px row.
- Tape (Gantt) and charts as hand-written SVG to match the strip world. ECharts only if a chart truly needs it.
- Search: FTS5 `bm25()` ranking, `snippet()` for highlights, filters by harness, project, and date.
- Tray: `Tray` with `setTitle('$9.93')` on macOS, refreshed on each usage-event batch; the menu lists live sessions.
- Fonts (Barlow, Barlow Condensed, JetBrains Mono) self-hosted under `apps/desktop/src/renderer/fonts`, so there are no network calls.

## Milestones
1. **M0 scaffold**: repo, Forge, preload API, migrations, React shell with the Rack layout on empty data.
2. **M1 Claude Code**: worker backfill with progress, live tail, dedupe, pricing, Rack, Sessions, and Tape. Done when totals match ccusage.
3. **M2 OpenCode**: both storage variants, reported cost.
4. **M3 Overview charts, Tools, Search, tray.**
5. **M4 Cursor**: read-only, degraded-health UI, estimated badge.
6. **M5 (optional) precise-mode proxy.**

## M3 notes (as built)
- Secret redaction is on by default (`packages/core/src/redact.ts`): known token formats, `KEY=value` assignments, URL passwords and private keys are masked before text is stored or indexed. A one-time pass (`REDACTION_VERSION`) re-scans rows stored earlier.
- Search quotes every word as an FTS5 prefix term, so user input can never be FTS syntax. Snippet markers are rendered as `<mark>` elements, never as HTML.
- Tray: a template icon plus today's cost as the title. The menu lists running sessions, and clicking one opens it in the window.

## Known limits after M4
- Fixed: the first Cursor backfill used to block the worker for ~40 s. It now yields after every 500-row batch: the longest event-loop stall is ~280 ms (p95 ~190 ms), peak RSS is ~190 MB, total time is unchanged (~39 s). Watchers start before any backfill, and concurrent reads of one source are coalesced.
- The session list query takes ~170 ms with 1.1k sessions. Precomputed per-session rollups are the next step if it grows.

## Testing
- Unit: every adapter against its fixtures; readers against partial lines, truncation, and duplicates; cost math.
- Integration: ingest a fixture tree twice and assert identical row counts (idempotency).
- E2E: Playwright `_electron` smoke test that opens the app on a fixture `HOME` and sees strips.

## Still open
- Which harness after Cursor (Codex CLI is the likely cheapest; it writes JSONL).
- DESIGN.md is written from the real React build at the end of M1, not from the prototype.

## Releasing
- **CI** (`.github/workflows/ci.yml`): on pushes to `master` and on PRs, runs typecheck, tests and `npm run package` on macOS, Windows and Linux, and checks the packaged app ships the SQLite driver.
- **Release** (`.github/workflows/release.yml`): bump `apps/desktop/package.json` `version`, commit, then tag and push, e.g. `git tag v0.1.1 && git push origin v0.1.1`.
  - The build fails if the tag doesn't match the version.
  - It builds macOS arm64 and x64 zips, the Windows Squirrel installer and the Linux `.deb`/`.rpm`, writes `SHA256SUMS.txt`, and creates a **draft** GitHub Release. `v0.x` and `-suffix` tags are marked pre-release. Review the draft, then publish it by hand.
- Builds are unsigned. Signing and notarization are the next step (Apple Developer ID, a Windows code-signing certificate).
