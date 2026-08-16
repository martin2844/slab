import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DB_PATH = process.env.TRACKER_DB_PATH || path.join(__dirname, '../../slab.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH, { timeout: 5_000 });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');
    _db.pragma('synchronous = NORMAL');
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

export function closeDb(): void {
  if (_db?.open) _db.close();
  _db = null;
}
