import { afterEach, describe, expect, it } from 'vitest';
import { extractRequestApiKey, getApiKey, parsePort, secretsMatch } from '../src/config.js';

const originalApiKey = process.env.TRACKER_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.TRACKER_API_KEY;
  else process.env.TRACKER_API_KEY = originalApiKey;
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
    process.env.TRACKER_API_KEY = '  0123456789abcdef0123456789abcdef  ';
    expect(getApiKey()).toBe('0123456789abcdef0123456789abcdef');
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
