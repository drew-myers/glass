---
id: gla-rcss
status: open
deps: [gla-4uzo, gla-q6u1, gla-4e89, gla-xdb9]
links: [docs/RFC-001-pi-sdk-migration.md]
created: 2026-01-30T17:06:35Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [implementation, core]
---
# Implementation workflow

Implement the full fix workflow: worktree creation, session setup, implementation execution.

## Design

On Approve action:
1. Create worktree via WorktreeService
2. Create fix session via AgentService with worktree cwd
3. Subscribe to session events
4. Send implementation prompt with approved proposal
5. Stream progress to UI
6. Transition to InProgress state

Key difference from previous design: **no server startup** - Pi sessions run in-process.

## Sequence

```
User clicks Approve
        │
        ▼
┌───────────────────┐
│ WorktreeService   │
│ .create(branch)   │──▶ returns worktreePath
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ AgentService      │
│ .createFixSession │──▶ returns AgentSessionHandle
│ (worktreePath)    │    (cwd = worktreePath, full tools)
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Subscribe to      │
│ session events    │──▶ forward to IssueEvent PubSub
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ session.prompt()  │
│ with fix template │──▶ agent starts working
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Update state to   │
│ InProgress        │
└───────────────────┘
```

## Acceptance Criteria

- Worktree created on approve
- Fix session created with worktree cwd and full tools
- Implementation prompt sent with proposal
- Progress streams to UI via event subscription
- Can respond to agent questions via `sendMessage()`
- State transitions correctly to InProgress
