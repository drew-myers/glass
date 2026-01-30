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

