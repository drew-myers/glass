# RFC-002: Architecture Redesign - Server + Native TUI

## Summary

Redesign Glass as a TypeScript server with REST API, paired with a Rust/Ratatui TUI client. Agent interaction uses Pi SDK headlessly for the happy path, with escape hatch to interactive `pi` CLI for edge cases.

## Motivation

The original design using OpenTUI (Solid-based) for the TUI has proven overly complex for what is fundamentally a simple list/detail interface. Meanwhile, the JS/TS ecosystem lacks mature native terminal UI options that aren't React-for-terminal ports.

Key insights:
1. **Agent interaction should be headless by default** - The goal is rubber-stamp approval, not constant back-and-forth
2. **Interactive agent sessions are the exception** - When needed, shell out to `pi` directly for full UX
3. **Native TUI libraries (Ratatui, Bubbletea) are superior** - Purpose-built for terminals, not web paradigm ports
4. **Pi SDK in-process is valuable** - Keeps TS server for seamless headless agent execution

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Glass Server (TypeScript)                    │
│  ───────────────────────────────────────────────────────────────│
│                                                                 │
│  - REST API for issue management                                │
│  - Sentry API client                                            │
│  - SQLite state persistence                                     │
│  - Pi SDK (headless execution)                                  │
│  - Git worktree management                                      │
│                                                                 │
│  Effect-based: Layers, Services, typed errors                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (localhost:7420)
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                    Glass TUI (Rust + Ratatui)                   │
│  ───────────────────────────────────────────────────────────────│
│                                                                 │
│  - List view: issues with status                                │
│  - Detail view: issue info + proposal                           │
│  - Trigger actions via REST                                     │
│  - Escape hatch: exec("pi", ["--session", path])                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## REST API Contract

### Base URL

```
http://localhost:7420/api/v1
```

### Authentication

None for MVP (localhost only). Future: optional bearer token.

---

### Endpoints

#### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

#### List Issues

```
GET /issues
```

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | (all) | Filter by status: `pending`, `analyzing`, `pending_approval`, `in_progress`, `pending_review`, `error` |
| `source` | string | (all) | Filter by source: `sentry`, `github`, `ticket` |
| `limit` | integer | 50 | Max results |
| `offset` | integer | 0 | Pagination offset |

**Response:**
```json
{
  "issues": [
    {
      "id": "sentry:12345",
      "sourceType": "sentry",
      "title": "TypeError: Cannot read property 'id' of undefined",
      "shortId": "PROJ-123",
      "status": "pending",
      "eventCount": 127,
      "userCount": 43,
      "firstSeen": "2026-01-28T10:00:00Z",
      "lastSeen": "2026-02-01T14:30:00Z",
      "updatedAt": "2026-02-01T14:30:00Z"
    }
  ],
  "total": 156,
  "limit": 50,
  "offset": 0
}
```

---

#### Get Issue Detail

```
GET /issues/:id
```

**Response:**
```json
{
  "id": "sentry:12345",
  "sourceType": "sentry",
  "status": "pending_approval",
  
  "source": {
    "title": "TypeError: Cannot read property 'id' of undefined",
    "shortId": "PROJ-123",
    "culprit": "src/handlers/user.ts in getUser",
    "eventCount": 127,
    "userCount": 43,
    "firstSeen": "2026-01-28T10:00:00Z",
    "lastSeen": "2026-02-01T14:30:00Z",
    "metadata": {
      "type": "TypeError",
      "value": "Cannot read property 'id' of undefined",
      "filename": "src/handlers/user.ts",
      "function": "getUser"
    },
    "stacktrace": {
      "frames": [
        {
          "filename": "src/handlers/user.ts",
          "function": "getUser",
          "lineno": 42,
          "colno": 15,
          "context": [
            { "line": 40, "code": "async function getUser(req: Request) {" },
            { "line": 41, "code": "  const session = await getSession(req);" },
            { "line": 42, "code": "  return session.user.id;", "current": true },
            { "line": 43, "code": "}" }
          ]
        }
      ]
    },
    "breadcrumbs": [
      {
        "type": "navigation",
        "category": "route",
        "message": "/api/users/me",
        "timestamp": "2026-02-01T14:29:58Z"
      }
    ],
    "tags": {
      "environment": "production",
      "release": "v2.3.1",
      "browser": "Chrome 120"
    }
  },
  
  "state": {
    "status": "pending_approval",
    "analysisSessionId": "2026-02-01T14-30-00-000Z_abc123.jsonl",
    "proposal": "## Analysis\n\nThe error occurs because...\n\n## Proposed Fix\n\n```diff\n- return session.user.id;\n+ return session?.user?.id;\n```"
  },
  
  "createdAt": "2026-02-01T12:00:00Z",
  "updatedAt": "2026-02-01T14:35:00Z"
}
```

