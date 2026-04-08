import { Hono } from 'hono';
import * as issueService from '../services/issue.js';
import { updateIssueSchema } from '../schema/issue.js';

// Routes for GET/PATCH/DELETE /:key — mounted at /api/issues
const app = new Hono();

app.get('/:key', (c) => {
  const issue = issueService.getIssueByKey(c.req.param('key'));
  if (!issue) return c.json({ data: null, error: 'Issue not found' }, 404);
  return c.json({ data: issue, error: null });
});

app.patch('/:key', async (c) => {
  const body = await c.req.json();
  const parsed = updateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.flatten() }, 400);
  }
  const issue = issueService.updateIssue(c.req.param('key'), parsed.data);
  if (!issue) return c.json({ data: null, error: 'Issue not found' }, 404);
  return c.json({ data: issue, error: null });
});

app.delete('/:key', (c) => {
  const deleted = issueService.deleteIssue(c.req.param('key'));
  if (!deleted) return c.json({ data: null, error: 'Issue not found' }, 404);
  return c.json({ data: null, error: null });
});

export default app;
