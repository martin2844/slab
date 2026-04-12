import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { runMigrations } from './db/migrate.js';
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

// Global error handler
app.onError(errorHandler);

// Health check (no auth)
app.get('/health', (c) => c.json({ status: 'ok' }));

// Auth middleware for all API routes
app.use('/api/*', authMiddleware);

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
const PORT = parseInt(process.env.PORT || process.env.TRACKER_PORT || '6970');

runMigrations();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Slab API running on http://localhost:${info.port}`);
  console.log(`API Key: ${process.env.TRACKER_API_KEY || 'dev-key-change-me'}`);
});