**State variants by status:**

```typescript
// status: "pending"
{ "status": "pending" }

// status: "analyzing"
{ "status": "analyzing", "analysisSessionId": "..." }

// status: "pending_approval"
{ "status": "pending_approval", "analysisSessionId": "...", "proposal": "..." }

// status: "in_progress"
{ 
  "status": "in_progress",
  "analysisSessionId": "...",
  "implementationSessionId": "...",
  "worktreePath": "/path/to/worktree",
  "worktreeBranch": "fix/sentry-12345"
}

// status: "pending_review"
{ 
  "status": "pending_review",
  "analysisSessionId": "...",
  "implementationSessionId": "...",
  "worktreePath": "/path/to/worktree",
  "worktreeBranch": "fix/sentry-12345"
}

// status: "error"
{
  "status": "error",
  "previousStatus": "analyzing",
  "sessionId": "...",
  "error": "Model API rate limited"
}
```

---

#### Refresh Issues

```
POST /issues/refresh
```

Triggers a fresh fetch from all configured sources (Sentry, etc.), upserts into local DB, and returns the updated issue list (same format as `GET /issues`).

**Response:**
```json
{
  "issues": [
    {
      "id": "sentry:12345",
      "sourceType": "sentry",
      "title": "TypeError: Cannot read property 'id' of undefined",
      "shortId": "PROJ-123",
      "status": "pending",
      "eventCount": 127,
      "userCount": 43,
      "firstSeen": "2026-01-28T10:00:00Z",
      "lastSeen": "2026-02-01T14:30:00Z",
      "updatedAt": "2026-02-01T14:30:00Z"
    }
  ],
  "total": 156,
  "limit": 50,
  "offset": 0
}
```

---

#### Start Analysis

```
POST /issues/:id/analyze
```

Starts headless Pi analysis session. Returns immediately; analysis runs in background.

**Request Body:** (optional)
```json
{
  "additionalContext": "User reports this only happens on mobile Safari"
}
```

**Response:**
```json
{
  "status": "analyzing",
  "sessionId": "2026-02-01T14-30-00-000Z_abc123.jsonl",
  "sessionPath": "/Users/me/.pi/agent/sessions/--project--/2026-02-01T14-30-00-000Z_abc123.jsonl"
}
```

**Errors:**
- `409 Conflict` - Issue not in valid state for analysis (not `pending` or `error`)

---

#### Approve Proposal

```
POST /issues/:id/approve
```

Approves the analysis proposal and starts implementation in a worktree.

**Response:**
```json
{
  "status": "in_progress",
  "worktreePath": "/Users/me/projects/glass-worktrees/fix-sentry-12345",
  "worktreeBranch": "fix/sentry-12345",
  "implementationSessionId": "2026-02-01T15-00-00-000Z_def456.jsonl",
  "implementationSessionPath": "/Users/me/.pi/agent/sessions/--worktree--/..."
}
```

**Errors:**
- `409 Conflict` - Issue not in `pending_approval` state

---

#### Reject Proposal

```
POST /issues/:id/reject
```

Rejects the proposal, returns issue to `pending` state.

**Response:**
```json
{
  "status": "pending"
}
```

**Errors:**
- `409 Conflict` - Issue not in `pending_approval` state

