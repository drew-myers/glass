---
id: gla-ugvq
status: open
deps: [gla-j1xo]
links: []
created: 2026-01-30T17:05:13Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, sentry]
---
# Issue detail screen - Sentry pane

Implement the left pane of the detail screen showing Sentry issue data

## Design

- Split-pane layout (left: Sentry, right: Agent)
- Sentry pane contents:
  - Error message and type
  - Full stacktrace with file/line info
  - Breadcrumbs
  - Tags (environment, release)
  - Event count and user impact
  - First/last seen timestamps
- Scrollable content
- Panel focus switching with Tab or h/l
- Back navigation with 'q' or left arrow

## Acceptance Criteria

- Shows full Sentry issue details
- Scrolling works
- Panel focus visually indicated
- Navigation back to list works

