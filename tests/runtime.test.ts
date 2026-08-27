import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';

const TEST_API_KEY = '0123456789abcdef0123456789abcdef';
const children = new Set<ChildProcessWithoutNullStreams>();
const temporaryDirectories = new Set<string>();

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a test port'));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function startServer(entrypoint: string, environment: NodeJS.ProcessEnv): {
  child: ChildProcessWithoutNullStreams;
  logs: () => string;
} {
  let output = '';
  const child = spawn(process.execPath, ['--import', 'tsx', entrypoint], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', ...environment },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  children.add(child);
  return { child, logs: () => output };
}

async function waitUntilHealthy(url: string, child: ChildProcessWithoutNullStreams, logs: () => string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup:\n${logs()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(50);
  }
  throw new Error(`Server did not become healthy:\n${logs()}`);
}

async function stopServer(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    delay(5_000).then(() => {
      child.kill('SIGKILL');
      throw new Error('Server did not stop within five seconds');
    }),
  ]);
}

function makeDatabasePath(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.add(directory);
  return path.join(directory, 'slab.db');
}

function parseMcpEvent(text: string): any {
  const data = text.split('\n')
    .find((line) => line.startsWith('data: '))
    ?.slice('data: '.length);
  if (!data) throw new Error('MCP response did not contain a data event');
  return JSON.parse(data);
}