---

#### Request Changes

```
POST /issues/:id/revise
```

Sends feedback to the analysis session and continues analysis.

**Request Body:**
```json
{
  "feedback": "The fix looks good but please also add a null check for session itself"
}
```

**Response:**
```json
{
  "status": "analyzing",
  "sessionId": "2026-02-01T14-30-00-000Z_abc123.jsonl"
}
```

**Errors:**
- `409 Conflict` - Issue not in `pending_approval` state

---

#### Complete Review

```
POST /issues/:id/complete
```

Marks implementation as reviewed/complete. Cleans up worktree.

**Response:**
```json
{
  "status": "pending",
  "cleanedUp": {
    "worktreePath": "/Users/me/projects/glass-worktrees/fix-sentry-12345",
    "branch": "fix/sentry-12345"
  }
}
```

**Errors:**
- `409 Conflict` - Issue not in `pending_review` state

---

#### Retry After Error

```
POST /issues/:id/retry
```

Retries analysis or implementation after an error.

**Response:**
```json
{
  "status": "analyzing",
  "sessionId": "2026-02-01T16-00-00-000Z_ghi789.jsonl"
}
```

**Errors:**
- `409 Conflict` - Issue not in `error` state

---

#### Get Session Info

```
GET /issues/:id/session
```

Returns session path(s) for escape hatch to interactive mode.

**Response:**
```json
{
  "analysisSession": {
    "id": "2026-02-01T14-30-00-000Z_abc123.jsonl",
    "path": "/Users/me/.pi/agent/sessions/--project--/2026-02-01T14-30-00-000Z_abc123.jsonl"
  },
  "implementationSession": {
    "id": "2026-02-01T15-00-00-000Z_def456.jsonl",
    "path": "/Users/me/.pi/agent/sessions/--worktree--/2026-02-01T15-00-00-000Z_def456.jsonl"
  }
}
```

Fields are `null` if session doesn't exist for current state.

---

### Server-Sent Events (Optional Future)

For real-time status updates without polling:

```
GET /events
```

**Event Types:**
```
event: issue_updated
data: {"id": "sentry:12345", "status": "pending_approval"}

event: analysis_progress
data: {"id": "sentry:12345", "message": "Reading src/handlers/user.ts..."}
```

For MVP, TUI can poll `GET /issues/:id` during active operations.

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Issue must be in 'pending' state to start analysis",
    "details": {
      "currentState": "analyzing",
      "allowedStates": ["pending", "error"]
    }
  }
}
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Issue not found |
| `INVALID_STATE` | 409 | Action not allowed in current state |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `SENTRY_ERROR` | 502 | Sentry API error |
| `AGENT_ERROR` | 500 | Pi agent execution error |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## TUI Interactions

### Happy Path Flow

```
┌─────────────────────────────────────────────────────────┐
│ TUI: List View                                          │
│                                                         │
│   ○ PENDING   TypeError: Cannot read 'id'     127  2h  │
│ ▶ ○ PENDING   ReferenceError: user undefined   43  3h  │
│   ○ PENDING   NetworkError: fetch failed      234 30m  │
│                                                         │
│ [a]nalyze  [r]efresh  [q]uit                           │
└─────────────────────────────────────────────────────────┘
        │
        │ User presses 'a'
        ▼
   POST /issues/sentry:67890/analyze
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│ TUI: List View (updated via poll)                       │
│                                                         │
│   ○ PENDING   TypeError: Cannot read 'id'     127  2h  │
│ ▶ ◐ ANALYZ    ReferenceError: user undefined   43  3h  │
│   ○ PENDING   NetworkError: fetch failed      234 30m  │
│                                                         │
│ [Enter] view  [r]efresh  [q]uit                        │
└─────────────────────────────────────────────────────────┘
        │
        │ Analysis completes, poll shows pending_approval
        │ User presses Enter
        ▼
┌─────────────────────────────────────────────────────────┐
│ TUI: Detail View                                        │
│                                                         │
│ ReferenceError: user is not defined         ◉ APPROVAL │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ ## Analysis                                             │
│                                                         │
│ The error occurs in `auth.ts:23` where `user` is       │
│ referenced before the session is validated.             │
│                                                         │
│ ## Proposed Fix                                         │
│                                                         │
│ ```diff                                                 │
│ - const name = user.name;                              │
│ + const name = user?.name ?? 'Anonymous';              │
│ ```                                                     │
│                                                         │
│ [a]pprove  [x] reject  [c]hanges  [i]nteractive  [q]   │
└─────────────────────────────────────────────────────────┘
        │
        │ User presses 'a'
        ▼
   POST /issues/sentry:67890/approve
        │
        ▼
   (Implementation runs headlessly)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│ TUI: Detail View                                        │
│                                                         │
│ ReferenceError: user is not defined          ● REVIEW  │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ Implementation complete.                                │
│                                                         │
│ Worktree: ~/glass-worktrees/fix-sentry-67890           │
│ Branch: fix/sentry-67890                               │
│                                                         │
│ [d]one (cleanup)  [i]nteractive  [q]uit                │
└─────────────────────────────────────────────────────────┘
```

