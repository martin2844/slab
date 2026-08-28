import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection.js';
import type { Project } from '../types.js';
import type { CreateProject, UpdateProject } from '../schema/project.js';

type ProjectRow = Project;
type SqlValue = string | number | null;

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createProject(data: CreateProject): Project {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, key, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, data.key, data.name, data.description ?? null, now, now);
  return getProjectByKey(data.key)!;
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProjectByKey(key: string): Project | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE key = ?').get(key) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function getProjectById(id: string): Project | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function updateProject(key: string, data: UpdateProject): Project | null {
  const db = getDb();
  const project = getProjectByKey(key);
  if (!project) return null;

  const fields: string[] = [];
  const values: SqlValue[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }

  if (fields.length === 0) return project;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(key);

  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE key = ?`).run(...values);
  return getProjectByKey(key);
}

export function deleteProject(key: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM projects WHERE key = ?').run(key);
  return result.changes > 0;
}
