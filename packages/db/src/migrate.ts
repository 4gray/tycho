import type BetterSqlite3 from 'better-sqlite3';
import init001 from './migrations/001_init.sql?raw';

/** Ordered list. Never edit a shipped migration; append a new one. */
export const MIGRATIONS: string[] = [init001];

export function migrate(db: BetterSqlite3.Database, migrations = MIGRATIONS): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return migrations.length;
}
