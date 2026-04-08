import { createMiddleware } from 'hono/factory';

const API_KEY = process.env.TRACKER_API_KEY || 'dev-key-change-me';

export const authMiddleware = createMiddleware(async (c, next) => {
  const key = c.req.header('X-API-Key');
  if (!key || key !== API_KEY) {
    return c.json({ data: null, error: 'Unauthorized — valid X-API-Key header required' }, 401);
  }
  await next();
});
