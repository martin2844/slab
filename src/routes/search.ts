import { Hono } from 'hono';
import * as issueService from '../services/issue.js';

// Global query routes — mounted at /api
const app = new Hono();

app.get('/search', (c) => {
  const q = c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const result = issueService.searchIssues(q, limit, offset);
  return c.json({
    data: result.data,
    total: result.total,
    offset,
    limit,
    error: null,
  });
});

app.get('/blocked', (c) => {
  const issues = issueService.getBlockedIssues();
  return c.json({ data: issues, error: null });
});

export default app;
