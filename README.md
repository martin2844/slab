# Slab — Barebones Issue Tracking (REST + MCP)

Barebones, no-UI issue tracker. REST API + MCP server. Designed for AI agents and CLI tools.

## Quick Start

```bash
cp .env.example .env        # configure
npm install
npm run dev                  # REST API on :3000
npm run mcp                  # MCP server on :3001
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

The MCP server supports two transport modes:

### HTTP Mode (remote access, default)

Runs on port 3001. Supports both modern StreamableHTTP and legacy SSE transports.

**StreamableHTTP** (recommended):
- `POST/GET/DELETE http://your-server:3001/mcp`

**SSE** (legacy fallback):
- `GET http://your-server:3001/sse`
- `POST http://your-server:3001/messages`

### Stdio Mode (local CLI)

```bash
TRACKER_MCP_MODE=stdio npm run mcp
```

### Claude Code Configuration

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

**Remote server (HTTP):**
```json
{
  "mcpServers": {
    "slab": {
      "url": "http://your-server:3001/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

**Local (stdio):**
```json
{
  "mcpServers": {
    "slab": {
      "command": "npx",
      "args": ["tsx", "/path/to/slab/src/mcp/server.ts"],
      "env": {
        "TRACKER_MCP_MODE": "stdio",
        "TRACKER_API_KEY": "your-api-key"
      }
    }
  }
}
```

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

## Development

```bash
npm run dev          # REST server with hot reload
npm run mcp          # MCP server
npm test             # Run tests
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
