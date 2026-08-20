import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractRequestApiKey, getApiKey, parsePort, secretsMatch } from '../src/config.js';

const originalApiKey = process.env.TRACKER_API_KEY;
const originalApiKeyFile = process.env.TRACKER_API_KEY_FILE;
const temporaryDirectories = new Set<string>();

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.TRACKER_API_KEY;
  else process.env.TRACKER_API_KEY = originalApiKey;
  if (originalApiKeyFile === undefined) delete process.env.TRACKER_API_KEY_FILE;
  else process.env.TRACKER_API_KEY_FILE = originalApiKeyFile;
  for (const directory of temporaryDirectories) fs.rmSync(directory, { recursive: true, force: true });
  temporaryDirectories.clear();
});

describe('runtime configuration', () => {
  it('rejects missing and placeholder API keys', () => {
    delete process.env.TRACKER_API_KEY;
    expect(() => getApiKey()).toThrow(/TRACKER_API_KEY/);

    process.env.TRACKER_API_KEY = 'dev-key-change-me';
    expect(() => getApiKey()).toThrow(/TRACKER_API_KEY/);

    process.env.TRACKER_API_KEY = 'change-me-to-a-secret-key';
    expect(() => getApiKey()).toThrow(/TRACKER_API_KEY/);

    process.env.TRACKER_API_KEY = 'too-short';
    expect(() => getApiKey()).toThrow(/TRACKER_API_KEY/);
  });

  it('accepts a sufficiently long API key', () => {
    delete process.env.TRACKER_API_KEY_FILE;
    process.env.TRACKER_API_KEY = '  0123456789abcdef0123456789abcdef  ';
    expect(getApiKey()).toBe('0123456789abcdef0123456789abcdef');
  });

  it('reads an API key from a mounted secret file without allowing ambiguous configuration', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-secret-'));
    temporaryDirectories.add(directory);
    const secretPath = path.join(directory, 'work-api-key');
    fs.writeFileSync(secretPath, '0123456789abcdef0123456789abcdef\n', { mode: 0o600 });

    delete process.env.TRACKER_API_KEY;
    process.env.TRACKER_API_KEY_FILE = secretPath;
    expect(getApiKey()).toBe('0123456789abcdef0123456789abcdef');

    process.env.TRACKER_API_KEY = 'another-0123456789abcdef0123456789abcdef';
    expect(() => getApiKey()).toThrow(/only one/);
  });

  it('does not expose a secret file path read failure', () => {
    delete process.env.TRACKER_API_KEY;
    process.env.TRACKER_API_KEY_FILE = '/does/not/exist/work-api-key';
    expect(() => getApiKey()).toThrow('TRACKER_API_KEY_FILE could not be read');
  });

  it('validates ports', () => {
    expect(parsePort(undefined, 6970, 'PORT')).toBe(6970);
    expect(parsePort('', 6970, 'PORT')).toBe(6970);
    expect(parsePort('6969', 6970, 'PORT')).toBe(6969);
    expect(() => parsePort('0', 6970, 'PORT')).toThrow(/PORT/);
    expect(() => parsePort('65536', 6970, 'PORT')).toThrow(/PORT/);
    expect(() => parsePort('12x', 6970, 'PORT')).toThrow(/PORT/);
  });

  it('extracts and compares supported authentication headers', () => {
    const secret = '0123456789abcdef0123456789abcdef';
    expect(extractRequestApiKey({ authorization: `Bearer ${secret}` })).toBe(secret);
    expect(extractRequestApiKey({ authorization: `bearer ${secret}` })).toBe(secret);
    expect(extractRequestApiKey({ 'x-api-key': secret })).toBe(secret);
    expect(extractRequestApiKey({ 'x-api-key': secret, authorization: 'Bearer ignored' })).toBe(secret);
    expect(extractRequestApiKey({ authorization: `Basic ${secret}` })).toBeUndefined();
    expect(extractRequestApiKey({})).toBeUndefined();
    expect(secretsMatch(secret, secret)).toBe(true);
    expect(secretsMatch('wrong', secret)).toBe(false);
    expect(secretsMatch('x'.repeat(secret.length), secret)).toBe(false);
    expect(secretsMatch(undefined, secret)).toBe(false);
  });
});
