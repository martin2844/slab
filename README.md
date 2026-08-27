<div align="center">

<img src="slab.png" alt="Slab" width="100%" />

# Slab

**Headless issue tracking for AI-native workflows**

*Flat, bare, no-UI. Just the raw surface.*

REST API + MCP server. No UI. Built for agents, CLI tools, and automation.

[![GitHub license](https://img.shields.io/github/license/martin2844/slab?color=blue)](https://github.com/martin2844/slab/blob/master/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org/)
[![Docker Pulls](https://img.shields.io/docker/pulls/martin2844/slab.svg)](https://hub.docker.com/r/martin2844/slab)
[![Tests](https://img.shields.io/badge/tests-82%20passing-brightgreen)](https://github.com/martin2844/slab)
[![Coverage](https://img.shields.io/badge/coverage-89%25-brightgreen)](https://github.com/martin2844/slab)

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
- **MCP server** — 22 tools for AI agent integration (Claude Code, Cursor, any MCP client)
- **REST API** — full CRUD with filtering, pagination, and API key auth
- **SQLite** — zero-config, single-file database
- **Docker** — multi-stage Alpine image, docker-compose included

## Getting Started

### Docker (recommended)

The image can run the migration command, REST API, or MCP server. Compose runs
migrations once, then starts one container for each server; both share the same
persistent database volume.

| Port | Service | Purpose |
|------|---------|---------|
| `6969` | MCP server | AI agent integration (Claude Code, Cursor, etc.) |
| `6970` | REST API | Direct HTTP API access |

#### Option 1: Run the two services directly

```bash
# Pull the image
docker pull martin2844/slab:latest

# Run REST API (default entrypoint)
docker run -d \
  --name slab-api \
  -p 127.0.0.1:6970:6970 \
  -e TRACKER_API_KEY=replace-with-your-32-byte-random-secret \
  -v slab-data:/data \
  martin2844/slab:latest

# Run MCP server (override the default command)
docker run -d \
  --name slab-mcp \
  -p 127.0.0.1:6969:6969 \
  -e TRACKER_MCP_PORT=6969 \
  -e TRACKER_MCP_MODE=http \
  -e TRACKER_API_KEY=replace-with-your-32-byte-random-secret \
  -v slab-data:/data \
  martin2844/slab:latest \
  node dist/mcp/server.js
```

Both containers share the same `slab-data` volume so they use the same database.

#### Option 2: docker-compose (one command)

```bash
git clone https://github.com/martin2844/slab.git
cd slab
cp .env.example .env
sed -i "s|^TRACKER_API_KEY=.*|TRACKER_API_KEY=$(openssl rand -hex 32)|" .env
docker compose up -d --build
```

This starts:
- **REST API** on port `6970`
- **MCP server** on port `6969`

Both services share a persistent SQLite database via a Docker volume.

### From Source

```bash
git clone https://github.com/martin2844/slab.git
cd slab
npm install
export TRACKER_API_KEY="$(openssl rand -hex 32)"
npm run dev          # REST API on :6970
npm run mcp          # MCP server on :6969
```

### Verify

```bash
curl http://localhost:6970/health
# {"status":"ok"}
curl http://localhost:6970/ready
# {"status":"ready",...}
```

`/health` is process liveness. `/ready` also verifies SQLite access and that all
packaged schema migrations are applied. Production Compose uses `/ready`.

## MCP Integration

Slab exposes a full MCP server so AI agents can create, query, and manage issues directly — no REST calls needed.

Remote MCP requests require the same secret as the REST API. Send it either as
`Authorization: Bearer <TRACKER_API_KEY>` or `X-API-Key: <TRACKER_API_KEY>`.

### Transport

| Transport | Protocol | Endpoints |
|-----------|----------|-----------|
| **StreamableHTTP** | 2025-11-25 | `POST / GET / DELETE http://host:6969/mcp` |
| **SSE** (legacy) | 2024-11-05 | `GET /sse`, `POST /messages` |
| **Stdio** | — | Local process, for CLI tools |

### Claude Code

Add to `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "slab": {
      "type": "http",
      "url": "https://mcp.slab.example.com/mcp",
      "headers": { "X-API-Key": "replace-with-your-32-byte-random-secret" }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:
```json
{
  "mcpServers": {
    "slab": {
      "type": "http",
      "url": "https://mcp.slab.example.com/mcp",
      "headers": { "X-API-Key": "replace-with-your-32-byte-random-secret" }
    }
  }
}
```

### Codex CLI (OpenAI)

Set `SLAB_API_KEY` in the environment that starts Codex, then add this to
`~/.codex/config.toml` (or a trusted project's `.codex/config.toml`):
```toml
[mcp_servers.slab]
url = "https://mcp.slab.example.com/mcp"
bearer_token_env_var = "SLAB_API_KEY"
```

See the [official Codex MCP configuration](https://developers.openai.com/codex/mcp).

### Cline / Roo Code (VS Code)

In VS Code settings, search for "Cline MCP" and add:
```json
{
  "mcpServers": {
    "slab": {
      "type": "http",
      "url": "https://mcp.slab.example.com/mcp",
      "headers": { "X-API-Key": "replace-with-your-32-byte-random-secret" }
    }
  }
}
```

### Windsurf

Add to `.windsurf/mcp.json`:
```json
{
  "mcpServers": {
    "slab": {
      "type": "http",
      "url": "https://mcp.slab.example.com/mcp",
      "headers": { "X-API-Key": "replace-with-your-32-byte-random-secret" }
    }
  }
}
```

### Kimi Code CLI

Add to `~/.kimi/mcp.json`:
```json
{
  "mcpServers": {
    "slab": {
      "transport": "http",
      "url": "https://mcp.slab.example.com/mcp",
      "headers": { "X-API-Key": "replace-with-your-32-byte-random-secret" }
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
| `update_issue` | Update issue fields with optimistic concurrency (`expected_version`) |
| `assign_issue` | Assign or unassign an issue without changing other fields |
| `set_issue_status` | Change an issue status without changing other fields |
| `set_issue_priority` | Change an issue priority without changing other fields |
| `edit_issue_content` | Edit issue type, title, or description without changing workflow fields |
| `set_issue_labels` | Replace an issue label set without changing other fields |
| `delete_issue` | Delete an issue permanently with `expected_version` |
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
DELETE /api/issues/:key?expected_version=N  Delete issue
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
curl -X POST http://localhost:6970/api/projects \
  -H "X-API-Key: $TRACKER_API_KEY" -H "Content-Type: application/json" \
  -d '{"key":"MYAPP","name":"My App"}'

# Create a bug
curl -X POST http://localhost:6970/api/projects/MYAPP/issues \
  -H "X-API-Key: $TRACKER_API_KEY" -H "Content-Type: application/json" \
  -d '{"type":"bug","title":"Login broken","priority":"high","labels":["auth"]}'

# Start working on it
curl -X PATCH http://localhost:6970/api/issues/MYAPP-1 \
  -H "X-API-Key: $TRACKER_API_KEY" -H "Content-Type: application/json" \
  -d '{"expected_version":1,"status":"in_progress","assignee":"alice"}'

# List open issues
curl "http://localhost:6970/api/projects/MYAPP/issues?status=new,in_progress" \
  -H "X-API-Key: $TRACKER_API_KEY"

# Search
curl "http://localhost:6970/api/search?q=login" \
  -H "X-API-Key: $TRACKER_API_KEY"
```

Issue reads expose a monotonically increasing `version`. REST `PATCH`, REST
`DELETE`, and the MCP `update_issue`, `assign_issue`, `set_issue_status`,
`set_issue_priority`, `edit_issue_content`, `set_issue_labels`, and
`delete_issue` tools require `expected_version` from the latest read. A stale
mutation returns HTTP `409` or MCP error code `VERSION_CONFLICT`; callers must
fetch the issue again and reconsider before retrying. Comment creation is
append-only and does not require an issue version.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `6970` | REST API port |
| `TRACKER_API_KEY` | required | Authentication secret (minimum 24 characters) |
| `TRACKER_API_KEY_FILE` | — | Read the authentication secret from a mounted file; mutually exclusive with `TRACKER_API_KEY` |
| `TRACKER_MCP_PORT` | `6969` | MCP server port (HTTP mode) |
| `TRACKER_MCP_MODE` | `http` | `http` for remote, `stdio` for local CLI |
| `TRACKER_DB_PATH` | `./slab.db` | SQLite database file path |
| `SKIP_MIGRATIONS` | `false` | Set to `true` on API/MCP only after the one-shot migration command succeeds |
| `BIND_ADDRESS` | `127.0.0.1` | Host address used by Docker Compose port publishing |

Run deterministic production migrations with:

```bash
docker run --rm -v slab-data:/data ghcr.io/martin2844/slab:<version> \
  node dist/db/migrate.js
```

The unified self-hosted stack mounts `TRACKER_API_KEY_FILE` from a Compose
secret. The direct environment variable remains available for local development.

## VPS Deployment

The Compose defaults publish both services on loopback only. Put a TLS reverse
proxy in front of them; never send the API key over unencrypted public HTTP.

1. Point two DNS records (for example `api.slab.example.com` and
   `mcp.slab.example.com`) at the VPS.
2. Install Docker Engine, the Compose plugin, and Caddy on the VPS.
3. Clone the repository and create the production environment:

   ```bash
   cp .env.example .env
   sed -i "s|^TRACKER_API_KEY=.*|TRACKER_API_KEY=$(openssl rand -hex 32)|" .env
   chmod 600 .env
   docker compose up -d --build
   docker compose ps
   ```

4. Copy `deploy/Caddyfile.example` to `/etc/caddy/Caddyfile`, replace the two
   example hostnames, then reload Caddy:

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

5. Allow only SSH, HTTP, and HTTPS through the VPS firewall. Ports `6969` and
   `6970` remain private on `127.0.0.1`.

Verify both local services and the public TLS endpoints:

```bash
curl --fail http://127.0.0.1:6970/ready
curl --fail http://127.0.0.1:6969/ready
curl --fail https://api.slab.example.com/health
curl --fail https://mcp.slab.example.com/health
```

### Backups

Create a consistent online SQLite backup, then copy it off the container volume:

```bash
mkdir -p backups
backup_name="slab-$(date -u +%Y%m%dT%H%M%SZ).db"
docker compose exec -T --user node slab-api node dist/db/backup.js "/data/$backup_name"
docker compose cp "slab-api:/data/$backup_name" "backups/$backup_name"
```

Store backups away from the VPS and periodically test a restore. Before replacing
the live database during a restore, stop both services with `docker compose stop`.

### Updating

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

## Coolify Deployment

Use the Git repository with Coolify's **Docker Compose** build pack and select
`/docker-compose.coolify.yml` as the Docker Compose location. This variant does
not publish host ports or run Caddy; Coolify's proxy handles both public domains.

1. In a Coolify project, choose **New Resource**, then select the public GitHub
   repository (or GitHub App/Deploy Key for a private fork).
2. Select the `master` branch, base directory `/`, build pack **Docker Compose**,
   and Compose location `/docker-compose.coolify.yml`.
3. In Environment Variables, set `TRACKER_API_KEY` to a random secret of at
   least 24 characters. Generate one locally with `openssl rand -hex 32`. Keep
   it runtime-only; it is not needed during the image build.
4. Assign separate domains to the two services:
   - `slab-api`: `https://api.slab.example.com:6970`
   - `slab-mcp`: `https://mcp.slab.example.com:6969`
5. Deploy and wait until both services are healthy. Keep the generated
   `slab-data` volume attached because it contains the SQLite database.

The port suffixes tell Coolify which internal container port to proxy; clients
still connect over normal HTTPS without a port suffix. Configure MCP clients
with `https://mcp.slab.example.com/mcp` and the same API key.

## Development

```bash
npm install             # Install dependencies
npm run dev             # REST server with hot reload
npm run mcp             # MCP server (HTTP mode)
npm run build           # Compile TypeScript
npm test                # Run test suite (82 tests)
npm run test:coverage   # Run tests with coverage report
npm run test:watch      # Run tests in watch mode
```

### Test Coverage

```
File            | Stmts  | Branch | Funcs  | Lines
----------------|--------|--------|--------|------
All files       | 89.3%  | 86.7%  | 88.6%  | 90.4%
  services/     | 91.7%  | 88.1%  | 87.9%  | 92.3%
  db/           | 70.7%  | 61.1%  | 85.7%  | 75.7%
```

## Architecture

```
src/
├── index.ts                REST API entry point
├── config.ts               Runtime validation and API-key helpers
├── types.ts                Shared TypeScript types
├── db/
│   ├── backup.ts           Online SQLite backup command
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
