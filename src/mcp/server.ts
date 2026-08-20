#!/usr/bin/env node

import { randomUUID } from 'crypto';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getMigrationStatus, runMigrations, shouldRunMigrations } from '../db/migrate.js';
import { closeDb, getDb } from '../db/connection.js';
import { extractRequestApiKey, getApiKey, parsePort, secretsMatch } from '../config.js';
import * as projectSvc from '../services/project.js';
import * as issueSvc from '../services/issue.js';
import * as commentSvc from '../services/comment.js';
import * as linkSvc from '../services/link.js';
import * as historySvc from '../services/history.js';
import {
  commentMutationResult,
  issueMutationResult,
  issueSummary,
  projectSummary,
} from './payloads.js';

if (shouldRunMigrations()) runMigrations();

// ── Tool Definitions ───────────────────────────────────────

function registerTools(server: McpServer) {

  // ── Projects ───────────────────────────────────────────

  server.tool('create_project',
    'Create a new project to group issues under. Every issue belongs to a project. ' +
    'Returns the created project with its key, which is used in all subsequent issue operations. ' +
    'Example: create_project(key="MYAPP", name="My Application") creates project MYAPP; issues will be numbered MYAPP-1, MYAPP-2, etc.',
    {
      key: z.string().describe('Short uppercase key for the project (2-10 chars, letters and digits, must start with a letter). Used as prefix for all issue keys. Example: "MYAPP"'),
      name: z.string().describe('Human-readable project name. Example: "My Application"'),
      description: z.string().optional().describe('Optional project description. Markdown supported.'),
    },
    async (args) => {
      try {
        const project = projectSvc.createProject(args);
        return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    });

  server.tool('list_projects',
    'List project metadata for discovery. Does not return project descriptions. Use get_project to read one complete project.',
    {},
    async () => {
      const projects = projectSvc.listProjects();
      return { content: [{ type: 'text', text: JSON.stringify(projects.map(projectSummary)) }] };
    });

  server.tool('get_project',
    'Get full details for a single project by its key. Returns name, description, and timestamps.',
    {
      key: z.string().describe('Project key (e.g. "MYAPP")'),
    },
    async ({ key }) => {
      const project = projectSvc.getProjectByKey(key);
      if (!project) return { content: [{ type: 'text', text: `Project "${key}" not found. Use list_projects to see available projects.` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
    });

  server.tool('update_project',
    'Update a project\'s name or description. You cannot change the project key after creation.',
    {
      key: z.string().describe('Project key to update'),
      name: z.string().optional().describe('New project name'),
      description: z.string().nullable().optional().describe('New description (pass null to clear)'),
    },
    async ({ key, ...data }) => {
      const project = projectSvc.updateProject(key, data);
      if (!project) return { content: [{ type: 'text', text: `Project "${key}" not found` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
    });

  // ── Issues ─────────────────────────────────────────────

  server.tool('create_issue',
    'Create a new issue (story, bug, task, or epic) in a project. ' +
    'Returns the issue with its auto-generated key (e.g. MYAPP-1). ' +
    'New issues default to status "new" and priority "medium" unless specified.',
    {
      project_key: z.string().describe('Project key to create the issue in (e.g. "MYAPP"). Must match an existing project.'),
      type: z.enum(['epic', 'story', 'task', 'bug']).default('task')
        .describe('Issue type. Use "epic" for large features, "story" for user-facing work, "task" for general work items, "bug" for defects.'),
      title: z.string().describe('Short summary of the issue (max 500 chars). Should be concise and actionable.'),
      description: z.string().optional().describe('Detailed description. Full Markdown supported. Include acceptance criteria, steps to reproduce (for bugs), or technical notes.'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium')
        .describe('Priority level. Use "critical" for blockers, "high" for important, "medium" for normal, "low" for nice-to-have.'),
      assignee: z.string().optional().describe('Person or agent responsible (email, username, or agent ID). Can be changed later.'),
      labels: z.array(z.string()).default([])
        .describe('Tags for categorization (e.g. ["backend", "performance"]). Max 20 labels.'),
    },
    async (args) => {
      const { project_key, ...data } = args;
      const issue = issueSvc.createIssue(project_key, data);
      if (!issue) return { content: [{ type: 'text', text: `Project "${project_key}" not found. Use list_projects to see available projects.` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(issueMutationResult(issue, Object.keys(data))) }] };
    });

  server.tool('list_issues',
    'List issues in a project with optional filters. Supports filtering by status, type, priority, assignee, labels, and full-text search. ' +
    'Returns metadata-only paginated results with total count; descriptions and comments are not included. Use get_issue to read one complete issue.',
    {
      project_key: z.string().describe('Project key (e.g. "MYAPP")'),
      status: z.array(z.enum(['new', 'in_progress', 'done'])).optional()
        .describe('Filter to issues with any of these statuses. Example: ["new", "in_progress"] shows all open work.'),
      type: z.array(z.enum(['epic', 'story', 'task', 'bug'])).optional()
        .describe('Filter to issues of these types. Example: ["bug"] shows only bugs.'),
      priority: z.array(z.enum(['critical', 'high', 'medium', 'low'])).optional()
        .describe('Filter by priority levels.'),
      assignee: z.string().optional().describe('Filter to issues assigned to this person/agent (exact match).'),
      label: z.array(z.string()).optional().describe('Filter to issues containing ALL of these labels.'),
      search: z.string().optional().describe('Full-text search across issue title and description.'),
      limit: z.number().default(50).describe('Maximum number of results to return (1-100).'),
      offset: z.number().default(0).describe('Number of results to skip for pagination.'),
    },
    async ({ project_key, ...query }) => {
      const result = issueSvc.listIssues(project_key, query as any);
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, data: result.data.map(issueSummary) }) }] };
    });

  server.tool('get_issue',
    'Get full details for a single issue by its key. Returns all fields including description, labels, assignee, timestamps, and current status. ' +
    'Use this to inspect an issue before updating or commenting.',
    {
      key: z.string().describe('Issue key (e.g. "MYAPP-1"). Format is always PROJECTKEY-NUMBER.'),
    },
    async ({ key }) => {
      const issue = issueSvc.getIssueByKey(key);
      if (!issue) return { content: [{ type: 'text', text: `Issue "${key}" not found. Check the key format (PROJECTKEY-NUMBER, e.g. MYAPP-1).` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    });

  server.tool('update_issue',
    'Update an issue\'s fields. Only include fields you want to change. ' +
    'Status transitions: any status can transition to any other status ("new" → "in_progress" → "done", or any combination). ' +
    'Setting status to "done" automatically sets resolved_at. All changes are recorded in the issue history. ' +
    'Pass expected_version from the latest issue read. If the issue changed, the tool returns VERSION_CONFLICT; fetch it again and reconsider before retrying. ' +
    'Examples: update_issue(key="MYAPP-1", expected_version=3, status="in_progress", assignee="alice") to start work; update_issue(key="MYAPP-1", expected_version=4, status="done") to close.',
    {
      key: z.string().describe('Issue key to update (e.g. "MYAPP-1")'),
      expected_version: z.number().int().positive()
        .describe('Version from the latest get_issue, list_issues, search_issues, or get_blocked_issues response'),
      type: z.enum(['epic', 'story', 'task', 'bug']).optional().describe('Change the issue type'),
      title: z.string().optional().describe('New title'),
      description: z.string().nullable().optional().describe('New description (pass null to clear). Markdown supported.'),
      status: z.enum(['new', 'in_progress', 'done']).optional()
        .describe('New status. "new" = not started, "in_progress" = being worked on, "done" = completed.'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('New priority level'),
      assignee: z.string().nullable().optional().describe('New assignee (pass null/empty to unassign)'),
      labels: z.array(z.string()).optional().describe('Replace all labels with this list'),
      author: z.string().default('mcp-agent').describe('Who is making this change (recorded in history)'),
    },
    async ({ key, expected_version, author, ...data }) => {
      try {
        const issue = issueSvc.updateIssue(key, data, expected_version, author);
        if (!issue) return { content: [{ type: 'text', text: `Issue "${key}" not found` }], isError: true };
        return { content: [{ type: 'text', text: JSON.stringify(issueMutationResult(issue, Object.keys(data))) }] };
      } catch (error) {
        if (error instanceof issueSvc.IssueVersionConflictError) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: error.toJSON() }),
            }],
            isError: true,
          };
        }
        throw error;
      }
    });

  server.tool('delete_issue',
    'Permanently delete an issue and all its comments, links, and history. This cannot be undone. Pass expected_version from the latest issue read.',
    {
      key: z.string().describe('Issue key to delete (e.g. "MYAPP-1")'),
      expected_version: z.number().int().positive()
        .describe('Version from the latest issue read'),
    },
    async ({ key, expected_version }) => {
      try {
        const deleted = issueSvc.deleteIssue(key, expected_version);
        if (!deleted) return { content: [{ type: 'text', text: `Issue "${key}" not found` }], isError: true };
        return { content: [{ type: 'text', text: JSON.stringify({ key, deleted: true }) }] };
      } catch (error) {
        if (error instanceof issueSvc.IssueVersionConflictError) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.toJSON() }) }],
            isError: true,
          };
        }
        throw error;
      }
    });

  server.tool('search_issues',
    'Search issues across ALL projects by text query. Searches both titles and descriptions. ' +
    'Returns metadata-only matches for discovery. Use this when you don\'t know which project an issue belongs to, then get_issue to read the complete issue.',
    {
      q: z.string().describe('Search query. Matches against issue titles and descriptions (case-insensitive substring match).'),
      limit: z.number().default(50).describe('Max results'),
      offset: z.number().default(0).describe('Skip N results'),
    },
    async ({ q, limit, offset }) => {
      const result = issueSvc.searchIssues(q, limit, offset);
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, data: result.data.map(issueSummary) }) }] };
    });

  server.tool('get_blocked_issues',
    'List all issues that are currently blocked by other unfinished issues. ' +
    'An issue is blocked if another non-"done" issue has a "blocks" link pointing to it. ' +
    'Returns issue metadata without descriptions or comments. Use this to identify work that cannot proceed until dependencies are resolved, then get_issue for full details.',
    {},
    async () => {
      const issues = issueSvc.getBlockedIssues();
      return { content: [{ type: 'text', text: JSON.stringify(issues.map(issueSummary)) }] };
    });

  // ── Comments ───────────────────────────────────────────

  server.tool('add_comment',
    'Add a comment to an issue. Comments support Markdown and are displayed chronologically. ' +
    'Use for progress updates, questions, notes, or context that doesn\'t belong in the issue description.',
    {
      issue_key: z.string().describe('Issue key to comment on (e.g. "MYAPP-1")'),
      author: z.string().describe('Name or identifier of the commenter'),
      body: z.string().describe('Comment text. Full Markdown supported.'),
    },
    async ({ issue_key, ...data }) => {
      const comment = commentSvc.addComment(issue_key, data);
      if (!comment) return { content: [{ type: 'text', text: `Issue "${issue_key}" not found` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(commentMutationResult(comment)) }] };
    });

  server.tool('list_comments',
    'List all comments on an issue in chronological order (oldest first).',
    {
      issue_key: z.string().describe('Issue key (e.g. "MYAPP-1")'),
    },
    async ({ issue_key }) => {
      const comments = commentSvc.listComments(issue_key);
      if (!comments) return { content: [{ type: 'text', text: `Issue "${issue_key}" not found` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(comments, null, 2) }] };
    });

  // ── Links ──────────────────────────────────────────────

  server.tool('link_issues',
    'Create a relationship between two issues. Link types:\n' +
    '- "blocks": source issue blocks the target (target cannot proceed until source is done)\n' +
    '- "depends_on": source depends on target (source needs target to be done first)\n' +
    '- "relates": generic relationship between issues\n' +
    '- "parent_of": source is the parent of target (use for epic → story, story → task hierarchy)\n' +
    'Example: link_issues(source_key="MYAPP-1", target_key="MYAPP-2", type="blocks") means MYAPP-2 is blocked by MYAPP-1.',
    {
      source_key: z.string().describe('Source issue key (the one doing the blocking/parenting/depending)'),
      target_key: z.string().describe('Target issue key (the one being blocked/child/dependency)'),
      type: z.enum(['blocks', 'relates', 'depends_on', 'parent_of'])
        .describe('Type of relationship. "blocks" = source prevents target from proceeding, "depends_on" = source needs target first, "parent_of" = source contains target, "relates" = generic.'),
    },
    async ({ source_key, target_key, type }) => {
      const link = linkSvc.createLink(source_key, { target_key, type });
      if (!link) return { content: [{ type: 'text', text: `Could not create link. Check that both issue keys exist and are different.` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(link, null, 2) }] };
    });

  server.tool('list_links',
    'List all links for an issue, separated into outward (this issue links to others) and inward (other issues link to this one). ' +
    'Use this to understand an issue\'s dependencies and relationships.',
    {
      issue_key: z.string().describe('Issue key (e.g. "MYAPP-1")'),
    },
    async ({ issue_key }) => {
      const links = linkSvc.listLinks(issue_key);
      if (!links) return { content: [{ type: 'text', text: `Issue "${issue_key}" not found` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(links, null, 2) }] };
    });

  server.tool('unlink_issues',
    'Remove a link between issues by the link\'s ID. Get the link ID from list_links first.',
    {
      link_id: z.string().describe('UUID of the link to remove (get from list_links)'),
    },
    async ({ link_id }) => {
      const deleted = linkSvc.deleteLink(link_id);
      if (!deleted) return { content: [{ type: 'text', text: `Link ${link_id} not found` }], isError: true };
      return { content: [{ type: 'text', text: 'Link removed' }] };
    });

  // ── History ────────────────────────────────────────────

  server.tool('get_issue_history',
    'Get the full change history (audit trail) for an issue. Shows every field change with old/new values, who made the change, and when. ' +
    'Use to understand what happened to an issue over time.',
    {
      issue_key: z.string().describe('Issue key (e.g. "MYAPP-1")'),
    },
    async ({ issue_key }) => {
      const history = historySvc.getHistory(issue_key);
      if (!history) return { content: [{ type: 'text', text: `Issue "${issue_key}" not found` }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(history, null, 2) }] };
    });
}

