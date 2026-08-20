import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../src/db/connection.js';
import { getMigrationStatus, runMigrations } from '../src/db/migrate.js';

const migrationsDirectory = fileURLToPath(
  new URL('../src/db/migrations/', import.meta.url),
);

function requireMigration(filename: string) {
  return fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8');
}

function resetToUnmigratedDatabase() {
  getDb().exec(`
    DROP TABLE IF EXISTS history;
    DROP TABLE IF EXISTS issue_links;
    DROP TABLE IF EXISTS comments;
    DROP TABLE IF EXISTS issues;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS migrations;
  `);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('database migrations', () => {
  it('applies each migration once and preserves data on rerun', () => {
    const db = getDb();
    resetToUnmigratedDatabase();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    runMigrations();
    db.prepare(
      `INSERT INTO projects (id, key, name, created_at, updated_at)
       VALUES ('project-1', 'KEEP', 'Keep me', 'now', 'now')`,
    ).run();
    runMigrations();

    expect(db.prepare('SELECT id FROM migrations ORDER BY id').all()).toEqual([{ id: 1 }, { id: 2 }]);
    expect(db.prepare("SELECT name FROM projects WHERE key = 'KEEP'").get()).toEqual({ name: 'Keep me' });
    expect(log.mock.calls.filter(([message]) => message === 'Migration 001_initial.sql applied.')).toHaveLength(1);
    expect(log.mock.calls.filter(([message]) => message === 'Migration 002_issue_version.sql applied.')).toHaveLength(1);
    expect(getMigrationStatus()).toEqual({
      ready: true,
      expected: [1, 2],
      applied: [1, 2],
      pending: [],
    });
  });

  it('reports an unmigrated database as not ready without mutating it', () => {
    const db = getDb();
    resetToUnmigratedDatabase();

    expect(getMigrationStatus()).toEqual({
      ready: false,
      expected: [1, 2],
      applied: [],
      pending: [1, 2],
    });
    expect(db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'",
    ).get()).toBeUndefined();
  });

  it('backfills existing issues with version one', () => {
    const db = getDb();
    resetToUnmigratedDatabase();
    db.exec(`
      CREATE TABLE migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const initialSql = requireMigration('001_initial.sql');
    db.exec(initialSql);
    db.prepare('INSERT INTO migrations (id) VALUES (1)').run();
    db.prepare(
      `INSERT INTO projects (id, key, name, created_at, updated_at)
       VALUES ('project-1', 'OLD', 'Existing', 'now', 'now')`,
    ).run();
    db.prepare(
      `INSERT INTO issues
        (id, project_id, key, type, title, status, priority, labels, created_at, updated_at)
       VALUES ('issue-1', 'project-1', 'OLD-1', 'task', 'Existing issue', 'new', 'medium', '[]', 'now', 'now')`,
    ).run();

    runMigrations();

    expect(db.prepare("SELECT version FROM issues WHERE key='OLD-1'").get()).toEqual({ version: 1 });
  });

  it('rolls back migration schema changes when recording the migration fails', () => {
    const db = getDb();
    resetToUnmigratedDatabase();

    const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation(((sql: string) => {
      if (sql.includes('INSERT INTO migrations')) throw new Error('simulated migration record failure');
      return originalPrepare(sql);
    }) as typeof db.prepare);

    expect(() => runMigrations()).toThrow('simulated migration record failure');

    expect(originalPrepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'",
    ).get()).toBeUndefined();
    expect(originalPrepare('SELECT id FROM migrations WHERE id = 1').get()).toBeUndefined();
  });
});
