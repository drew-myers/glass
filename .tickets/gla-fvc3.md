---
id: gla-fvc3
status: open
deps: [gla-cu9p]
links: []
created: 2026-01-30T17:04:43Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [foundation, ui]
---
# Basic TUI shell with OpenTUI

Create the basic TUI application shell with OpenTUI renderer and screen routing

## Design

- Effect + OpenTUI integration (effect-opentui.ts bridge)
- Main app component with screen state (list vs detail)
- Theme constants (colors matching opencode/lazygit aesthetic)
- Basic keyboard handling (q to quit, navigation)
- Status bar and action bar components
- Renderer lifecycle management with Effect Scope

## Acceptance Criteria

- App starts and displays empty shell
- Can quit with 'q'
- Proper cleanup on exit
- Theme colors applied

