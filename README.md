# Slab — Barebones Issue Tracking (REST + MCP)

Barebones, no-UI issue tracker. REST API + MCP server. Designed for AI agents and CLI tools.

## Quick Start

### Docker (recommended)

```bash
# Clone and configure
git clone https://github.com/martin2844/slab.git
cd slab
cp .env.example .env
# Edit .env — set TRACKER_API_KEY to a real secret

# Start REST API + MCP server
docker compose up -d
```

This starts:
- **REST API** on port 3000 (configurable via `PORT` in `.env`)
- **MCP server** on port 3001 (configurable via `TRACKER_MCP_PORT`)

### Without Docker

```bash
cp .env.example .env
npm install
npm run dev          # REST API on :3000
npm run mcp          # MCP server on :3001 (in another terminal)
```

### Pull the image directly

```bash
docker pull martin2844/slab:latest
docker run -d \
  -p 3000:3000 \
  -p 3001:3001 \
  -e TRACKER_API_KEY=your-secret-key \
  -v slab-data:/data \
  martin2844/slab:latest
```

## REST API

All endpoints require `X-API-Key` header.

```
# Create a project
curl -X POST http://localhost:3000/api/projects \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"key":"MYAPP","name":"My App"}'

# Create an issue
curl -X POST http://localhost:3000/api/projects/MYAPP/issues \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"type":"bug","title":"Login broken","priority":"high"}'

# Update status
curl -X PATCH http://localhost:3000/api/issues/MYAPP-1 \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"status":"in_progress","assignee":"alice"}'

# List issues
curl "http://localhost:3000/api/projects/MYAPP/issues?status=new,in_progress" \
  -H "X-API-Key: your-key"

# Search across projects
curl "http://localhost:3000/api/search?q=login" \
  -H "X-API-Key: your-key"

# Add a comment
curl -X POST http://localhost:3000/api/issues/MYAPP-1/comments \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"author":"alice","body":"Looking into this"}'

# Link issues
curl -X POST http://localhost:3000/api/issues/MYAPP-1/links \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"target_key":"MYAPP-2","type":"blocks"}'

# Get change history
curl http://localhost:3000/api/issues/MYAPP-1/history \
  -H "X-API-Key: your-key"
```

## MCP Integration

Slab exposes a full MCP server so AI agents can create, query, and manage issues directly.

The MCP server supports two transport modes:

### HTTP Mode (remote access, default)

Runs on port 3001. Supports both modern StreamableHTTP and legacy SSE transports.

| Transport | Protocol | Endpoints |
|-----------|----------|-----------|
| **StreamableHTTP** (recommended) | 2025-11-25 | `POST/GET/DELETE /mcp` |
| **SSE** (legacy fallback) | 2024-11-05 | `GET /sse`, `POST /messages` |

### Stdio Mode (local CLI)

```bash
TRACKER_MCP_MODE=stdio npm run mcp
```

### Claude Code Configuration

Add to your Claude Code settings. Open settings with `/settings` or edit directly:

**Project-level** (`.claude/settings.json` in your project):
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

**User-level** (`~/.claude/settings.json`) — makes slab available in all projects:
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

**Local stdio** (slab runs on the same machine):
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

Once configured, Claude Code can use slab tools directly:
- "Create a project called MYAPP"
- "Add a bug for the login issue"
- "What issues are assigned to me?"
- "Link MYAPP-1 as blocking MYAPP-2"
- "Show me all blocked issues"
- "Update MYAPP-3 to done"

### Cursor Configuration

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "slab": {
      "url": "http://your-server:3001/mcp"
    }
  }
}
```

### Any MCP Client

The MCP endpoint is at `http://your-server:3001/mcp`. Connect any MCP-compatible client using the StreamableHTTP transport.

## MCP Tools

| Tool | Description |
|------|-------------|
| `create_project` | Create a new project |
| `list_projects` | List all projects |
| `get_project` | Get project details |
| `update_project` | Update project name/description |
| `create_issue` | Create an issue (story/bug/task/epic) |
| `list_issues` | List issues with filters |
| `get_issue` | Get issue details by key |
| `update_issue` | Update issue fields/status |
| `delete_issue` | Delete an issue |
| `search_issues` | Search across all projects |
| `get_blocked_issues` | Find blocked issues |
| `add_comment` | Add a comment to an issue |
| `list_comments` | List comments on an issue |
| `link_issues` | Link two issues (blocks/depends_on/parent_of/relates) |
| `list_links` | List links for an issue |
| `unlink_issues` | Remove a link |
| `get_issue_history` | Get change audit trail |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | REST API port |
| `TRACKER_API_KEY` | `dev-key-change-me` | API key for auth |
| `TRACKER_MCP_PORT` | `3001` | MCP server port |
| `TRACKER_MCP_MODE` | `http` | `http` for remote, `stdio` for local |
| `TRACKER_DB_PATH` | `./slab.db` | SQLite database path |

## Development

```bash
npm run dev          # REST server with hot reload
npm run mcp          # MCP server
npm test             # Run tests (58 tests)
npm run test:watch   # Watch mode
npm run build        # Compile TypeScript
```

## Architecture

```
src/
  index.ts              REST API entry point
  types.ts              Shared TypeScript types
  db/
    connection.ts       SQLite connection
    migrate.ts          Migration runner
    migrations/         SQL migration files
  schema/               Zod validation schemas
  services/             Data layer (CRUD operations)
  routes/               Hono REST route handlers
  middleware/           Auth + error handling
  mcp/
    server.ts           MCP server (HTTP + stdio)
```

## License

MIT
