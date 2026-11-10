import type { NormalizedRecord } from '@tycho/core';

export interface SourceCtx {
  /** Absolute path of the file being read. */
  file: string;
  /** Root the file was discovered under. */
  root: string;
}

/**
 * Declarative description of a harness. The ingest engine knows nothing harness-specific:
 * it discovers files from `discover`, reads them with `reader`, and hands each raw record to `transform`.
 */
export interface AdapterSpec {
  harness: string;
  displayName: string;
  discover: {
    /** Candidate roots per OS. `~` and `$VAR` are expanded; missing roots are skipped. */
    roots: Partial<Record<NodeJS.Platform, string[]>> & { default?: string[] };
    /** Override from an env var (e.g. CLAUDE_CONFIG_DIR), joined with `envSuffix`. Comma-separated values allowed. */
    env?: { name: string; suffix: string };
    /** File-name test applied while walking each root. */
    match: (relPath: string) => boolean;
  };
  reader: 'jsonl' | 'json-tree' | 'sqlite-kv' | 'sqlite-table';
  watch: { mode: 'append' | 'mtime'; debounceMs: number };
  /** Called once per file before its records, for per-file context (e.g. session id from the path). */
  transform: (raw: unknown, ctx: SourceCtx) => NormalizedRecord[];
}
