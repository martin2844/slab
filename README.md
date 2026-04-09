<div align="center">

<img src="slab.png" alt="Slab" width="120" />

# Slab

**Headless issue tracking for AI-native workflows**

*Flat, bare, no-UI. Just the raw surface.*

REST API + MCP server. No UI. Built for agents, CLI tools, and automation.

[![GitHub license](https://img.shields.io/github/license/martin2844/slab?color=blue)](https://github.com/martin2844/slab/blob/master/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org/)
[![Docker Pulls](https://img.shields.io/docker/pulls/martin2844/slab.svg)](https://hub.docker.com/r/martin2844/slab)
[![Tests](https://img.shields.io/badge/tests-58%20passing-brightgreen)](https://github.com/martin2844/slab)
[![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen)](https://github.com/martin2844/slab)

[Getting Started](#getting-started) · [MCP Integration](#mcp-integration) · [REST API](#rest-api) · [Configuration](#configuration) · [Architecture](#architecture)

</div>

---

## What is Slab?

Slab is a **headless project management tool** — like Jira without the UI. It exposes a full issue tracking system through a REST API and an MCP (Model Context Protocol) server, purpose-built for AI agents and developer tooling.

No dashboards. No boards. No sprints. Just a clean API that lets your tools track work.

## Features

- **Projects** — group issues under namespace keys (e.g. `MYAPP-1`, `MYAPP-2`)
- **Issues** — stories, bugs, tasks, and epics with priority, assignee, and labels
- **Status workflow** — `new` → `in_progress` → `done` (any transition allowed)
- **Comments** — Markdown comments on any issue
- **Links** — `blocks`, `depends_on`, `parent_of`, `relates` relationships between issues
- **History** — immutable audit trail of every field change
- **Search** — full-text search across all projects
- **MCP server** — 17 tools for AI agent integration (Claude Code, Cursor, any MCP client)
- **REST API** — full CRUD with filtering, pagination, and API key auth
- **SQLite** — zero-config, single-file database
- **Docker** — multi-stage Alpine image, docker-compose included

## Getting Started

### Docker (recommended)

```bash
docker pull martin2844/slab:latest

docker run -d \
  -p 3000:3000 \
  -p 3001:3001 \
  -e TRACKER_API_KEY=your-secret-key \
  -v slab-data:/data \
  martin2844/slab:latest
```

Or with docker-compose:

```bash
git clone https://github.com/martin2844/slab.git
cd slab
cp .env.example .env
# Edit TRACKER_API_KEY in .env
docker compose up -d
```

This starts:
- **REST API** on port `3000`
- **MCP server** on port `3001`

### From Source

```bash
git clone https://github.com/martin2844/slab.git
cd slab
npm install
npm run dev          # REST API on :3000
npm run mcp          # MCP server on :3001
```

### Verify

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## MCP Integration

Slab exposes a full MCP server so AI agents can create, query, and manage issues directly — no REST calls needed.

### Transport

| Transport | Protocol | Endpoints |
|-----------|----------|-----------|
| **StreamableHTTP** | 2025-11-25 | `POST / GET / DELETE http://host:3001/mcp` |
| **SSE** (legacy) | 2024-11-05 | `GET /sse`, `POST /messages` |
| **Stdio** | — | Local process, for CLI tools |

### Claude Code

Add to your settings (`/settings` in Claude Code, or edit directly):

**Project-level** (`.claude/settings.json`):
```json
{
  "mcpServers": {
    "slab": {
      "type": "http",
      "url": "http://your-server:3001/mcp"
    }
  }
}
```

**Global** (`~/.claude/settings.json`) — available in all projects:
```json
{
  "mcpServers": {
    "slab": {
      "type": "http",
      "url": "http://your-server:3001/mcp"
    }
  }
}
```

**Local stdio**:
```json
{
  "mcpServers": {
    "slab": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/slab/src/mcp/server.ts"],
      "env": {
        "TRACKER_MCP_MODE": "stdio",
        "TRACKER_API_KEY": "your-secret-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "slab": {
      "type": "http",
      "url": "http://your-server:3001/mcp"
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `create_project` | Create a new project with a key and name |
| `list_projects` | List all projects |
| `get_project` | Get project details by key |
| `update_project` | Update project name or description |
| `create_issue` | Create an issue (story / bug / task / epic) |
| `list_issues` | List issues with filters (status, type, priority, assignee, labels, search) |
| `get_issue` | Get issue details by key (e.g. `MYAPP-1`) |
| `update_issue` | Update issue fields, change status, reassign |
| `delete_issue` | Delete an issue permanently |
| `search_issues` | Full-text search across all projects |
| `get_blocked_issues` | List issues blocked by other unfinished issues |
| `add_comment` | Add a Markdown comment to an issue |
| `list_comments` | List comments on an issue |
| `link_issues` | Link two issues (blocks / depends_on / parent_of / relates) |
| `list_links` | List outward and inward links for an issue |
| `unlink_issues` | Remove a link by ID |
| `get_issue_history` | Get the full change audit trail for an issue |

### Usage Examples

Once connected, just ask your AI agent naturally:

> *"Create a project called MYAPP"*
> *"Add a critical bug for the login crash"*
> *"What's blocking MYAPP-2?"*
> *"Show me all in-progress issues assigned to alice"*
> *"Mark MYAPP-3 as done"*
> *"Link MYAPP-1 as the parent of MYAPP-5"*

## REST API

All endpoints require the `X-API-Key` header.

### Projects

```
POST   /api/projects                    Create a project
GET    /api/projects                    List all projects
GET    /api/projects/:key               Get project
PATCH  /api/projects/:key               Update project
DELETE /api/projects/:key               Delete project + issues
```

### Issues

```
POST   /api/projects/:key/issues        Create issue
GET    /api/projects/:key/issues        List issues (with filters)
GET    /api/issues/:key                 Get issue
PATCH  /api/issues/:key                 Update issue
DELETE /api/issues/:key                 Delete issue
GET    /api/search?q=query             Search across projects
GET    /api/blocked                    List blocked issues
```

**Query parameters** for listing issues: `status`, `type`, `priority`, `assignee`, `label`, `search`, `limit`, `offset`

### Comments, Links, History

```
POST   /api/issues/:key/comments        Add comment
GET    /api/issues/:key/comments        List comments
DELETE /api/issues/:key/comments/:id    Delete comment

POST   /api/issues/:key/links           Create link
GET    /api/issues/:key/links           List links (outward + inward)
DELETE /api/issues/:key/links/:id       Remove link

GET    /api/issues/:key/history         Get change history
```

### Response Format

```json
{
  "data": { ... },
  "error": null
}
```

Lists include pagination:

```json
{
  "data": [ ... ],
  "total": 42,
  "offset": 0,
  "limit": 50,
  "error": null
}
```

### Quick Examples

```bash
# Create a project
curl -X POST http://localhost:3000/api/projects \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"key":"MYAPP","name":"My App"}'

# Create a bug
curl -X POST http://localhost:3000/api/projects/MYAPP/issues \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"type":"bug","title":"Login broken","priority":"high","labels":["auth"]}'

# Start working on it
curl -X PATCH http://localhost:3000/api/issues/MYAPP-1 \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"status":"in_progress","assignee":"alice"}'

# List open issues
curl "http://localhost:3000/api/projects/MYAPP/issues?status=new,in_progress" \
  -H "X-API-Key: your-key"

# Search
curl "http://localhost:3000/api/search?q=login" \
  -H "X-API-Key: your-key"
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | REST API port |
| `TRACKER_API_KEY` | `dev-key-change-me` | API key for authentication |
| `TRACKER_MCP_PORT` | `3001` | MCP server port (HTTP mode) |
| `TRACKER_MCP_MODE` | `http` | `http` for remote, `stdio` for local CLI |
| `TRACKER_DB_PATH` | `./slab.db` | SQLite database file path |

## Development

```bash
npm install             # Install dependencies
npm run dev             # REST server with hot reload
npm run mcp             # MCP server (HTTP mode)
npm run build           # Compile TypeScript
npm test                # Run test suite (58 tests)
npm run test:coverage   # Run tests with coverage report
npm run test:watch      # Run tests in watch mode
```

### Test Coverage

```
File            | Stmts  | Branch | Funcs  | Lines
----------------|--------|--------|--------|------
All files       | 90.4%  | 87.4%  | 88.2%  | 90.9%
  services/     | 91.5%  | 87.9%  | 87.1%  | 92.1%
  db/           | 70.0%  | 75.0%  | 100.%  | 70.0%
```

## Architecture

```
src/
├── index.ts                REST API entry point
├── types.ts                Shared TypeScript types
├── db/
│   ├── connection.ts       SQLite connection singleton
│   ├── migrate.ts          Migration runner
│   └── migrations/         Numbered SQL migration files
├── schema/                 Zod validation schemas
│   ├── project.ts
│   ├── issue.ts
│   ├── comment.ts
│   └── link.ts
├── services/               Data layer — all CRUD operations
│   ├── project.ts
│   ├── issue.ts
│   ├── comment.ts
│   ├── link.ts
│   └── history.ts
├── routes/                 Hono route handlers
│   ├── project.ts
│   ├── issue.ts
│   ├── issue-actions.ts
│   ├── search.ts
│   ├── comment.ts
│   ├── link.ts
│   └── history.ts
├── middleware/
│   ├── auth.ts             X-API-Key validation
│   └── error.ts            Global error handler
└── mcp/
    └── server.ts           MCP server (StreamableHTTP + SSE + stdio)
```

**Stack:** TypeScript · Hono · SQLite (better-sqlite3) · Zod · MCP SDK · Express (MCP transport)

## What Slab is Not

No UI. No user accounts. No custom workflows. No time tracking. No file uploads. No notifications. No sprints. No boards. No dashboards.

If you need those, use Jira, Linear, or GitHub Issues. Slab is the headless backend that your tools talk to.

## License

[MIT](LICENSE)
