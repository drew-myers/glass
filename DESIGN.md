# Glass - Issue Orchestration System

> ⚠️ **OUTDATED**: This document describes the original OpenTUI-based architecture which has been replaced.
>
> **For current architecture, see [RFC-002](docs/RFC-002-architecture-redesign.md)** - Server + Rust TUI design with REST API.
>
> The sections below on **Domain Model**, **Issue State Machine**, **Configuration**, and **Persistence** are still accurate. UI and service architecture sections are outdated.

## Overview

Glass is a terminal user interface (TUI) application that helps software engineers automatically fix issues by orchestrating coding agents. It presents a list of issues from various sources (Sentry, GitHub, local tickets), allows drill-down analysis, and coordinates an approval-based workflow where agents propose fixes that humans review before implementation.

### North Star UX References

- **OpenCode TUI**: Clean, minimal interface with markdown rendering and familiar prompt-style input
- **Lazygit**: Panel-based layout, vim-style navigation, context-sensitive keybinds, color-coded status

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Runtime | TypeScript + Bun | Fast startup, native TypeScript, good I/O performance |
| TUI Framework | OpenTUI (`@opentui/core`) | Flexbox layouts, rich components, native TS |
| FP Framework | Effect | Type-safe error handling, dependency injection, streams, resource management |
| Database | SQLite via `@effect/sql-sqlite-bun` | Simple persistence, Effect integration |
| Config | TOML (`@iarna/toml`) | Human-readable, standard format |
| Agent Interface | OpenCode SDK (`@opencode-ai/sdk`) | Type-safe client for OpenCode server |
| HTTP Client | Effect `HttpClient` | For Sentry API calls |

---

## Architecture

### High-Level Data Flow

```
┌─────────────┐
│   Sentry    │──────┐
│    API      │      │
└─────────────┘      │     ┌─────────────┐     ┌──────────────┐
                     ├────▶│    Glass    │────▶│   OpenCode   │
┌─────────────┐      │     │    (TUI)    │     │   (Agent)    │
│   GitHub    │──────┤     └──────┬──────┘     └──────────────┘
│   Issues    │      │            │
└─────────────┘      │     ┌──────▼──────┐
                     │     │   SQLite    │
┌─────────────┐      │     │  (State DB) │
│   Local     │──────┘     └─────────────┘
│   Tickets   │
└─────────────┘
```

Glass supports multiple issue sources through a pluggable provider architecture. Each source implements fetching, storage serialization, and UI display logic.

### OpenCode Server Management

Glass manages multiple OpenCode server instances:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GLASS APPLICATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    MAIN PROJECT OPENCODE SERVER                      │   │
│   │                      (shared, analysis only)                         │   │
│   │                          port: dynamic                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐   │
│   │ WORKTREE SERVER #1   │  │ WORKTREE SERVER #2   │  │      ...        │   │
│   │ (fix mode, isolated) │  │ (fix mode, isolated) │  │                 │   │
│   │ port: dynamic        │  │ port: dynamic        │  │                 │   │
│   └──────────────────────┘  └──────────────────────┘  └─────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Analysis phase**: Uses the shared main project OpenCode server (read-only operations)
- **Implementation phase**: Each worktree gets its own OpenCode server instance (can write files)

---

## Issue State Machine

### States

```typescript
type IssueState = 
  | { _tag: "Pending" }
  | { _tag: "Analyzing"; sessionId: string }
  | { _tag: "PendingApproval"; sessionId: string; proposal: string }
  | { _tag: "InProgress"; analysisSessionId: string; implementationSessionId: string; worktreePath: string; worktreeBranch: string }
  | { _tag: "PendingReview"; analysisSessionId: string; implementationSessionId: string; worktreePath: string; worktreeBranch: string }
  | { _tag: "Error"; previousState: "analyzing" | "in_progress"; sessionId: string; error: string }
```

### State Transitions

