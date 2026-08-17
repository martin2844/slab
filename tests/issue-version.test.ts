import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import * as issueSvc from '../src/services/issue.js';
import * as projectSvc from '../src/services/project.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const migrationSql = fs.readdirSync(path.join(repoRoot, 'src/db/migrations'))
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => fs.readFileSync(path.join(repoRoot, 'src/db/migrations', file), 'utf8'))
  .join('\n');

function updateIssueInChild(dbPath: string, title: string) {
  const source = `
    import('./src/services/issue.ts')
      .then(({ updateIssue }) => {
        try {
          const issue = updateIssue('RACE-1', { title: process.argv[1] }, 1, process.argv[1]);
          process.stdout.write(JSON.stringify({ outcome: 'success', version: issue?.version }));
        } catch (error) {
          process.stdout.write(JSON.stringify({ outcome: error.code ?? 'error' }));
        }
      })
      .catch((error) => { console.error(error); process.exit(1); });
  `;

  return new Promise<{ outcome: string; version?: number }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--eval', source, title],
      {
        cwd: repoRoot,
        env: { ...process.env, TRACKER_DB_PATH: dbPath },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(JSON.parse(stdout));
      else reject(new Error(`issue worker exited ${code}: ${stderr}`));
    });
  });
}

describe('issue optimistic concurrency', () => {
  it('exposes version on reads and increments it after a guarded update', () => {
    projectSvc.createProject({ key: 'COO', name: 'Operations' });
    const created = issueSvc.createIssue('COO', {
      title: 'Check PostHog for actionable sales items',
      assignee: 'sales',
    })!;

    expect(created.version).toBe(1);
    expect(issueSvc.getIssueByKey(created.key)?.version).toBe(1);
    expect(issueSvc.listIssues('COO', {}).data[0]?.version).toBe(1);
    expect(issueSvc.searchIssues('PostHog').data[0]?.version).toBe(1);

    const updated = issueSvc.updateIssue(
      created.key,
      { status: 'in_progress' },
      1,
      'sales',
    )!;

    expect(updated).toMatchObject({ status: 'in_progress', version: 2 });
  });

  it('rejects the exact stale COO-10 write without modifying the winning state', () => {
    projectSvc.createProject({ key: 'COO', name: 'Operations' });
    const issue = issueSvc.createIssue('COO', {
      title: 'Check PostHog for actionable sales items',
      assignee: 'sales',
    })!;

    const completed = issueSvc.updateIssue(
      issue.key,
      { status: 'done' },
      issue.version,
      'coo',
    )!;
    expect(completed).toMatchObject({ status: 'done', version: 2 });

    let conflict: unknown;
    try {
      issueSvc.updateIssue(
        issue.key,
        { status: 'in_progress', labels: ['status:blocked'] },
        issue.version,
        'sales',
      );
    } catch (error) {
      conflict = error;
    }

    expect(conflict).toMatchObject({
      code: 'VERSION_CONFLICT',
      key: issue.key,
      expectedVersion: 1,
      currentVersion: 2,
      currentStatus: 'done',
    });
    expect(issueSvc.getIssueByKey(issue.key)).toMatchObject({
      status: 'done',
      labels: [],
      version: 2,
    });
  });

  it('allows exactly one of two mutations based on the same version', () => {
    projectSvc.createProject({ key: 'RACE', name: 'Race' });
    const issue = issueSvc.createIssue('RACE', { title: 'Concurrent update' })!;
    const outcomes: string[] = [];

    for (const title of ['First writer', 'Second writer']) {
      try {
        issueSvc.updateIssue(issue.key, { title }, issue.version, title);
        outcomes.push('success');
      } catch (error) {
        outcomes.push(
          (error as { code?: string }).code === 'VERSION_CONFLICT'
            ? 'conflict'
            : 'unexpected',
        );
      }
    }

    expect(outcomes.sort()).toEqual(['conflict', 'success']);
    expect(issueSvc.getIssueByKey(issue.key)?.version).toBe(2);
  });

  it('allows exactly one simultaneous writer across database connections', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-version-race-'));
    const dbPath = path.join(directory, 'shared.db');
    try {
      const db = new Database(dbPath);
      db.exec(migrationSql);
      db.prepare(
        `INSERT INTO projects (id, key, name, created_at, updated_at)
         VALUES ('project-1', 'RACE', 'Race', 'now', 'now')`,
      ).run();
      db.prepare(
        `INSERT INTO issues
          (id, project_id, key, type, title, status, priority, labels, created_at, updated_at)
         VALUES ('issue-1', 'project-1', 'RACE-1', 'task', 'Original', 'new', 'medium', '[]', 'now', 'now')`,
      ).run();
      db.close();

      const outcomes = await Promise.all([
        updateIssueInChild(dbPath, 'Writer A'),
        updateIssueInChild(dbPath, 'Writer B'),
      ]);

      expect(outcomes.map(item => item.outcome).sort()).toEqual([
        'VERSION_CONFLICT',
        'success',
      ]);
      const verify = new Database(dbPath, { readonly: true });
      expect(verify.prepare("SELECT version FROM issues WHERE key='RACE-1'").get()).toEqual({ version: 2 });
      verify.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);

  it('rejects deletion based on a stale version', () => {
    projectSvc.createProject({ key: 'DEL', name: 'Delete guard' });
    const issue = issueSvc.createIssue('DEL', { title: 'Keep latest state' })!;
    const updated = issueSvc.updateIssue(
      issue.key,
      { priority: 'high' },
      issue.version,
      'coo',
    )!;

    expect(() => issueSvc.deleteIssue(issue.key, issue.version)).toThrowError(
      expect.objectContaining({
        code: 'VERSION_CONFLICT',
        currentVersion: updated.version,
      }),
    );
    expect(issueSvc.getIssueByKey(issue.key)).not.toBeNull();
  });
});
