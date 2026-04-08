import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection.js';
import type { IssueLink } from '../types.js';
import type { CreateLink } from '../schema/link.js';

function rowToLink(row: any): IssueLink {
  return {
    id: row.id,
    source_id: row.source_id,
    target_id: row.target_id,
    type: row.type,
    created_at: row.created_at,
  };
}

export function createLink(issueKey: string, data: CreateLink): IssueLink | null {
  const db = getDb();
  const source = db.prepare('SELECT id FROM issues WHERE key = ?').get(issueKey) as any;
  if (!source) return null;

  const target = db.prepare('SELECT id FROM issues WHERE key = ?').get(data.target_key) as any;
  if (!target) return null;

  if (source.id === target.id) return null;

  // Check for existing link
  const existing = db.prepare(
    'SELECT id FROM issue_links WHERE source_id = ? AND target_id = ? AND type = ?'
  ).get(source.id, target.id, data.type);
  if (existing) return null;

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO issue_links (id, source_id, target_id, type, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, source.id, target.id, data.type, now);

  return { id, source_id: source.id, target_id: target.id, type: data.type, created_at: now };
}

export function listLinks(issueKey: string): { outward: IssueLink[]; inward: IssueLink[] } | null {
  const db = getDb();
  const issue = db.prepare('SELECT id FROM issues WHERE key = ?').get(issueKey) as any;
  if (!issue) return null;

  const outward = db.prepare('SELECT * FROM issue_links WHERE source_id = ? ORDER BY created_at DESC')
    .all(issue.id).map(rowToLink);
  const inward = db.prepare('SELECT * FROM issue_links WHERE target_id = ? ORDER BY created_at DESC')
    .all(issue.id).map(rowToLink);

  return { outward, inward };
}

export function deleteLink(linkId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM issue_links WHERE id = ?').run(linkId);
  return result.changes > 0;
}