### Escape Hatch Flow

At any point with an active session, user presses `i`:

```
┌─────────────────────────────────────────────────────────┐
│ TUI: Detail View                                        │
│ ...                                                     │
│ [a]pprove  [x] reject  [c]hanges  [i]nteractive  [q]   │
└─────────────────────────────────────────────────────────┘
        │
        │ User presses 'i'
        ▼
   GET /issues/sentry:67890/session
   → { analysisSession: { path: "..." } }
        │
        │ TUI suspends, execs:
        │ pi --session /path/to/session.jsonl
        ▼
┌─────────────────────────────────────────────────────────┐
│ Pi Interactive (full terminal)                          │
│                                                         │
│ ┌─ pi ─────────────────────────────────────────────────│
│ │                                                       │
│ │ (previous conversation visible)                       │
│ │                                                       │
│ │ User: Actually, can you also add logging?            │
│ │                                                       │
│ │ Assistant: Sure, I'll add logging...                 │
│ │                                                       │
│ └───────────────────────────────────────────────────────│
└─────────────────────────────────────────────────────────┘
        │
        │ User exits pi (Ctrl+C or /exit)
        ▼
   TUI resumes, re-fetches issue state
   GET /issues/sentry:67890
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│ TUI: Detail View (refreshed)                            │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Server Foundation
1. Set up HTTP server (Effect Platform)
2. Implement health endpoint
3. Wire up existing services (Sentry, DB) to REST handlers
4. `GET /issues`, `GET /issues/:id`

### Phase 2: Analysis Flow
1. `POST /issues/:id/analyze` - headless Pi integration
2. `POST /issues/:id/approve`, `reject`, `revise`
3. `GET /issues/:id/session` for escape hatch

### Phase 3: Implementation Flow
1. Worktree creation on approve
2. Implementation session in worktree
3. `POST /issues/:id/complete`

### Phase 4: Rust TUI
1. Basic ratatui scaffold
2. List view with API integration
3. Detail view
4. Action keybinds
5. Escape hatch (`exec("pi")`)

### Phase 5: Polish
1. Error handling UI
2. Loading states
3. SSE for real-time updates (optional)

---

## Design Decisions

1. **Port selection**: Fixed port (7420) for MVP. Add lockfile/dynamic port if conflicts arise later.

2. **Server lifecycle**: TUI spawns server as child process. Server dies when TUI exits. No daemon mode - startup is instant (Bun + SQLite), so no benefit to keeping server alive. Clean process model, no orphans.

3. **Multiple projects**: One server per project. Config is project-specific anyway.

---

## References

- [RFC-001: Pi SDK Migration](RFC-001-pi-sdk-migration.md)
- [Pi SDK Documentation](https://raw.githubusercontent.com/badlogic/pi-mono/refs/heads/main/packages/coding-agent/docs/sdk.md)
- [Ratatui](https://ratatui.rs/)
