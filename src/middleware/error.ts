import type { ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Error:', err);
  return c.json({ data: null, error: err.message || 'Internal server error' }, 500);
};