afterEach(async () => {
  await Promise.allSettled([...children].map(stopServer));
  children.clear();
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

describe('production HTTP entrypoints', () => {
  it('starts the REST API, enforces auth and limits bodies, then shuts down cleanly', async () => {
    const port = await getFreePort();
    const { child, logs } = startServer('src/index.ts', {
      PORT: String(port),
      TRACKER_API_KEY: TEST_API_KEY,
      TRACKER_DB_PATH: makeDatabasePath('slab-rest-'),
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitUntilHealthy(`${baseUrl}/health`, child, logs);

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
    const ready = await fetch(`${baseUrl}/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ status: 'ready', database: 'ok' });

    const unauthorized = await fetch(`${baseUrl}/api/projects`);
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${baseUrl}/api/projects`, {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    expect(authorized.status).toBe(200);

    const jsonHeaders = {
      'Content-Type': 'application/json',
      'X-API-Key': TEST_API_KEY,
    };
    const createdProject = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key: 'RACE', name: 'Concurrency' }),
    });
    expect(createdProject.status).toBe(201);
    const createdIssue = await fetch(`${baseUrl}/api/projects/RACE/issues`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ title: 'Guard this issue' }),
    });
    expect(createdIssue.status).toBe(201);

    const winningUpdate = await fetch(`${baseUrl}/api/issues/RACE-1`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ expected_version: 1, status: 'done' }),
    });
    expect(winningUpdate.status).toBe(200);
    expect((await winningUpdate.json()).data).toMatchObject({
      status: 'done',
      version: 2,
    });

    const staleUpdate = await fetch(`${baseUrl}/api/issues/RACE-1`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        expected_version: 1,
        status: 'in_progress',
        labels: ['status:blocked'],
      }),
    });
    expect(staleUpdate.status).toBe(409);
    expect((await staleUpdate.json()).error).toMatchObject({
      code: 'VERSION_CONFLICT',
      expectedVersion: 1,
      currentVersion: 2,
      currentStatus: 'done',
    });

    const malformed = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_API_KEY },
      body: '{',
    });
    expect(malformed.status).toBe(500);
    expect(await malformed.json()).toEqual({ data: null, error: 'Internal server error' });

    const oversized = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_API_KEY },
      body: JSON.stringify({ name: 'x'.repeat(1024 * 1024) }),
    });
    expect(oversized.status).toBe(413);

    await stopServer(child);
    expect(child.exitCode).toBe(0);
    expect(logs()).toContain('shutting down Slab API');
  }, 20_000);

  it('starts the MCP server, exposes semantic issue mutations, then shuts down cleanly', async () => {
    const port = await getFreePort();
    const { child, logs } = startServer('src/mcp/server.ts', {
      TRACKER_MCP_PORT: String(port),
      TRACKER_MCP_MODE: 'http',
      TRACKER_API_KEY: TEST_API_KEY,
      TRACKER_DB_PATH: makeDatabasePath('slab-mcp-'),
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitUntilHealthy(`${baseUrl}/health`, child, logs);

    const ready = await fetch(`${baseUrl}/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ status: 'ready', database: 'ok' });

    const unauthorized = await fetch(`${baseUrl}/mcp`);
    expect(unauthorized.status).toBe(401);

    const mcpHeaders = {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${TEST_API_KEY}`,
      'Content-Type': 'application/json',
    };
    const initialized = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'slab-test', version: '1.0.0' },
        },
      }),
    });
    expect(initialized.status).toBe(200);
    const sessionId = initialized.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(parseMcpEvent(await initialized.text())).toMatchObject({
      result: { serverInfo: { name: 'slab' } },
    });

    const sessionHeaders = { ...mcpHeaders, 'Mcp-Session-Id': sessionId! };
    const notification = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
    expect(notification.ok).toBe(true);

    let requestId = 2;
    async function mcpRequest(method: string, params: Record<string, unknown> = {}) {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
      });
      expect(response.status).toBe(200);
      return parseMcpEvent(await response.text());
    }
    async function callTool(name: string, args: Record<string, unknown>) {
      return mcpRequest('tools/call', { name, arguments: args });
    }
    function toolJson(payload: any) {
      const text = payload.result?.content?.find((item: any) => item.type === 'text')?.text;
      if (!text) throw new Error('MCP tool did not return text content');
      return JSON.parse(text);
    }
    async function readIssue() {
      return toolJson(await callTool('get_issue', { key: 'SEM-1' }));
    }

    const listed = await mcpRequest('tools/list');
    const toolNames = listed.result.tools.map((tool: any) => tool.name);
    expect(toolNames).toHaveLength(22);
    expect(toolNames).toEqual(expect.arrayContaining([
      'update_issue',
      'assign_issue',
      'set_issue_status',
      'set_issue_priority',
      'edit_issue_content',
      'set_issue_labels',
    ]));

    await callTool('create_project', { key: 'SEM', name: 'Semantic tools' });
    await callTool('create_issue', {
      project_key: 'SEM',
      title: 'Original title',
      description: 'Original description',
      type: 'task',
      priority: 'medium',
      assignee: 'nobody',
      labels: ['initial'],
    });
    expect(toolJson(await callTool('assign_issue', {
      key: 'SEM-1', expected_version: 1, assignee: 'coo', author: 'test',
    }))).toMatchObject({ version: 2, changed_fields: ['assignee'] });
    expect(await readIssue()).toMatchObject({
      type: 'task',
      title: 'Original title',
      description: 'Original description',
      status: 'new',
      priority: 'medium',
      assignee: 'coo',
      labels: ['initial'],
      version: 2,
    });
    expect(toolJson(await callTool('assign_issue', {
      key: 'SEM-1', expected_version: 2, assignee: 'coo', author: 'test',
    }))).toMatchObject({ version: 2, changed_fields: [] });
    expect(toolJson(await callTool('set_issue_status', {
      key: 'SEM-1', expected_version: 2, status: 'in_progress', author: 'test',
    }))).toMatchObject({ version: 3, changed_fields: ['status'] });
    expect(await readIssue()).toMatchObject({
      type: 'task',
      title: 'Original title',
      description: 'Original description',
      status: 'in_progress',
      priority: 'medium',
      assignee: 'coo',
      labels: ['initial'],
      version: 3,
    });
    expect(toolJson(await callTool('set_issue_priority', {
      key: 'SEM-1', expected_version: 3, priority: 'high', author: 'test',
    }))).toMatchObject({ version: 4, changed_fields: ['priority'] });
    expect(await readIssue()).toMatchObject({
      type: 'task',
      title: 'Original title',
      description: 'Original description',
      status: 'in_progress',
      priority: 'high',
      assignee: 'coo',
      labels: ['initial'],
      version: 4,
    });
    expect(toolJson(await callTool('edit_issue_content', {
      key: 'SEM-1',
      expected_version: 4,
      type: 'task',
      title: 'Revised title',
      author: 'test',
    }))).toMatchObject({
      version: 5,
      changed_fields: ['title'],
    });
    expect(await readIssue()).toMatchObject({
      type: 'task',
      title: 'Revised title',
      description: 'Original description',
      status: 'in_progress',
      priority: 'high',
      assignee: 'coo',
      labels: ['initial'],
      version: 5,
    });
    expect(toolJson(await callTool('edit_issue_content', {
      key: 'SEM-1',
      expected_version: 5,
      type: 'story',
      title: 'Revised title',
      description: 'Revised description',
      author: 'test',
    }))).toMatchObject({
      version: 6,
      changed_fields: ['type', 'description'],
    });
    expect(await readIssue()).toMatchObject({
      type: 'story',
      title: 'Revised title',
      description: 'Revised description',
      status: 'in_progress',
      priority: 'high',
      assignee: 'coo',
      labels: ['initial'],
      version: 6,
    });
    expect(toolJson(await callTool('set_issue_labels', {
      key: 'SEM-1', expected_version: 6, labels: ['operations'], author: 'test',
    }))).toMatchObject({ version: 7, changed_fields: ['labels'] });

    expect(await readIssue()).toMatchObject({
      type: 'story',
      title: 'Revised title',
      description: 'Revised description',
      status: 'in_progress',
      priority: 'high',
      assignee: 'coo',
      labels: ['operations'],
      version: 7,
    });

    const emptyContentEdit = await callTool('edit_issue_content', {
      key: 'SEM-1', expected_version: 7, author: 'test',
    });
    expect(emptyContentEdit.result).toMatchObject({ isError: true });
    expect(emptyContentEdit.result.content[0].text).toContain('At least one');

    const staleAssignment = await callTool('assign_issue', {
      key: 'SEM-1', expected_version: 1, assignee: 'other', author: 'test',
    });
    expect(staleAssignment.result).toMatchObject({ isError: true });
    expect(toolJson(staleAssignment)).toMatchObject({
      error: {
        code: 'VERSION_CONFLICT',
        expectedVersion: 1,
        currentVersion: 7,
      },
    });
    const missingIssue = await callTool('set_issue_status', {
      key: 'SEM-404', expected_version: 1, status: 'done', author: 'test',
    });
    expect(missingIssue.result).toMatchObject({ isError: true });
    expect(missingIssue.result.content[0].text).toContain('SEM-404');

    const invalidSession = await fetch(`${baseUrl}/messages?sessionId=missing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_API_KEY },
      body: '{}',
    });
    expect(invalidSession.status).toBe(400);

    const oversized = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': TEST_API_KEY },
      body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) }),
    });
    expect(oversized.status).toBe(413);

    await stopServer(child);
    expect(child.exitCode).toBe(0);
    expect(logs()).toContain('shutting down Slab MCP server');
  }, 20_000);

  it('stays live but not ready when one-shot migrations have not completed', async () => {
    const port = await getFreePort();
    const mcpPort = await getFreePort();
    const databasePath = makeDatabasePath('slab-unmigrated-');
    const { child, logs } = startServer('src/index.ts', {
      PORT: String(port),
      TRACKER_API_KEY: TEST_API_KEY,
      TRACKER_DB_PATH: databasePath,
      SKIP_MIGRATIONS: 'true',
    });
    const { child: mcpChild, logs: mcpLogs } = startServer('src/mcp/server.ts', {
      TRACKER_MCP_PORT: String(mcpPort),
      TRACKER_MCP_MODE: 'http',
      TRACKER_API_KEY: TEST_API_KEY,
      TRACKER_DB_PATH: databasePath,
      SKIP_MIGRATIONS: 'true',
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    const mcpBaseUrl = `http://127.0.0.1:${mcpPort}`;
    await waitUntilHealthy(`${baseUrl}/health`, child, logs);
    await waitUntilHealthy(`${mcpBaseUrl}/health`, mcpChild, mcpLogs);

    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    const ready = await fetch(`${baseUrl}/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({
      status: 'not_ready',
      database: 'ok',
      migrations: { ready: false, pending: [1, 2] },
    });
    const mcpReady = await fetch(`${mcpBaseUrl}/ready`);
    expect(mcpReady.status).toBe(503);
    expect(await mcpReady.json()).toMatchObject({
      status: 'not_ready',
      database: 'ok',
      migrations: { ready: false, pending: [1, 2] },
    });

    await Promise.all([stopServer(child), stopServer(mcpChild)]);
    expect(child.exitCode).toBe(0);
    expect(mcpChild.exitCode).toBe(0);
  }, 20_000);
});
