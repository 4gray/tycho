# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Electron (Forge, Vite + TypeScript template), React renderer, SQLite via better-sqlite3 with FTS5, chokidar, zod, vitest. Monorepo: apps/desktop, packages/{core,adapters,ingest,db}. See HANDOVER.md.

## Users
A developer who runs several AI coding harnesses (Claude Code, OpenCode, Cursor, more later) on one machine. Personal use first; public release later. Four jobs, all confirmed: glance at spend (often from the tray), dig into what an agent did in a session, find a past chat across harnesses, and compare harnesses/models on cost and reliability.

## Product Purpose
One local view of every coding-agent session on the machine: chats, tool calls, tokens and API-equivalent cost, backfilled from history and updated live. Success: totals match `npx ccusage` for Claude Code, and any past session is findable and replayable in seconds.

## Positioning
Zero-touch and harness-agnostic: it only reads what harnesses already write to disk. No plugins, hooks, env vars, or proxies by default. Cross-harness in one model, which single-harness tools cannot offer.

## Operating Context
Opened beside an editor and terminal during or after agent runs. Tray item shows today's cost and live sessions. Long sessions, large tool outputs, many projects.

## Capabilities and Constraints
- Read-only toward harness files; SQLite sources opened `mode=ro` or snapshot-copied.
- Local-only; the only network call is optional price-table refresh.
- Every cost carries provenance: reported | computed | estimated. Labeled "API-equivalent cost". Never present estimates as exact.
- Raw records stored gzipped alongside normalized data (decided) for debugging adapter drift.
- Adapters fail soft; an unhealthy source is surfaced, never fatal.
- Undecided: harness after Cursor; signing/notarization deferred until public release; name-clash check for "Tycho" deferred.

## Brand Commitments
Name "Tycho", after Tycho Brahe, the observer whose raw records Kepler turned into laws. The product records; the user draws conclusions.

## Evidence on Hand
No real screenshots, users, or benchmarks yet. Do not fabricate testimonials or numbers.

## Product Principles
1. Observe, never interfere.
2. Truth over polish: provenance and uncertainty are always visible.
3. Fast to glance, deep on demand.
4. Private by default; transcripts contain secrets.
5. New harnesses are config, not engine changes.
