import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection.js';
import type { HistoryEntry } from '../types.js';

type HistoryRow = HistoryEntry;
type IssueIdRow = { id: string };

function rowToHistory(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    issue_id: row.issue_id,
    field: row.field,
    old_value: row.old_value,
    new_value: row.new_value,
    author: row.author,
    created_at: row.created_at,
  };
}

export function recordHistory(issueId: string, field: string, oldValue: string | null, newValue: string | null, author: string): void {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO history (id, issue_id, field, old_value, new_value, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, issueId, field, oldValue, newValue, author, now);
}

export function getHistory(issueKey: string): HistoryEntry[] | null {
  const db = getDb();
  const issue = db.prepare('SELECT id FROM issues WHERE key = ?').get(issueKey) as IssueIdRow | undefined;
  if (!issue) return null;

  const rows = db.prepare('SELECT * FROM history WHERE issue_id = ? ORDER BY created_at ASC')
    .all(issue.id) as HistoryRow[];
  return rows.map(rowToHistory);
}
