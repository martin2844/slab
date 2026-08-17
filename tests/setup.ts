import { beforeAll, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setDb, resetDb } from '../src/db/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readdirSync(path.join(__dirname, '../src/db/migrations'))
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => fs.readFileSync(path.join(__dirname, '../src/db/migrations', file), 'utf-8'))
  .join('\n');

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  setDb(db);
});

beforeEach(() => {
  // Drop all tables and re-run migration for clean state
  db.exec(`
    DROP TABLE IF EXISTS history;
    DROP TABLE IF EXISTS issue_links;
    DROP TABLE IF EXISTS comments;
    DROP TABLE IF EXISTS issues;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS migrations;
  `);
  db.exec(MIGRATION_SQL);
});

afterAll(() => {
  db.close();
  resetDb();
});