```
PENDING ──[start analysis]──▶ ANALYZING
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             │
                 ERROR     PENDING_APPROVAL (agent asks questions,
                    │             │          user responds, continues)
      [retry]───────┘             │
                    ┌─────────────┼─────────────┐
                    │             │             │
                [reject]    [request       [approve]
                    │        changes]          │
                    ▼             │             ▼
                PENDING ◀────────┘         IN_PROGRESS
                                               │
                                 ┌─────────────┼─────────────┐
                                 │             │             │
                                 ▼             ▼             │
                              ERROR     PENDING_REVIEW  (agent asks questions,
                                 │             │        user responds, continues)
                   [retry]───────┘             │
                                               │
                                    [cleanup worktree]
                                               │
                                               ▼
                                           PENDING
```

### Valid Transitions

| From State | Action | To State |
|------------|--------|----------|
| Pending | StartAnalysis | Analyzing |
| Analyzing | CompleteAnalysis | PendingApproval |
| Analyzing | Fail | Error |
| PendingApproval | Approve | InProgress |
| PendingApproval | Reject | Pending |
| PendingApproval | RequestChanges | Analyzing (same session) |
| InProgress | Complete | PendingReview |
| InProgress | Fail | Error |
| PendingReview | Cleanup | Pending |
| Error | Retry | Analyzing (new session) |
| Error | Reject | Pending |

---

## Domain Model

### Issue Source Abstraction

Glass supports multiple issue sources through a tagged union. Each source provides common fields for list display plus source-specific data for detail views and analysis prompts.

```typescript
// Common fields all issue sources must provide
export interface IssueSourceCommon {
  readonly title: string           // Human-readable title/summary
  readonly shortId: string         // Display ID (e.g., "PROJ-123", "gh#456")
  readonly firstSeen: Date         // When first seen/created
  readonly lastSeen: Date          // When last seen/updated
  readonly count?: number          // Event/occurrence count (if applicable)
  readonly userCount?: number      // Affected user count (if applicable)
}

// Sentry-specific issue data
export interface SentrySourceData extends IssueSourceCommon {
  readonly culprit: string
  readonly metadata: {
    readonly type?: string
    readonly value?: string
    readonly filename?: string
    readonly function?: string
  }
  readonly stacktrace?: Stacktrace
  readonly breadcrumbs?: Breadcrumb[]
  readonly environment?: string
  readonly release?: string
  readonly tags?: Record<string, string>
}

// GitHub issue data (future)
export interface GitHubSourceData extends IssueSourceCommon {
  readonly owner: string
  readonly repo: string
  readonly number: number
  readonly labels: string[]
  readonly assignees: string[]
  readonly body: string
  readonly url: string
}

// Local ticket data (future)
export interface TicketSourceData extends IssueSourceCommon {
  readonly ticketId: string
  readonly description: string
  readonly acceptance?: string
  readonly design?: string
  readonly tags: string[]
  readonly priority: number
}

// Tagged union of all issue sources
export type IssueSource = Data.TaggedEnum<{
  Sentry: { project: string; data: SentrySourceData }
  GitHub: { data: GitHubSourceData }
  Ticket: { data: TicketSourceData }
}>

// Helper to extract common fields from any source
export const getSourceCommon = (source: IssueSource): IssueSourceCommon =>
  Match.value(source).pipe(
    Match.tag("Sentry", ({ data }) => data),
    Match.tag("GitHub", ({ data }) => data),
    Match.tag("Ticket", ({ data }) => data),
    Match.exhaustive,
  )
```

### Issue ID Format

Issue IDs use a composite format: `{source_type}:{source_id}`

Examples:
- `sentry:12345` - Sentry issue
- `github:owner/repo#123` - GitHub issue
- `ticket:gla-htpw` - Local ticket

### Core Types (Effect Tagged Unions)

