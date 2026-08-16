import fs from 'node:fs';
import path from 'node:path';
import { closeDb, DB_PATH, getDb } from './connection.js';

const destinationArg = process.argv[2];

if (!destinationArg) {
  console.error('Usage: npm run backup -- /path/to/backup.db');
  process.exit(2);
}

const destination = path.resolve(destinationArg);
if (DB_PATH !== ':memory:' && destination === path.resolve(DB_PATH)) {
  console.error('Backup destination must not overwrite the live database');
  process.exit(2);
}
fs.mkdirSync(path.dirname(destination), { recursive: true });

try {
  await getDb().backup(destination);
  console.log(`Database backup written to ${destination}`);
} finally {
  closeDb();
}
