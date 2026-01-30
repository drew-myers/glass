---
id: gla-npwt
status: open
deps: [gla-wy1q, gla-q6u1]
links: []
created: 2026-01-30T17:06:47Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, fix]
---
# Worktree cleanup action

Implement the 'd' keybind to cleanup worktree after fix is complete

## Design

- 'd' key in detail view when issue is Fixed
- Confirmation prompt before cleanup
- Stops worktree OpenCode server
- Removes worktree via WorktreeService
- Transitions back to Pending
- Clears worktree info from DB

## Acceptance Criteria

- 'd' triggers cleanup on fixed issues
- Confirmation before action
- Server stopped, worktree removed
- State returns to Pending