```typescript
// Issue States - using Effect's Data.TaggedEnum for type-safe pattern matching
export type IssueState = Data.TaggedEnum<{
  Pending: {}
  Analyzing: { sessionId: string }
  PendingApproval: { sessionId: string; proposal: string }
  InProgress: { 
    analysisSessionId: string
    implementationSessionId: string
    worktreePath: string
    worktreeBranch: string
  }
  PendingReview: {
    analysisSessionId: string
    implementationSessionId: string
    worktreePath: string
    worktreeBranch: string
  }
  Error: { 
    previousState: "analyzing" | "in_progress"
    sessionId: string
    error: string 
  }
}>

// Issue Actions
export type IssueAction = Data.TaggedEnum<{
  StartAnalysis: { sessionId: string }
  CompleteAnalysis: { proposal: string }
  Approve: { worktreePath: string; worktreeBranch: string; implementationSessionId: string }
  Reject: {}
  RequestChanges: { feedback: string }
  Complete: {}
  Fail: { error: string }
  Retry: { newSessionId: string }
  Cleanup: {}
}>

// Issue Entity (source-agnostic)
export interface Issue {
  readonly id: string              // Composite: "{source_type}:{source_id}"
  readonly source: IssueSource     // Source-specific data
  readonly state: IssueState
  readonly createdAt: Date
  readonly updatedAt: Date
}

// Issue Events (published on state changes)
export type IssueEvent = Data.TaggedEnum<{
  StateChanged: { issueId: string; oldState: IssueState; newState: IssueState }
  AgentMessage: { issueId: string; sessionId: string; content: string }
  AgentWaitingForInput: { issueId: string }
  AgentComplete: { issueId: string; sessionId: string }
  AgentError: { issueId: string; sessionId: string; error: string }
}>
```

### Conversation Persistence

```typescript
export interface ConversationMessage {
  readonly id: number
  readonly issueId: string
  readonly sessionId: string
  readonly phase: "analysis" | "implementation"
  readonly role: "user" | "assistant"
  readonly content: string
  readonly createdAt: Date
}

export interface Proposal {
  readonly issueId: string
  readonly content: string
  readonly createdAt: Date
}
```

---

## Service Architecture

### Service Interfaces

```typescript
// Sentry API Client
interface SentryService {
  listTeamIssues: (options: ListOptions) => Effect<Issue[], SentryError>
  getIssue: (id: string) => Effect<IssueDetail, SentryError>
  getLatestEvent: (issueId: string) => Effect<Event, SentryError>
}

// OpenCode SDK Wrapper
interface OpenCodeService {
  startServer: (projectPath: string) => Effect<ServerInstance, OpenCodeError, Scope>
  createSession: (serverUrl: string) => Effect<Session, OpenCodeError>
  prompt: (sessionId: string, message: string) => Effect<void, OpenCodeError>
  subscribeEvents: () => Effect<Stream<SessionEvent, OpenCodeError>, OpenCodeError, Scope>
}

// Git Worktree Management
interface WorktreeService {
  create: (branchName: string) => Effect<string, WorktreeError> // returns path
  remove: (path: string) => Effect<void, WorktreeError>
  exists: (path: string) => Effect<boolean>
  list: () => Effect<string[], WorktreeError>
}

// Issue Repository (Database)
interface IssueRepository {
  getById: (id: string) => Effect<Issue | null, DbError>
  listByStatuses: (statuses: IssueStatus[]) => Effect<Issue[], DbError>
  listAll: (options?: { limit?: number; offset?: number }) => Effect<Issue[], DbError>
  upsert: (issue: UpsertIssue) => Effect<Issue, DbError>
  updateState: (id: string, state: IssueState) => Effect<void, DbError>
}

// Conversation Repository (Database)
interface ConversationRepository {
  appendMessage: (msg: Omit<ConversationMessage, "id" | "createdAt">) => Effect<ConversationMessage, DbError>
  getMessages: (issueId: string, phase?: "analysis" | "implementation") => Effect<ConversationMessage[], DbError>
  saveProposal: (issueId: string, content: string) => Effect<Proposal, DbError>
  getProposal: (issueId: string) => Effect<Proposal | null, DbError>
}

// Main Orchestrator
interface IssueLifecycleManager {
  getIssue: (id: string) => Effect<Issue | null, DbError>
  listIssues: (filter?: StatusFilter) => Effect<Issue[], DbError>
  dispatch: (issueId: string, action: IssueAction) => Effect<Issue, IssueError>
  getActiveSession: (issueId: string) => Effect<SessionHandle | null>
  events: Stream<IssueEvent>
  sendMessage: (issueId: string, text: string) => Effect<void, IssueError>
}
```

