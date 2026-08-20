import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';

const INSECURE_KEYS = new Set([
  'dev-key-change-me',
  'change-me-to-a-secret-key',
]);

export function getApiKey(): string {
  const directValue = process.env.TRACKER_API_KEY;
  const filePath = process.env.TRACKER_API_KEY_FILE?.trim();
  if (directValue !== undefined && filePath) {
    throw new Error('Set only one of TRACKER_API_KEY or TRACKER_API_KEY_FILE');
  }

  let key = directValue?.trim();
  if (filePath) {
    try {
      key = fs.readFileSync(filePath, 'utf8').trim();
    } catch {
      throw new Error('TRACKER_API_KEY_FILE could not be read');
    }
  }

  if (!key || INSECURE_KEYS.has(key) || key.length < 24) {
    throw new Error(
      'TRACKER_API_KEY or TRACKER_API_KEY_FILE must provide a unique secret containing at least 24 characters',
    );
  }
  return key;
}

export function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer between 1 and 65535`);

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

export function extractRequestApiKey(headers: Record<string, string | string[] | undefined>): string | undefined {
  const direct = headers['x-api-key'];
  if (typeof direct === 'string') return direct;

  const authorization = headers.authorization;
  if (typeof authorization !== 'string') return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

export function secretsMatch(candidate: string | undefined, expected: string): boolean {
  if (!candidate) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}
