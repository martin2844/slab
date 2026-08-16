import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const tempDirs: string[] = [];

function makeTempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-backup-test-'));
  tempDirs.push(directory);
  return directory;
}

function runBackup(dbPath: string, destination?: string) {
  const args = ['--import', 'tsx', 'src/db/backup.ts'];
  if (destination) args.push(destination);
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: { ...process.env, TRACKER_DB_PATH: dbPath },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('database backup command', () => {
  it('requires a destination and refuses to overwrite the live database', () => {
    const directory = makeTempDir();
    const livePath = path.join(directory, 'live.db');

    const missing = runBackup(livePath);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('Usage:');

    const overwrite = runBackup(livePath, livePath);
    expect(overwrite.status).toBe(2);
    expect(overwrite.stderr).toContain('must not overwrite the live database');
  });

  it('creates a consistent online backup in a new destination directory', () => {
    const directory = makeTempDir();
    const livePath = path.join(directory, 'live.db');
    const destination = path.join(directory, 'nested', 'backup.db');
    const live = new Database(livePath);
    live.exec('CREATE TABLE records (value TEXT NOT NULL); INSERT INTO records VALUES (\'preserved\')');
    live.close();

    const result = runBackup(livePath, destination);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Database backup written to ${destination}`);
    const backup = new Database(destination, { readonly: true });
    expect(backup.prepare('SELECT value FROM records').get()).toEqual({ value: 'preserved' });
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
    backup.close();
  });
});
