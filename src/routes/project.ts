import { Hono } from 'hono';
import * as projectService from '../services/project.js';
import { createProjectSchema, updateProjectSchema } from '../schema/project.js';

const app = new Hono();

app.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.flatten() }, 400);
  }
  const project = projectService.createProject(parsed.data);
  return c.json({ data: project, error: null }, 201);
});

app.get('/', (c) => {
  const projects = projectService.listProjects();
  return c.json({ data: projects, error: null });
});

app.get('/:key', (c) => {
  const project = projectService.getProjectByKey(c.req.param('key'));
  if (!project) return c.json({ data: null, error: 'Project not found' }, 404);
  return c.json({ data: project, error: null });
});

app.patch('/:key', async (c) => {
  const body = await c.req.json();
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.flatten() }, 400);
  }
  const project = projectService.updateProject(c.req.param('key'), parsed.data);
  if (!project) return c.json({ data: null, error: 'Project not found' }, 404);
  return c.json({ data: project, error: null });
});

app.delete('/:key', (c) => {
  const deleted = projectService.deleteProject(c.req.param('key'));
  if (!deleted) return c.json({ data: null, error: 'Project not found' }, 404);
  return c.json({ data: null, error: null });
});

export default app;
