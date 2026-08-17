import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as projectSvc from '../src/services/project.js';
import * as issueSvc from '../src/services/issue.js';
import { getDb } from '../src/db/connection.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const migrationSql = fs.readFileSync(path.join(repoRoot, 'src/db/migrations/001_initial.sql'), 'utf8');

function createIssueInChild(dbPath: string, title: string): Promise<string> {
  const source = `
    import('./src/services/issue.ts')
      .then(({ createIssue }) => {
        const issue = createIssue('TEST', { title: process.argv[1] });
        if (!issue) throw new Error('project not found');
        process.stdout.write(issue.key);
      })
      .catch((error) => { console.error(error); process.exit(1); });
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--eval', source, title], {
      cwd: repoRoot,
      env: { ...process.env, TRACKER_DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`issue worker exited ${code}: ${stderr}`));
    });
  });
}

describe('Issue Service', () => {
  beforeEach(() => {
    projectSvc.createProject({ key: 'TEST', name: 'Test Project' });
  });

  describe('createIssue', () => {
    it('creates an issue with defaults', () => {
      const issue = issueSvc.createIssue('TEST', {
        title: 'My first issue',
      })!;

      expect(issue).toMatchObject({
        key: 'TEST-1',
        type: 'task',
        title: 'My first issue',
        status: 'new',
        priority: 'medium',
        assignee: null,
      });
      expect(issue.labels).toEqual([]);
      expect(issue.resolved_at).toBeNull();
    });

    it('creates an issue with all fields', () => {
      const issue = issueSvc.createIssue('TEST', {
        type: 'bug',
        title: 'Critical crash',
        description: 'App crashes on startup',
        priority: 'critical',
        assignee: 'alice',
        labels: ['backend', 'urgent'],
      })!;

      expect(issue).toMatchObject({
        key: 'TEST-1',
        type: 'bug',
        title: 'Critical crash',
        priority: 'critical',
        assignee: 'alice',
      });
      expect(issue.labels).toEqual(['backend', 'urgent']);
    });

    it('increments issue numbers', () => {
      issueSvc.createIssue('TEST', { title: 'First' });
      issueSvc.createIssue('TEST', { title: 'Second' });
      issueSvc.createIssue('TEST', { title: 'Third' });

      expect(issueSvc.getIssueByKey('TEST-1')).toBeDefined();
      expect(issueSvc.getIssueByKey('TEST-2')).toBeDefined();
      expect(issueSvc.getIssueByKey('TEST-3')).toBeDefined();
    });

    it('allocates unique issue numbers across concurrent database connections', async () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-issue-concurrency-'));
      const dbPath = path.join(directory, 'shared.db');
      try {
        const db = new Database(dbPath);
        db.exec(migrationSql);
        db.prepare(
          `INSERT INTO projects (id, key, name, created_at, updated_at)
           VALUES ('project-1', 'TEST', 'Test Project', 'now', 'now')`,
        ).run();
        db.close();

        const keys = await Promise.all(
          Array.from({ length: 4 }, (_, index) => createIssueInChild(dbPath, `Concurrent ${index}`)),
        );

        expect(keys.sort()).toEqual(['TEST-1', 'TEST-2', 'TEST-3', 'TEST-4']);
        const verify = new Database(dbPath, { readonly: true });
        expect(verify.prepare('SELECT COUNT(*) AS count FROM issues').get()).toEqual({ count: 4 });
        verify.close();
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }, 15_000);

    it('returns null for non-existent project', () => {
      expect(issueSvc.createIssue('NOPE', { title: 'X' })).toBeNull();
    });
  });

  describe('getIssueByKey', () => {
    it('finds an existing issue', () => {
      issueSvc.createIssue('TEST', { title: 'Find me' });
      const issue = issueSvc.getIssueByKey('TEST-1');
      expect(issue?.title).toBe('Find me');
    });

    it('returns null for non-existent issue', () => {
      expect(issueSvc.getIssueByKey('TEST-999')).toBeNull();
    });
  });

  describe('updateIssue', () => {
    it('updates status and records history', () => {
      issueSvc.createIssue('TEST', { title: 'Updatable' });
      const updated = issueSvc.updateIssue('TEST-1', { status: 'in_progress' }, 1, 'alice')!;

      expect(updated.status).toBe('in_progress');
      expect(updated.assignee).toBeNull(); // unchanged
    });

    it('sets resolved_at when status is done', () => {
      issueSvc.createIssue('TEST', { title: 'Completable' });
      const done = issueSvc.updateIssue('TEST-1', { status: 'done' }, 1, 'bob')!;

      expect(done.status).toBe('done');
      expect(done.resolved_at).toBeDefined();
      expect(done.resolved_at).not.toBeNull();
    });

    it('clears resolved_at when moving away from done', () => {
      issueSvc.createIssue('TEST', { title: 'Reopened' });
      const done = issueSvc.updateIssue('TEST-1', { status: 'done' }, 1, 'bob')!;
      const reopened = issueSvc.updateIssue('TEST-1', { status: 'in_progress' }, done.version, 'bob')!;

      expect(reopened.status).toBe('in_progress');
      expect(reopened.resolved_at).toBeNull();
    });

    it('updates multiple fields at once', () => {
      issueSvc.createIssue('TEST', { title: 'Multi' });
      const updated = issueSvc.updateIssue('TEST-1', {
        title: 'Updated title',
        priority: 'high',
        assignee: 'charlie',
        labels: ['frontend', 'v2'],
      }, 1, 'system')!;

      expect(updated.title).toBe('Updated title');
      expect(updated.priority).toBe('high');
      expect(updated.assignee).toBe('charlie');
      expect(updated.labels).toEqual(['frontend', 'v2']);
    });

    it('returns null for non-existent issue', () => {
      expect(issueSvc.updateIssue('TEST-999', { title: 'X' }, 1)).toBeNull();
    });

    it('rolls back the issue update when writing history fails', () => {
      issueSvc.createIssue('TEST', { title: 'Original title' });
      const db = getDb();
      const originalPrepare = db.prepare.bind(db);
      const prepare = vi.spyOn(db, 'prepare').mockImplementation(((sql: string) => {
        if (sql.includes('INSERT INTO history')) throw new Error('simulated history failure');
        return originalPrepare(sql);
      }) as typeof db.prepare);

      try {
        expect(() => issueSvc.updateIssue('TEST-1', { title: 'Changed title' }, 1, 'tester'))
          .toThrow('simulated history failure');
      } finally {
        prepare.mockRestore();
      }

      expect(issueSvc.getIssueByKey('TEST-1')?.title).toBe('Original title');
      expect(originalPrepare('SELECT * FROM history').all()).toEqual([]);
    });
  });

  describe('listIssues', () => {
    it('lists all issues in a project', () => {
      issueSvc.createIssue('TEST', { title: 'A' });
      issueSvc.createIssue('TEST', { title: 'B' });
      issueSvc.createIssue('TEST', { title: 'C' });

      const result = issueSvc.listIssues('TEST', {});
      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('filters by status', () => {
      issueSvc.createIssue('TEST', { title: 'Open' });
      issueSvc.createIssue('TEST', { title: 'Working' });
      issueSvc.updateIssue('TEST-2', { status: 'in_progress' }, 1, 'system');

      const result = issueSvc.listIssues('TEST', { status: ['in_progress'] });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].key).toBe('TEST-2');
    });

    it('filters by type', () => {
      issueSvc.createIssue('TEST', { title: 'Bug', type: 'bug' });
      issueSvc.createIssue('TEST', { title: 'Story', type: 'story' });

      const result = issueSvc.listIssues('TEST', { type: ['bug'] });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('bug');
    });

    it('filters by assignee', () => {
      issueSvc.createIssue('TEST', { title: 'A', assignee: 'alice' });
      issueSvc.createIssue('TEST', { title: 'B', assignee: 'bob' });

      const result = issueSvc.listIssues('TEST', { assignee: 'alice' });
      expect(result.data).toHaveLength(1);
    });

    it('searches by text', () => {
      issueSvc.createIssue('TEST', { title: 'Fix login bug', description: 'Users cannot log in' });
      issueSvc.createIssue('TEST', { title: 'Add feature', description: 'New dashboard' });

      const result = issueSvc.listIssues('TEST', { search: 'login' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].key).toBe('TEST-1');
    });

    it('paginates results', () => {
      for (let i = 0; i < 5; i++) {
        issueSvc.createIssue('TEST', { title: `Issue ${i}` });
      }

      const page1 = issueSvc.listIssues('TEST', { limit: 2, offset: 0 });
      const page2 = issueSvc.listIssues('TEST', { limit: 2, offset: 2 });

      expect(page1.data).toHaveLength(2);
      expect(page2.data).toHaveLength(2);
      expect(page1.total).toBe(5);
    });

    it('returns empty for non-existent project', () => {
      const result = issueSvc.listIssues('NOPE', {});
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('deleteIssue', () => {
    it('deletes an existing issue', () => {
      issueSvc.createIssue('TEST', { title: 'Deletable' });
      expect(issueSvc.deleteIssue('TEST-1', 1)).toBe(true);
      expect(issueSvc.getIssueByKey('TEST-1')).toBeNull();
    });

    it('returns false for non-existent issue', () => {
      expect(issueSvc.deleteIssue('TEST-999', 1)).toBe(false);
    });
  });

  describe('searchIssues', () => {
    it('searches across all projects', () => {
      projectSvc.createProject({ key: 'PROJ2', name: 'Second Project' });
      issueSvc.createIssue('TEST', { title: 'Auth bug in API' });
      issueSvc.createIssue('PROJ2', { title: 'Auth migration needed' });

      const result = issueSvc.searchIssues('Auth');
      expect(result.data).toHaveLength(2);
    });
  });
});
