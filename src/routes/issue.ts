import { Hono } from 'hono';
import * as issueService from '../services/issue.js';
import { createIssueSchema, listIssuesQuerySchema } from '../schema/issue.js';

const app = new Hono();

// Create issue in a project
app.post('/:projectKey/issues', async (c) => {
  const body = await c.req.json();
  const parsed = createIssueSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.flatten() }, 400);
  }
  const issue = issueService.createIssue(c.req.param('projectKey'), parsed.data);
  if (!issue) return c.json({ data: null, error: 'Project not found' }, 404);
  return c.json({ data: issue, error: null }, 201);
});

// List issues in a project
app.get('/:projectKey/issues', (c) => {
  const query = listIssuesQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ data: null, error: query.error.flatten() }, 400);
  }
  const result = issueService.listIssues(c.req.param('projectKey'), query.data);
  return c.json({
    data: result.data,
    total: result.total,
    offset: query.data.offset,
    limit: query.data.limit,
    error: null,
  });
});

export default app;
