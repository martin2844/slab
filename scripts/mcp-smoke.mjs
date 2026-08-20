#!/usr/bin/env node

const [baseUrl, apiKey, expectedProject] = process.argv.slice(2);
if (!baseUrl || !apiKey || !expectedProject) {
  console.error('Usage: mcp-smoke.mjs <base-url> <api-key> <expected-project-key>');
  process.exit(2);
}

const headers = {
  Accept: 'application/json, text/event-stream',
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
};

async function request(body, sessionId) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: sessionId ? { ...headers, 'Mcp-Session-Id': sessionId } : headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`MCP request failed with HTTP ${response.status}`);
  return response;
}

function parseEvent(text) {
  const data = text.split('\n')
    .find(line => line.startsWith('data: '))
    ?.slice('data: '.length);
  if (!data) throw new Error('MCP response did not contain a data event');
  return JSON.parse(data);
}

const initialized = await request({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'slab-container-smoke', version: '1.0.0' },
  },
});
const sessionId = initialized.headers.get('mcp-session-id');
if (!sessionId) throw new Error('MCP server did not return a session ID');
parseEvent(await initialized.text());

await request({
  jsonrpc: '2.0',
  method: 'notifications/initialized',
}, sessionId);

const called = await request({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: { name: 'list_projects', arguments: {} },
}, sessionId);
const payload = parseEvent(await called.text());
const toolText = payload?.result?.content?.find(item => item.type === 'text')?.text;
if (!toolText || !toolText.includes(expectedProject)) {
  throw new Error(`MCP list_projects did not contain ${expectedProject}`);
}

console.log('Slab MCP shared-volume check passed.');
