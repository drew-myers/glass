---
id: gla-4uzo
status: open
deps: [gla-d38x, gla-jfww]
links: []
created: 2026-01-30T17:06:16Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, analysis]
---
# Review actions (approve/reject/request changes)

Implement the review actions for proposed fixes

## Design

- 'a' key: Approve - transitions to Fixing, creates worktree
- 'x' key: Reject - transitions to Pending, cleans up session
- 'c' key: Request changes - prompts for feedback, continues analysis session
- Actions only available in Proposed state
- Visual feedback on action taken
- Confirmation for reject?

## Acceptance Criteria

- All three actions work correctly
- State transitions appropriately
- Request changes continues conversation
- Actions disabled for non-proposed states

