---
id: gla-1fsx
status: open
deps: [gla-xdb9]
links: []
created: 2026-01-30T17:06:53Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, errors]
---
# Error state handling and display

Implement error state handling and UI display

## Design

- Error state shows error message in detail view
- 'R' key to retry (starts new analysis session)
- 'x' key to reject and return to pending
- Error icon and color in list view
- Clear error messages for common failures:
  - Network errors
  - Session lost
  - Worktree issues

## Acceptance Criteria

- Errors displayed clearly
- Retry action works
- Can reject errored issues
- List shows error status

