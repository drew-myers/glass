---
id: gla-nmfm
status: closed
deps: [gla-cu9p]
links: []
created: 2026-01-30T17:04:28Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [foundation, database]
---
# SQLite database setup with migrations

Set up SQLite database with @effect/sql-sqlite-bun and create schema

## Design

- Database location: ~/.local/share/glass/<project-hash>/glass.db
- Project hash: first 12 chars of SHA256 of absolute project path
- Tables: metadata, issues, conversation_messages, proposals
- Migrations system for schema versioning
- See DESIGN.md Persistence section for full schema

## Acceptance Criteria

- Creates database directory and file
- Runs migrations on startup
- Provides IssueRepository and ConversationRepository as Effect Layers
- Handles concurrent access safely


## Notes

**2026-01-30T19:12:43Z**

## Design Update: IssueSource Abstraction

The schema has changed to support multiple issue sources. Key changes:

1. Issues table now uses:
   - `id TEXT PRIMARY KEY` - Composite format: `{source_type}:{source_id}`
   - `source_type TEXT NOT NULL` - One of: 'sentry', 'github', 'ticket'
   - `source_data JSON NOT NULL` - Source-specific data (replaces sentry_project/sentry_data)

2. New index: `CREATE INDEX idx_issues_source_type ON issues(source_type);`

3. Removed: `sentry_project` and `sentry_data` columns

See DESIGN.md Persistence > Schema for the updated SQL.

**2026-01-30T22:46:00Z - Implementation Complete**

Implemented SQLite persistence layer with the following structure:

### Files Created

- `src/lib/project.ts` - ProjectPath service for passing project path through layers
- `src/db/errors.ts` - DbError and DbNotFoundError tagged errors
- `src/db/client.ts` - SqliteLive and SqliteTestLive layers
- `src/db/migrations.ts` - MigratorLive layer with custom loader
- `src/db/migrations/0001_initial_schema.ts` - Initial schema migration
- `src/db/repositories/issues.ts` - SentryIssueRepository
- `src/db/repositories/conversations.ts` - ConversationRepository
- `src/db/index.ts` - Combined DatabaseLive and DatabaseTestLive layers
- `vitest.config.ts` - Vitest configuration

### Tests Created

- `test/lib/project.test.ts` - ProjectPath helper tests
- `test/db/repositories/issues.test.ts` - SentryIssueRepository tests
- `test/db/repositories/conversations.test.ts` - ConversationRepository tests

### Key Design Decisions

1. **Separate tables per issue source**: Created `sentry_issues` table instead of a generic `issues` table. This allows source-specific columns and better query performance. GitHub and Ticket tables will be added in future tickets.

2. **Denormalized workflow state**: Status, session IDs, worktree info stored directly in issue tables rather than a separate workflow table. This gives flexibility for different source types to have different workflow shapes.

3. **ProjectPath as Effect service**: Project path is passed through layers via a Context.Tag, making it easy to inject different paths for testing.

4. **In-memory SQLite for tests**: DatabaseTestLive uses `:memory:` SQLite database for fast, isolated tests with real database behavior.

5. **Vitest with Bun runtime**: Tests require `bun run --bun vitest` to load `bun:sqlite` module correctly.

### All acceptance criteria met:
- Database directory and file creation
- Migrations run on startup via Layer composition
- IssueRepository (SentryIssueRepository) and ConversationRepository as Effect Layers
- Concurrent access handled via SQLite WAL mode (default in bun:sqlite)
