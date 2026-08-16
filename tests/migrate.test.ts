import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

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

    expect(db.prepare('SELECT id FROM migrations ORDER BY id').all()).toEqual([{ id: 1 }]);
    expect(db.prepare("SELECT name FROM projects WHERE key = 'KEEP'").get()).toEqual({ name: 'Keep me' });
    expect(log.mock.calls.filter(([message]) => message === 'Migration 001_initial.sql applied.')).toHaveLength(1);
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
