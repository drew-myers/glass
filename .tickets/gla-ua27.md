---
id: gla-ua27
status: open
deps: [gla-xdb9, gla-4ia3]
links: []
created: 2026-01-30T17:06:04Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, analysis]
---
# Start analysis action

Implement the 's' keybind to start analysis on a pending issue

## Design

- 's' key in detail view when issue is Pending
- Dispatches StartAnalysis action
- Transitions to Analyzing state
- Creates OpenCode session on main server
- Sends analysis prompt
- UI updates to show streaming output

## Acceptance Criteria

- 's' starts analysis on pending issue
- State transitions correctly
- Agent output streams to UI
- Disabled/hidden for non-pending issues

