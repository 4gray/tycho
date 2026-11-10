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
  reader: 'jsonl' | 'json-tree' | 'sqlite-table';
  /**
   * For `sqlite-table`: tables to read incrementally. Each query receives `@cursor` (the highest
   * cursor value seen so far, initially 0) and must return a `cursor` column. Rows are re-read when
   * their cursor ties, so transforms must be idempotent. Queries whose tables are missing are skipped.
   */
  sqlite?: { tables: { name: string; requires: string[]; sql: string }[] };
  watch: { mode: 'append' | 'mtime'; debounceMs: number };
  /**
   * Map one raw record to normalized records.
   * - jsonl: one parsed line
   * - json-tree: the parsed file
   * - sqlite-table: `{ table, row }` where `table` is the configured name
   */
  transform: (raw: unknown, ctx: SourceCtx) => NormalizedRecord[];
}
