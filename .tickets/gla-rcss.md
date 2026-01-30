---
id: gla-rcss
status: open
deps: [gla-4uzo, gla-q6u1, gla-4e89, gla-xdb9]
links: []
created: 2026-01-30T17:06:35Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [fix, core]
---
# Fix workflow implementation

Implement the full fix workflow: worktree creation, server startup, fix execution

## Design

- On Approve action:
  1. Create worktree via WorktreeService
  2. Start dedicated OpenCode server for worktree
  3. Create session on worktree server
  4. Send fix prompt with approved proposal
  5. Stream progress to UI
- Track worktree server in active servers map
- Transition to Fixing state with worktree info
- Handle agent questions during fix

## Acceptance Criteria

- Worktree created on approve
- Dedicated server started for worktree
- Fix prompt sent with proposal
- Progress streams to UI
- Can respond to agent questions

