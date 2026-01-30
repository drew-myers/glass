---
id: gla-j8ic
status: open
deps: [gla-xdb9, gla-q6u1]
links: []
created: 2026-01-30T17:07:01Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [startup, persistence]
---
# Startup reconnection logic

Implement session and worktree reconnection on Glass restart

## Design

- On startup, check for issues in active states (analyzing, proposed, fixing)
- For each:
  - Check if OpenCode session still exists
  - Check if worktree still exists (for fixing/fixed)
  - Reconnect SSE streams if session alive
  - Mark as Error if session/worktree gone
- Validate worktrees exist before marking as valid
- Detect orphaned worktrees (exist but not in DB)

## Acceptance Criteria

- Active sessions reconnected on restart
- Dead sessions marked as errors
- Missing worktrees detected
- Orphaned worktrees warned about

