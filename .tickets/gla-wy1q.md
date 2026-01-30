---
id: gla-wy1q
status: open
deps: [gla-rcss]
links: []
created: 2026-01-30T17:06:42Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [implementation, core]
---
# Implementation completion and PendingReview state

Detect implementation completion and transition to PendingReview state

## Design

- Detect completion via MessageComplete + idle status
- Transition to PendingReview state (preserve worktree info)
- Update UI to show completion and cleanup option
- Persist final state

## Acceptance Criteria

- Detects when agent finishes implementation
- Transitions to PendingReview state
- Worktree info preserved
- UI shows cleanup option

