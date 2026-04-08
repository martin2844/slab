import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection.js';
import type { Comment } from '../types.js';
import type { CreateComment } from '../schema/comment.js';

function rowToComment(row: any): Comment {
  return {
    id: row.id,
    issue_id: row.issue_id,
    author: row.author,
    body: row.body,
    created_at: row.created_at,
  };
}

export function addComment(issueKey: string, data: CreateComment): Comment | null {
  const db = getDb();
  const issue = db.prepare('SELECT id FROM issues WHERE key = ?').get(issueKey) as any;
  if (!issue) return null;

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO comments (id, issue_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, issue.id, data.author, data.body, now);

  return { id, issue_id: issue.id, author: data.author, body: data.body, created_at: now };
}

export function listComments(issueKey: string): Comment[] | null {
  const db = getDb();
  const issue = db.prepare('SELECT id FROM issues WHERE key = ?').get(issueKey) as any;
  if (!issue) return null;

  return db.prepare('SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at ASC')
    .all(issue.id)
    .map(rowToComment);
}

export function deleteComment(issueKey: string, commentId: string): boolean {
  const db = getDb();
  const issue = db.prepare('SELECT id FROM issues WHERE key = ?').get(issueKey) as any;
  if (!issue) return false;

  const result = db.prepare('DELETE FROM comments WHERE id = ? AND issue_id = ?').run(commentId, issue.id);
  return result.changes > 0;
}
