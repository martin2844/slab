import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection.js';
import type { Issue } from '../types.js';
import type { CreateIssue, UpdateIssue, ListIssuesQuery } from '../schema/issue.js';
import { recordHistory } from './history.js';

function rowToIssue(row: any): Issue {
  return {
    id: row.id,
    project_id: row.project_id,
    key: row.key,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    labels: JSON.parse(row.labels || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
  };
}

function getNextIssueNumber(db: any, projectId: string): number {
  const row = db.prepare(
    `SELECT MAX(CAST(SUBSTR(key, INSTR(key, '-') + 1) AS INTEGER)) as max_num FROM issues WHERE project_id = ?`
  ).get(projectId) as any;
  return (row?.max_num || 0) + 1;
}

export function createIssue(projectKey: string, data: CreateIssue): Issue | null {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE key = ?').get(projectKey) as any;
  if (!project) return null;

  const type = data.type || 'task';
  const priority = data.priority || 'medium';
  const labels = JSON.stringify(data.labels || []);
  const id = uuid();
  const number = getNextIssueNumber(db, project.id);
  const key = `${projectKey}-${number}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO issues (id, project_id, key, type, title, description, status, priority, assignee, labels, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`
  ).run(id, project.id, key, type, data.title, data.description ?? null, priority, data.assignee ?? null, labels, now, now);

  return getIssueByKey(key);
}

export function getIssueByKey(key: string): Issue | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM issues WHERE key = ?').get(key);
  return row ? rowToIssue(row) : null;
}

export function getIssueById(id: string): Issue | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  return row ? rowToIssue(row) : null;
}

export function listIssues(projectKey: string, query: ListIssuesQuery): { data: Issue[]; total: number } {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE key = ?').get(projectKey) as any;
  if (!project) return { data: [], total: 0 };

  const conditions = ['i.project_id = ?'];
  const params: any[] = [project.id];

  if (query.status?.length) {
    conditions.push(`i.status IN (${query.status.map(() => '?').join(', ')})`);
    params.push(...query.status);
  }
  if (query.type?.length) {
    conditions.push(`i.type IN (${query.type.map(() => '?').join(', ')})`);
    params.push(...query.type);
  }
  if (query.priority?.length) {
    conditions.push(`i.priority IN (${query.priority.map(() => '?').join(', ')})`);
    params.push(...query.priority);
  }
  if (query.assignee) {
    conditions.push('i.assignee = ?');
    params.push(query.assignee);
  }
  if (query.label?.length) {
    for (const label of query.label) {
      conditions.push('i.labels LIKE ?');
      params.push(`%"${label}"%`);
    }
  }
  if (query.search) {
    conditions.push('(i.title LIKE ? OR i.description LIKE ?)');
    const term = `%${query.search}%`;
    params.push(term, term);
  }

  const where = conditions.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) as count FROM issues i WHERE ${where}`).get(...params) as any).count;

  const rows = db.prepare(
    `SELECT i.* FROM issues i WHERE ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, query.limit ?? 50, query.offset ?? 0);

  return { data: rows.map(rowToIssue), total };
}

export function updateIssue(key: string, data: UpdateIssue, author: string = 'system'): Issue | null {
  const db = getDb();
  const issue = getIssueByKey(key);
  if (!issue) return null;

  const fields: string[] = [];
  const values: any[] = [];
  const historyEntries: { field: string; old: string | null; new: string | null }[] = [];

  const trackable = ['type', 'title', 'description', 'status', 'priority', 'assignee'] as const;

  for (const field of trackable) {
    if (data[field as keyof UpdateIssue] !== undefined) {
      const newValue = data[field as keyof UpdateIssue] as any;
      const oldValue = field === 'assignee' ? issue[field] :
                       field === 'description' ? issue[field] :
                       String(issue[field as keyof Issue]);

      // Handle nullable fields
      const oldStr = oldValue ?? null;
      const newStr = newValue ?? null;

      if (oldStr !== newStr) {
        historyEntries.push({ field, old: oldStr, new: newStr });
        fields.push(`${field} = ?`);
        values.push(newValue);
      }
    }
  }

  // Handle labels separately (stored as JSON)
  if (data.labels !== undefined) {
    const oldLabels = JSON.stringify(issue.labels);
    const newLabels = JSON.stringify(data.labels);
    if (oldLabels !== newLabels) {
      historyEntries.push({ field: 'labels', old: oldLabels, new: newLabels });
      fields.push('labels = ?');
      values.push(newLabels);
    }
  }

  if (fields.length === 0) return issue;

  // Handle resolved_at
  if (data.status === 'done') {
    fields.push('resolved_at = ?');
    values.push(new Date().toISOString());
  } else if (data.status && data.status !== 'done' as string) {
    fields.push('resolved_at = ?');
    values.push(null);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(key);

  db.prepare(`UPDATE issues SET ${fields.join(', ')} WHERE key = ?`).run(...values);

  // Record history
  for (const entry of historyEntries) {
    recordHistory(issue.id, entry.field, entry.old, entry.new, author);
  }

  return getIssueByKey(key);
}

export function deleteIssue(key: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM issues WHERE key = ?').run(key);
  return result.changes > 0;
}

export function searchIssues(query: string, limit: number = 50, offset: number = 0): { data: Issue[]; total: number } {
  const db = getDb();
  const term = `%${query}%`;

  const total = (db.prepare(
    `SELECT COUNT(*) as count FROM issues WHERE title LIKE ? OR description LIKE ?`
  ).get(term, term) as any).count;

  const rows = db.prepare(
    `SELECT * FROM issues WHERE title LIKE ? OR description LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).all(term, term, limit, offset);

  return { data: rows.map(rowToIssue), total };
}

export function getBlockedIssues(): Issue[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT i.* FROM issues i
    JOIN issue_links l ON l.target_id = i.id
    WHERE l.type = 'blocks'
    AND EXISTS (
      SELECT 1 FROM issues blocker WHERE blocker.id = l.source_id AND blocker.status != 'done'
    )
    ORDER BY i.updated_at DESC
  `).all();
  return rows.map(rowToIssue);
}
