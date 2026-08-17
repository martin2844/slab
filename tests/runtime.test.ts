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

  it('starts the MCP server, authenticates initialization, then shuts down cleanly', async () => {
    const port = await getFreePort();
    const { child, logs } = startServer('src/mcp/server.ts', {
      TRACKER_MCP_PORT: String(port),
      TRACKER_MCP_MODE: 'http',
      TRACKER_API_KEY: TEST_API_KEY,
      TRACKER_DB_PATH: makeDatabasePath('slab-mcp-'),
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitUntilHealthy(`${baseUrl}/health`, child, logs);

    const unauthorized = await fetch(`${baseUrl}/mcp`);
    expect(unauthorized.status).toBe(401);

    const initialized = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${TEST_API_KEY}`,
        'Content-Type': 'application/json',
      },
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
    expect(await initialized.text()).toContain('"name":"slab"');

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
});
