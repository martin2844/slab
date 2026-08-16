import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { runMigrations } from './db/migrate.js';
import { closeDb, getDb } from './db/connection.js';
import { getApiKey, parsePort } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import projectRoutes from './routes/project.js';
import issueRoutes from './routes/issue.js';
import issueCrudRoutes from './routes/issue-actions.js';
import searchRoutes from './routes/search.js';
import commentRoutes from './routes/comment.js';
import linkRoutes from './routes/link.js';
import historyRoutes from './routes/history.js';

const app = new Hono();
getApiKey();

// Global error handler
app.onError(errorHandler);

// Health check (no auth)
app.use('*', secureHeaders());
app.get('/health', (c) => {
  getDb().prepare('SELECT 1').get();
  return c.json({ status: 'ok' });
});

// Auth middleware for all API routes
app.use('/api/*', authMiddleware);
app.use('/api/*', bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ data: null, error: 'Request body too large' }, 413),
}));

// Mount routes
app.route('/api', searchRoutes);                     // /search, /blocked
app.route('/api/projects', projectRoutes);            // CRUD /projects
app.route('/api/projects', issueRoutes);              // POST/GET /:projectKey/issues

// Issue sub-routes (more specific paths first)
app.route('/api/issues', commentRoutes);              // /:key/comments
app.route('/api/issues', linkRoutes);                 // /:key/links
app.route('/api/issues', historyRoutes);              // /:key/history
app.route('/api/issues', issueCrudRoutes);            // GET/PATCH/DELETE /:key

// Run migrations and start server
const PORT = parsePort(process.env.PORT || process.env.TRACKER_PORT, 6970, 'PORT');

runMigrations();

const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`Slab API listening on 0.0.0.0:${info.port}`);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down Slab API`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
