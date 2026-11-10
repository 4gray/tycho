import path from 'node:path';
import type { AdapterSpec } from '../types';
import { transformJsonFile, transformRow } from './transform';

const ROOTS = { default: ['$XDG_DATA_HOME/opencode', '~/.local/share/opencode'] };

/**
 * OpenCode (current and older releases) keeps everything in SQLite:
 *  - v2: session_v2 / session_message / session_part (assistant content lives in parts)
 *  - v1: session / message / part with JSON `data`
 * Both can coexist mid-migration; they share ids, so upserts collapse them.
 */
export const opencode: AdapterSpec = {
  harness: 'opencode',
  displayName: 'OpenCode',
  discover: {
    roots: ROOTS,
    match: (rel) => /^opencode(-[\w.-]+)?\.db$/.test(rel),
  },
  reader: 'sqlite-table',
  watch: { mode: 'mtime', debounceMs: 2000 },
  sqlite: {
    tables: [
      { name: 'session_v2', requires: ['session_v2.time_updated'], sql: `SELECT *, time_updated AS cursor FROM session_v2 WHERE time_updated >= @cursor` },
      {
        name: 'session_message',
        requires: ['session_message.time_updated'],
        sql: `SELECT *, time_updated AS cursor FROM session_message WHERE time_updated >= @cursor ORDER BY seq`,
      },
      {
        name: 'session_part',
        requires: ['session_part.time_updated'],
        sql: `SELECT *, time_updated AS cursor FROM session_part WHERE time_updated >= @cursor ORDER BY message_id, ordinal`,
      },
      { name: 'session', requires: ['session.time_updated', 'session.directory'], sql: `SELECT *, time_updated AS cursor FROM session WHERE time_updated >= @cursor` },
      {
        name: 'message',
        requires: ['message.time_updated', 'message.data'],
        sql: `SELECT *, time_updated AS cursor FROM message WHERE time_updated >= @cursor`,
      },
      {
        name: 'part',
        requires: ['part.time_updated', 'part.data', 'message.data'],
        // v1 parts do not carry their message's role; join it in so text parts are attributed correctly.
        sql: `SELECT p.*, json_extract(m.data, '$.role') AS role, p.time_updated AS cursor
              FROM part p LEFT JOIN message m ON m.id = p.message_id WHERE p.time_updated >= @cursor`,
      },
    ],
  },
  transform: (raw, ctx) => transformRow(raw as { table: string; row: Record<string, unknown> }, ctx),
};

/** The oldest OpenCode releases wrote one JSON file per session, message and part under `storage/`. */
export const opencodeJson: AdapterSpec = {
  harness: 'opencode',
  displayName: 'OpenCode (JSON storage)',
  discover: {
    roots: ROOTS,
    match: (rel) => {
      const p = rel.split(path.sep);
      return p[0] === 'storage' && ['session', 'message', 'part'].includes(p[1] ?? '') && rel.endsWith('.json') && p.length === 4;
    },
  },
  reader: 'json-tree',
  watch: { mode: 'mtime', debounceMs: 1000 },
  transform: (raw, ctx) => transformJsonFile(raw, ctx),
};