// ── Create a fresh MCP server instance ─────────────────────

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'slab',
    version: '0.1.0',
  });
  registerTools(server);
  return server;
}

// ── Transport Selection ────────────────────────────────────

const MCP_PORT = parsePort(process.env.TRACKER_MCP_PORT, 6969, 'TRACKER_MCP_PORT');
const MCP_MODE = process.env.TRACKER_MCP_MODE || 'http'; // 'http' | 'stdio'

if (MCP_MODE !== 'http' && MCP_MODE !== 'stdio') {
  throw new Error('TRACKER_MCP_MODE must be either "http" or "stdio"');
}

if (MCP_MODE === 'stdio') {
  // Local stdio transport (for CLI tools on the same machine)
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  server.connect(transport).catch((error) => {
    console.error('Failed to start Slab MCP stdio server:', error);
    closeDb();
    process.exit(1);
  });
  console.error('Slab MCP server running on stdio');

  const shutdown = async () => {
    try { await server.close(); } finally {
      closeDb();
      process.exit(0);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} else {
  // HTTP transport: StreamableHTTP (modern) + SSE fallback (legacy clients)
  const app = express();
  const apiKey = getApiKey();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/ready', (_req, res) => {
    try {
      getDb().prepare('SELECT 1').get();
      const migrations = getMigrationStatus();
      if (!migrations.ready) {
        res.status(503).json({ status: 'not_ready', database: 'ok', migrations });
        return;
      }
      res.json({ status: 'ready', database: 'ok', migrations });
    } catch {
      res.status(503).json({ status: 'not_ready', database: 'error' });
    }
  });

  app.use((req, res, next) => {
    const candidate = extractRequestApiKey(req.headers);
    if (!secretsMatch(candidate, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const transports: Record<string, any> = {};

  // ── Streamable HTTP (protocol version 2025-11-25) ───────
  app.all('/mcp', async (req: any, res: any) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: any;

    try {
      if (sessionId && transports[sessionId] instanceof StreamableHTTPServerTransport) {
        transport = transports[sessionId];
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            transports[sid] = transport;
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) delete transports[sid];
        };
        const server = createMcpServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      console.error('MCP request error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // ── SSE fallback (protocol version 2024-11-05) ──────────
  app.get('/sse', async (req: any, res: any) => {
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    res.on('close', () => {
      delete transports[transport.sessionId];
    });
    const server = createMcpServer();
    await server.connect(transport);
  });

  app.post('/messages', async (req: any, res: any) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (!transport || !(transport instanceof SSEServerTransport)) {
      res.status(400).send('Invalid session');
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  // ── Start ───────────────────────────────────────────────
  app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body too large' });
      return;
    }
    next(error);
  });

  const httpServer = app.listen(MCP_PORT, '0.0.0.0', () => {
    console.log(`Slab MCP server listening on 0.0.0.0:${MCP_PORT}`);
    console.log(`  Streamable HTTP: POST/GET/DELETE /mcp`);
    console.log(`  SSE (legacy):    GET /sse, POST /messages`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down Slab MCP server`);
    for (const sid in transports) {
      try { await transports[sid].close(); } catch {}
      delete transports[sid];
    }
    httpServer.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