### Effect Patterns Used

| Pattern | Purpose |
|---------|---------|
| **Tagged Unions** (`Data.TaggedEnum`) | Type-safe state representation, impossible invalid states |
| **Scoped Resources** (`Effect.acquireRelease`, `Scope`) | Automatic cleanup of servers and SSE connections |
| **Streams** (`Stream`) | Reactive event handling from SSE |
| **PubSub** | Broadcasting events to multiple subscribers (UI, persistence) |
| **Ref** | Managing mutable state (active sessions, UI state) |
| **Layers** | Dependency injection for services |
| **Match** | Exhaustive pattern matching on states and events |

---

## Persistence

### Database Location

```
~/.local/share/glass/<project-hash>/
├── glass.db           # SQLite database
└── logs/              # Optional: log files
```

Where `<project-hash>` is a SHA256 hash (first 12 chars) of the absolute project path.

### Schema

```sql
-- Metadata table for project info
CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Issues table
CREATE TABLE issues (
    id TEXT PRIMARY KEY,                    -- Composite ID: "{source_type}:{source_id}"
    source_type TEXT NOT NULL               -- 'sentry', 'github', 'ticket'
        CHECK(source_type IN ('sentry', 'github', 'ticket')),
    source_data JSON NOT NULL,              -- Source-specific data (SentrySourceData, etc.)
    
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'analyzing', 'pending_approval', 'in_progress', 'pending_review', 'error')),
    
    -- Session references
    analysis_session_id TEXT,
    fix_session_id TEXT,
    
    -- Worktree info
    worktree_path TEXT,
    worktree_branch TEXT,
    
    -- Error info
    error_message TEXT,
    error_previous_state TEXT,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_source_type ON issues(source_type);
CREATE INDEX idx_issues_updated ON issues(updated_at DESC);

-- Conversation messages
CREATE TABLE conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('analysis', 'implementation')),
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_issue_phase ON conversation_messages(issue_id, phase, created_at);

-- Proposals (extracted from analysis for quick access)
CREATE TABLE proposals (
    issue_id TEXT PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trigger to update updated_at
CREATE TRIGGER issues_updated_at 
AFTER UPDATE ON issues
BEGIN
    UPDATE issues SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

### Persistence Scenarios

| Scenario | Handling |
|----------|----------|
| Glass restarts | Reconnect to existing OpenCode sessions, validate worktrees |
| OpenCode session lost | Mark issue as Error, user can retry |
| Worktree deleted externally | Mark issue as Error on startup validation |
| Mid-stream crash | Incomplete message lost (acceptable), retry from last complete state |
| Multiple projects | Each project gets its own database via path hash |

### Startup Sequence

1. Load config from TOML file
2. Initialize database (run migrations if needed)
3. Validate worktrees still exist for in_progress/pending_review issues
4. Start main OpenCode server for project
5. Reconnect any active sessions (issues in analyzing/pending_approval/in_progress states)
6. Fetch fresh issues from enabled sources (Sentry, GitHub, tickets, etc.)
7. Start TUI

---

## Configuration

### Config File Location

- Passed via CLI: `-c /path/to/glass.toml` or `--config /path/to/glass.toml`
- Default search: `./glass.toml`, then `~/.config/glass/config.toml`

### Schema

```toml
# =============================================================================
# Issue Sources (at least one required)
# =============================================================================

# Sentry source configuration
[sources.sentry]
enabled = true
organization = "my-org"
project = "my-project"
team = "my-team"
auth_token = "${SENTRY_AUTH_TOKEN}"  # Supports env var interpolation
region = "us"  # "us" or "de"

# GitHub source configuration (future)
# [sources.github]
# enabled = false
# owner = "my-org"
# repo = "my-repo"
# token = "${GITHUB_TOKEN}"
# labels = ["bug", "help wanted"]  # Filter by labels

# Local ticket source configuration (future)
# [sources.ticket]
# enabled = false
# directory = ".tickets"  # Relative to project root

# =============================================================================
# OpenCode Configuration
# =============================================================================

