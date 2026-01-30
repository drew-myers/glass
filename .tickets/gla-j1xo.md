---
id: gla-j1xo
status: open
deps: [gla-fvc3, gla-jw8k, gla-nmfm, gla-htpw]
links: []
created: 2026-01-30T17:05:06Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, sentry]
---
# Issue list screen

Implement the issue list screen showing Sentry issues with status indicators

## Design

- Columns: Status icon, Issue title, Event count, Last seen
- Status icons: ○ pending, ◐ analyzing/fixing, ◉ proposed, ● fixed, ✗ error
- Color coding per status (see DESIGN.md)
- Vim-style navigation (j/k, g/G)
- Selected row highlighting
- Header with org/project/team info
- Footer with keybind hints
- Fetch issues from Sentry on boot and on 'r' key

## Acceptance Criteria

- Displays issues from Sentry
- Status icons and colors match state
- Navigation works smoothly
- Refresh fetches new data
- Handles empty state gracefully

