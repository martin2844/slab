import { createMiddleware } from 'hono/factory';
import { getApiKey, secretsMatch } from '../config.js';

const API_KEY = getApiKey();

export const authMiddleware = createMiddleware(async (c, next) => {
  const key = c.req.header('X-API-Key');
  if (!secretsMatch(key, API_KEY)) {
    return c.json({ data: null, error: 'Unauthorized — valid X-API-Key header required' }, 401);
  }
  await next();
});
