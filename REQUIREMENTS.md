# Slab — Backend Issue Tracking (REST + MCP)

## Overview

A barebones, no-UI issue tracker exposed via REST API and MCP (Model Context Protocol). Designed for remote server-based work tracking, optimized for programmatic access by AI agents and CLI tools.

**No frontend. No web UI. Just API.**

---

## Core Entities

### Project
A container for issues. Every issue belongs to exactly one project.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Auto-generated |
| key | string | Short unique key (e.g., `TRACK`) |
| name | string | Human-readable name |
| description | text | Optional |
| created_at | timestamp | Auto |
| updated_at | timestamp | Auto |

### Issue
The central entity. Represents a unit of work.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Auto-generated |
| project_id | UUID | FK to Project |
| key | string | Auto-generated (`PROJECT-42`) |
| type | enum | `epic`, `story`, `task`, `bug` |
| title | string | Required, max 500 chars |
| description | text | Markdown body, optional |
| status | enum | `new`, `in_progress`, `done` |
| priority | enum | `critical`, `high`, `medium`, `low` |
| assignee | string | Optional, free-text identifier (email, username, agent ID) |
| labels | string[] | Optional, free-form tags |
| created_at | timestamp | Auto |
| updated_at | timestamp | Auto |
| resolved_at | timestamp | Set when status → `done` |

### Comment
Attached to an issue. Threaded chronologically.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Auto-generated |
| issue_id | UUID | FK to Issue |
| author | string | Who/what wrote it |
| body | text | Markdown |
| created_at | timestamp | Auto |

### Issue Link
Directional relationship between two issues.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Auto-generated |
| source_id | UUID | FK to Issue (from) |
| target_id | UUID | FK to Issue (to) |
| type | enum | `blocks`, `relates`, `depends_on`, `parent_of` |
| created_at | timestamp | Auto |

Constraint: No duplicate links (same source + target + type). `blocks` is bidirectional in meaning (A blocks B = B is blocked by A), stored as one row.

### History Entry
Immutable audit trail for issue changes.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Auto-generated |
| issue_id | UUID | FK to Issue |
| field | string | Which field changed |
| old_value | text | Previous value (nullable — was empty) |
| new_value | text | New value (nullable — cleared) |
| author | string | Who made the change |
| created_at | timestamp | Auto |

Every mutation to an issue (title, status, priority, assignee, type, description) writes a history entry.

---

## Status Workflow

Three states, no restrictions on transitions:

```
new → in_progress → done
  ↘       ↘           ↓
   any → any → any     (any transition is valid)
```

No custom workflows, no required fields per transition. Keep it simple.

---

## REST API

### Auth
All endpoints require `X-API-Key` header. Single key configured via environment variable. No user management.

### Endpoints

#### Projects
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects` | Create project |
| GET | `/projects` | List projects |
| GET | `/projects/{key}` | Get project |
| PATCH | `/projects/{key}` | Update project |
| DELETE | `/projects/{key}` | Delete project (and all issues) |

#### Issues
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/{projectKey}/issues` | Create issue |
| GET | `/projects/{projectKey}/issues` | List issues (with filters) |
| GET | `/issues/{key}` | Get issue (e.g., `TRACK-1`) |
| PATCH | `/issues/{key}` | Update issue |
| DELETE | `/issues/{key}` | Delete issue |

Query params for GET issues list:
- `status` — filter by status (repeatable)
- `type` — filter by type (repeatable)
- `priority` — filter by priority (repeatable)
- `assignee` — filter by assignee
- `label` — filter by label (repeatable)
- `search` — full-text search on title and description

#### Comments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/issues/{key}/comments` | Add comment |
| GET | `/issues/{key}/comments` | List comments |
| DELETE | `/issues/{key}/comments/{id}` | Delete comment |

#### Links
| Method | Path | Description |
|--------|------|-------------|
| POST | `/issues/{key}/links` | Create link |
| GET | `/issues/{key}/links` | List links for issue |
| DELETE | `/issues/{key}/links/{id}` | Remove link |

#### History
| Method | Path | Description |
|--------|------|-------------|
| GET | `/issues/{key}/history` | Get change history |

### Response Format
All responses are JSON. Standard envelope:

```json
{
  "data": { ... },
  "error": null
}
```

List responses include pagination:

```json
{
  "data": [ ... ],
  "total": 42,
  "offset": 0,
  "limit": 50
}
```

---

## MCP Tools

MCP tools mirror the REST API for agent consumption. Each tool corresponds to a logical operation:

### Project Tools
- `create_project` — create a new project
- `list_projects` — list all projects
- `get_project` — get project details
- `update_project` — update project fields

### Issue Tools
- `create_issue` — create an issue in a project
- `list_issues` — list/search issues with filters
- `get_issue` — get full issue details
- `update_issue` — update issue fields (status, assignee, etc.)
- `delete_issue` — delete an issue

### Comment Tools
- `add_comment` — add a comment to an issue
- `list_comments` — list comments on an issue

### Link Tools
- `link_issues` — create a link between two issues
- `list_links` — list links for an issue
- `unlink_issues` — remove a link

### History Tools
- `get_issue_history` — get change log for an issue

### Query Tools
- `search_issues` — cross-project search with text query + filters
- `get_blocked_issues` — list issues currently blocked by other issues

---

## Storage

SQLite. Single file database. Zero config. Good enough for single-server usage.

Migrations via simple numbered SQL files. No ORM required.

---

## Tech Stack

- **Language**: TypeScript
- **Framework**: Hono (lightweight, fully typed, Express-like API)
- **Runtime**: Node.js
- **Database**: SQLite via `better-sqlite3`
- **Validation**: Zod
- **MCP**: `@modelcontextprotocol/sdk`
- **Transport**: REST over HTTP, MCP over stdio or SSE

### Project Structure

```
src/
  index.ts           # Entry point, starts REST server
  db/
    connection.ts    # SQLite connection singleton
    migrations/      # Numbered SQL migration files
    migrate.ts       # Migration runner
  schema/
    project.ts       # Zod schemas for Project
    issue.ts         # Zod schemas for Issue
    comment.ts       # Zod schemas for Comment
    link.ts          # Zod schemas for IssueLink
    history.ts       # Zod schemas for History
  services/
    project.ts       # Project CRUD operations
    issue.ts         # Issue CRUD + search
    comment.ts       # Comment operations
    link.ts          # Link operations
    history.ts       # History recording
  routes/
    project.ts       # /projects endpoints
    issue.ts         # /issues endpoints
    comment.ts       # /comments endpoints
    link.ts          # /links endpoints
    history.ts       # /history endpoints
  middleware/
    auth.ts          # X-API-Key validation
    error.ts         # Global error handler
  mcp/
    server.ts        # MCP server setup
    tools.ts         # MCP tool definitions and handlers
  types.ts           # Shared TypeScript types
```

---

## Out of Scope (intentionally)

These are NOT part of the system:

- User accounts / RBAC / multi-tenant auth
- Custom fields
- Custom workflows
- Time tracking
- Attachments / file uploads
- Notifications / email / webhooks
- Dashboards / reports / charts
- Sprints / boards / kanban
- Subtasks (use `parent_of` links instead)
- Versions / releases / fix versions
- Components
- Watchers / voting
