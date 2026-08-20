import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function migrationIds(): number[] {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .flatMap((file) => {
      const match = file.match(/^(\d+)/);
      return match ? [parseInt(match[1], 10)] : [];
    });
}

export function getMigrationStatus(): {
  ready: boolean;
  expected: number[];
  applied: number[];
  pending: number[];
} {
  const expected = migrationIds();
  const db = getDb();
  const table = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migrations'",
  ).get();
  const applied = table
    ? (db.prepare('SELECT id FROM migrations ORDER BY id').all() as Array<{ id: number }>).map(row => row.id)
    : [];
  const appliedIds = new Set(applied);
  const pending = expected.filter(id => !appliedIds.has(id));
  return { ready: pending.length === 0, expected, applied, pending };
}

export function runMigrations() {
  const db = getDb();

  // Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const match = file.match(/^(\d+)/);
    if (!match) continue;
    const id = parseInt(match[1], 10);

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const applyMigration = db.transaction(() => {
      const alreadyApplied = db.prepare('SELECT 1 FROM migrations WHERE id = ?').get(id);
      if (alreadyApplied) return false;

      db.exec(sql);
      db.prepare('INSERT INTO migrations (id) VALUES (?)').run(id);
      return true;
    });

    if (applyMigration.immediate()) {
      console.log(`Migration ${file} applied.`);
    }
  }

  console.log('Migrations complete.');
}

export function shouldRunMigrations(): boolean {
  return process.env.SKIP_MIGRATIONS !== 'true';
}

// Allow running directly
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations();
}
