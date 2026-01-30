---
id: gla-brhx
status: open
deps: [gla-zrqi, gla-cu9p]
links: []
created: 2026-01-30T17:05:20Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [opencode, core]
---
# OpenCode server lifecycle management

Implement OpenCode server lifecycle management with Effect Scopes

## Design

- Main server for analysis (shared, starts on Glass boot)
- Worktree servers for fix phase (one per worktree)
- Effect Scope-based resource management
- makeServer() returns ServerInstance, auto-cleanup on scope close
- Track active servers in Ref<HashMap<path, ServerInstance>>
- Server health checking
- Graceful shutdown on Glass exit

## Acceptance Criteria

- Main server starts on Glass boot
- Worktree servers can be created/destroyed
- All servers cleaned up on exit
- Health check detects dead servers

