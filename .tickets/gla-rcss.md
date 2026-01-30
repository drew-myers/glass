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
tags: [implementation, core]
---
# Implementation workflow

Implement the full implementation workflow: worktree creation, server startup, implementation execution

## Design

- On Approve action:
  1. Create worktree via WorktreeService
  2. Start dedicated OpenCode server for worktree
  3. Create session on worktree server
  4. Send implementation prompt with approved proposal
  5. Stream progress to UI
- Track worktree server in active servers map
- Transition to InProgress state with worktree info
- Handle agent questions during implementation

## Acceptance Criteria

- Worktree created on approve
- Dedicated server started for worktree
- Implementation prompt sent with proposal
- Progress streams to UI
- Can respond to agent questions

