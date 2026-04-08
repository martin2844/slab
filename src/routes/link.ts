import { Hono } from 'hono';
import * as linkService from '../services/link.js';
import { createLinkSchema } from '../schema/link.js';

const app = new Hono();

app.post('/:key/links', async (c) => {
  const body = await c.req.json();
  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.flatten() }, 400);
  }
  const link = linkService.createLink(c.req.param('key'), parsed.data);
  if (!link) return c.json({ data: null, error: 'Could not create link — check issue keys' }, 400);
  return c.json({ data: link, error: null }, 201);
});

app.get('/:key/links', (c) => {
  const links = linkService.listLinks(c.req.param('key'));
  if (!links) return c.json({ data: null, error: 'Issue not found' }, 404);
  return c.json({ data: links, error: null });
});

app.delete('/:key/links/:id', (c) => {
  const deleted = linkService.deleteLink(c.req.param('id'));
  if (!deleted) return c.json({ data: null, error: 'Link not found' }, 404);
  return c.json({ data: null, error: null });
});

export default app;
