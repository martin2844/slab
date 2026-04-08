import { Hono } from 'hono';
import * as historyService from '../services/history.js';

const app = new Hono();

app.get('/:key/history', (c) => {
  const history = historyService.getHistory(c.req.param('key'));
  if (!history) return c.json({ data: null, error: 'Issue not found' }, 404);
  return c.json({ data: history, error: null });
});

export default app;
