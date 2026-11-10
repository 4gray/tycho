import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC } from '@tycho/core';
import { queries } from '@tycho/db';
import type BetterSqlite3 from 'better-sqlite3';

const SessionsQuery = z
  .object({
    harness: z.string().max(64).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .default({});

/** Every channel validates its input in main; the renderer is never trusted. */
export function registerIpc(db: BetterSqlite3.Database): void {
  ipcMain.handle(IPC.overview, () => queries.overview(db));
  ipcMain.handle(IPC.sessions, (_e, q: unknown) => queries.sessions(db, SessionsQuery.parse(q)));
  ipcMain.handle(IPC.sources, () => queries.sources(db));
}
