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
  const { expected_version, ...data } = parsed.data;
  try {
    const issue = issueService.updateIssue(
      c.req.param('key'),
      data,
      expected_version,
      'rest-api',
    );
    if (!issue) return c.json({ data: null, error: 'Issue not found' }, 404);
    return c.json({ data: issue, error: null });
  } catch (error) {
    if (error instanceof issueService.IssueVersionConflictError) {
      return c.json({ data: null, error: error.toJSON() }, 409);
    }
    throw error;
  }
});

app.delete('/:key', (c) => {
  const expectedVersion = Number(c.req.query('expected_version'));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return c.json({ data: null, error: 'expected_version is required' }, 400);
  }
  try {
    const deleted = issueService.deleteIssue(c.req.param('key'), expectedVersion);
    if (!deleted) return c.json({ data: null, error: 'Issue not found' }, 404);
    return c.json({ data: null, error: null });
  } catch (error) {
    if (error instanceof issueService.IssueVersionConflictError) {
      return c.json({ data: null, error: error.toJSON() }, 409);
    }
    throw error;
  }
});

export default app;
