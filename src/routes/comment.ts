import { Hono } from 'hono';
import * as commentService from '../services/comment.js';
import { createCommentSchema } from '../schema/comment.js';

const app = new Hono();

app.post('/:key/comments', async (c) => {
  const body = await c.req.json();
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.flatten() }, 400);
  }
  const comment = commentService.addComment(c.req.param('key'), parsed.data);
  if (!comment) return c.json({ data: null, error: 'Issue not found' }, 404);
  return c.json({ data: comment, error: null }, 201);
});

app.get('/:key/comments', (c) => {
  const comments = commentService.listComments(c.req.param('key'));
  if (comments === null) return c.json({ data: null, error: 'Issue not found' }, 404);
  return c.json({ data: comments, error: null });
});

app.delete('/:key/comments/:id', (c) => {
  const deleted = commentService.deleteComment(c.req.param('key'), c.req.param('id'));
  if (!deleted) return c.json({ data: null, error: 'Comment not found' }, 404);
  return c.json({ data: null, error: null });
});

export default app;
