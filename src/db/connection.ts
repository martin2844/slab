import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.TRACKER_DB_PATH || path.join(__dirname, '../../slab.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

/** Set the DB instance directly — used by tests to inject an in-memory database */
export function setDb(db: Database.Database): void {
  _db = db;
}

/** Reset the DB singleton — used by tests for cleanup */
export function resetDb(): void {
  _db = null;
}
