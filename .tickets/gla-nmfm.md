---
id: gla-nmfm
status: open
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
