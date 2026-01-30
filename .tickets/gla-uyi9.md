---
id: gla-uyi9
status: open
deps: []
links: []
created: 2026-01-30T17:04:08Z
type: epic
priority: 1
assignee: Drew Myers
---
# Glass MVP Implementation

Implement the Glass TUI application for orchestrating Sentry issue fixes via OpenCode agents

## Design

See DESIGN.md for full architecture and specifications

## Acceptance Criteria

- Can list Sentry issues for a project/team
- Can analyze issues with OpenCode agent
- Can approve/reject/request changes on proposals
- Can create worktrees and run fixes
- Persists all state across restarts
- Clean lazygit/opencode-inspired UI