[opencode]
analyze_model = "anthropic/claude-sonnet-4-20250514"
fix_model = "anthropic/claude-sonnet-4-20250514"

# =============================================================================
# Worktree Configuration
# =============================================================================

[worktree]
# Command to create worktree - supports {path} and {branch} placeholders
create_command = "git worktree add {path} -b {branch}"
# Relative path from project root to worktree parent directory
# Can be outside project (e.g., "../my-project-worktrees/")
parent_directory = "../glass-worktrees"

# =============================================================================
# Display Configuration
# =============================================================================

[display]
page_size = 50
```

### CLI Interface

```bash
# Basic usage - uses ./glass.toml or ~/.config/glass/config.toml
glass /path/to/project

# Explicit config path
glass /path/to/project -c /path/to/glass.toml
glass /path/to/project --config /path/to/glass.toml
```

---

## User Interface

### Screen Flow

```
┌──────────────┐         ┌───────────────┐
│  List Screen │◀───────▶│ Detail Screen │
│              │  Enter  │               │
│ (all issues) │   / q   │ (single issue)│
└──────────────┘         └───────────────┘
```

### List Screen

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Glass                                              my-org/my-project [team] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   STATUS   ISSUE                                      EVENTS   LAST SEEN    │
│   ──────   ─────                                      ──────   ─────────    │
│   ● REVIEW TypeError: Cannot read property 'id'        127    2 hours ago   │
│   ◐ IMPL   ReferenceError: user is not defined          43    3 hours ago   │
│ ▶ ◉ APPRVL SyntaxError in config parser                891    1 hour ago    │
│   ◐ ANALYZ NetworkError: Failed to fetch               234    30 mins ago   │
│   ○        ValidationError: Invalid email format        56    4 hours ago   │
│   ○        TimeoutError: Request timed out              12    1 day ago     │
│   ○        DatabaseError: Connection refused            78    2 days ago    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ [↑↓] navigate  [Enter] open  [r] refresh  [?] help  [q] quit                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detail Screen (Split Pane)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← SyntaxError in config parser                                    ◉ APPRVL  │
├────────────────────────────────────┬────────────────────────────────────────┤
│ SENTRY                             │ AGENT                                  │
│ ────────────────────────────────── │ ────────────────────────────────────── │
│                                    │                                        │
│ SyntaxError: Unexpected token '}'  │ ─── ANALYSIS ───                       │
│                                    │                                        │
│ config/parser.ts:127               │ I've analyzed the issue. The error     │
│   at parseConfig (parser.ts:127)   │ occurs in `config/parser.ts:127`.      │
│   at loadSettings (settings.ts:45) │                                        │
│   at init (app.ts:12)              │ **Root Cause:**                        │
│                                    │ Missing comma after the `timeout`      │
│ ──────────────────────────────────│ field when building the config object. │
│ Breadcrumbs:                       │                                        │
│   • User clicked "Settings"        │ **Proposed Fix:**                      │
│   • Navigated to /settings/config  │ Add the missing comma on line 126:     │
│   • Changed timeout value          │                                        │
│   • Clicked "Save"                 │ ```diff                                │
│                                    │ - timeout: 5000                        │
│ ──────────────────────────────────│ + timeout: 5000,                       │
│ Environment: production            │ ```                                    │
│ Release: v2.3.1                    │                                        │
│ Events: 891 │ Users: 234           │ ─── FIX ───                            │
│ First: 3 days ago │ Last: 1h ago   │ (shown when in in_progress/pending_review)│
│                                    │                                        │
├────────────────────────────────────┼────────────────────────────────────────┤
│ [a]pprove  [x] reject  [c]hanges   │ > _                                    │
└────────────────────────────────────┴────────────────────────────────────────┘
```

**Layout:**
- **Left pane**: Sentry issue details (scrollable)
- **Right pane**: Agent conversation (scrollable) with input at bottom
- **Bottom bar**: Context-sensitive actions based on state

**Conversation Display:**
- Analysis phase messages shown first
- Separator between analysis and fix phases
- When in fix phase, analysis is preserved (read-only) above

### Status Icons & Colors

