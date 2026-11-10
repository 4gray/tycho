import Database from 'better-sqlite3';
import { migrate } from './migrate';

export { migrate, MIGRATIONS } from './migrate';
export * as queries from './queries';

export function openDb(file: string): Database.Database {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