| Status | Icon | Color | Description |
|--------|------|-------|-------------|
| `pending` | `○` | dim/gray | Not started |
| `analyzing` | `◐` | yellow | Agent analyzing |
| `pending_approval` | `◉` | cyan | Awaiting approval |
| `in_progress` | `◐` | blue | Agent implementing |
| `pending_review` | `●` | green | Implementation complete, awaiting review |
| `error` | `✗` | red | Error occurred |

### Keybindings

**Global:**
- `q` - quit / back
- `?` - show help
- `r` - refresh issues from Sentry
- `Tab` - switch focus between panels

**List Screen:**
- `j`/`k` or `↑`/`↓` - navigate list
- `Enter` - open issue detail
- `g` - go to top
- `G` - go to bottom

**Detail Screen:**
- `h`/`l` or `←`/`→` - switch panel focus (Sentry ↔ Agent)
- `j`/`k` - scroll focused panel
- `Enter` - focus input (when agent pane focused)
- `Esc` - unfocus input
- `s` - start analysis (when in PENDING state)
- `a` - approve (when in PENDING_APPROVAL state)
- `x` - reject (when in PENDING_APPROVAL state)
- `c` - request changes (when in PENDING_APPROVAL state)
- `d` - cleanup worktree (when in PENDING_REVIEW state)
- `R` - retry (when in ERROR state)

---

## OpenCode Integration

### Session Events

```typescript
export type SessionEvent = Data.TaggedEnum<{
  MessageDelta: { content: string }
  MessageComplete: { messageId: string }
  StatusChanged: { status: SessionStatus }
  ToolStart: { toolName: string; toolId: string }
  ToolComplete: { toolId: string; result: string }
  Error: { message: string }
}>

export type SessionStatus = "idle" | "busy" | "waiting" | "error"
```

### Completion Detection

Primary: Event-based using `MessageComplete` + `StatusChanged` to `idle`
Fallback: Status API polling (if events prove unreliable)

### Analysis Prompt Template

The analysis prompt includes:
- Error message and type
- Full stacktrace with file paths and line numbers
- Breadcrumbs (user actions leading to error)
- Tags & context (environment, release, user info)
- Event frequency and user impact
- First/last seen timestamps

The agent has full codebase access during analysis to:
1. Read relevant source files from the stacktrace
2. Understand the context around the error
3. Propose a specific fix with rationale

### Implementation Prompt Template

The implementation prompt includes:
- Original issue data
- Approved proposal from analysis
- Instructions to implement the fix

---

## Project Structure

```
glass/
├── package.json
├── tsconfig.json
├── bun.lock
├── glass.toml.example
├── DESIGN.md                       # This document
├── src/
│   ├── main.ts                     # Entry point, CLI parsing
│   ├── config/
│   │   ├── schema.ts               # Effect Schema for config
│   │   └── loader.ts               # TOML loading + env interpolation
│   ├── db/
│   │   ├── client.ts               # SQLite client Layer
│   │   ├── migrations.ts           # Schema migrations
│   │   └── repositories/
│   │       ├── issues.ts           # Issue CRUD
│   │       └── conversations.ts    # Conversation message CRUD
│   ├── domain/
│   │   ├── issue.ts                # Issue types and state machine
│   │   ├── conversation.ts         # Conversation types
│   │   └── errors.ts               # Domain errors
│   ├── services/
│   │   ├── sentry/
│   │   │   ├── client.ts           # Sentry HTTP client
│   │   │   ├── types.ts            # API response types
│   │   │   └── queries.ts          # Issue list/detail queries
│   │   ├── opencode/
│   │   │   ├── manager.ts          # Server lifecycle management
│   │   │   ├── client.ts           # SDK wrapper
│   │   │   ├── events.ts           # SSE event stream handling
│   │   │   └── prompts.ts          # Analysis/fix prompt templates
│   │   ├── git/
│   │   │   └── worktree.ts         # Worktree create/remove
│   │   └── lifecycle.ts            # IssueLifecycleManager
│   ├── ui/
│   │   ├── app.ts                  # Main app, screen routing
│   │   ├── theme.ts                # Colors, styles
│   │   ├── keybinds.ts             # Keybind definitions
│   │   ├── screens/
│   │   │   ├── list.ts             # Issue list
│   │   │   └── detail.ts           # Issue detail (split pane)
│   │   └── components/
│   │       ├── status-badge.ts     # Status icon + text
│   │       ├── sentry-pane.ts      # Left pane content
│   │       ├── agent-pane.ts       # Right pane + input
│   │       ├── help-modal.ts       # Keybind help overlay
│   │       └── action-bar.ts       # Bottom bar
│   └── lib/
│       ├── effect-opentui.ts       # Effect/OpenTUI bridge utilities
│       └── markdown.ts             # Markdown rendering helpers
└── test/
    └── ...
```

---

## Dependencies

```json
{
  "dependencies": {
    "effect": "^3.x",
    "@effect/platform": "^0.x",
    "@effect/platform-bun": "^0.x",
    "@effect/sql": "^0.x",
    "@effect/sql-sqlite-bun": "^0.x",
    "@effect/schema": "^0.x",
    "@opentui/core": "^0.x",
    "@opencode-ai/sdk": "latest",
    "@iarna/toml": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/bun": "latest"
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation
1. Project setup (bun, typescript, effect, opentui)
2. Config loading with Effect Schema validation
3. SQLite setup with migrations
4. Basic TUI shell with navigation

### Phase 2: Sentry Integration
1. Sentry API client (list issues, get details, get latest event)
2. Issue list screen with status icons
3. Issue detail screen (left pane - Sentry data)
4. Refresh on boot and `r` key

### Phase 3: OpenCode Integration
1. OpenCode SDK client wrapper
2. SSE event stream handling
3. Agent output display (right pane)
4. Input field for agent responses

### Phase 4: Analysis Workflow
1. Analysis prompt template
2. Start analysis action
3. Stream agent output
4. Detect proposal completion
5. Approve/reject/request changes actions

### Phase 5: Implementation Workflow
1. Git worktree creation
2. Start implementation in worktree
3. Stream implementation progress
4. Completion detection
5. Worktree cleanup action

### Phase 6: Polish
1. Error handling and display
2. Retry mechanisms
3. Keyboard shortcuts help
4. Status persistence across restarts

---

## Scope

### MVP (In Scope)

- Config via TOML file
- CLI arg for project path and config path
- Sentry issue list filtered by project and team
- Issue detail view with Sentry data
- Analysis workflow (agent proposes fix with codebase access)
- Approval/rejection/request-changes flow
- Conversation persistence (survives restarts, can resume later)
- Git worktree creation for fixes
- Fix workflow (agent implements approved fix)
- SQLite persistence of all state
- Basic agent activity display with streaming
- User can respond to agent questions inline

### Future (Out of Scope for MVP)

- Code review within Glass
- Commit creation within Glass
- PR creation within Glass
- Auto-detect merged PR and cleanup worktree
- Sentry webhooks (real-time updates)
- Multiple project support in single Glass instance
- Explicit "ignore issue" functionality

---

## API References

### Sentry API

- Base URL: `https://sentry.io/api/0/` (or region-specific)
- Auth: Bearer token via `Authorization` header
- Key endpoints:
  - `GET /projects/{org}/{project}/issues/` - List issues
  - `GET /organizations/{org}/issues/` - List org issues (with query filter)
  - `GET /organizations/{org}/issues/{issue_id}/` - Get issue detail
  - `GET /organizations/{org}/issues/{issue_id}/events/latest/` - Get latest event

### OpenCode SDK

- Package: `@opencode-ai/sdk`
- Key methods:
  - `createOpencode()` - Start server + client
  - `createOpencodeClient()` - Client only (connect to existing server)
  - `client.session.create()` - Create new session
  - `client.session.prompt()` - Send message (waits for response)
  - `client.session.promptAsync()` - Send message (returns immediately)
  - `client.event.subscribe()` - SSE event stream

### OpenTUI

- Package: `@opentui/core`
- Key components: `Box`, `Text`, `Input`, `ScrollBox`
- Layout: Yoga-powered flexbox
- Renderer: `createCliRenderer()`
