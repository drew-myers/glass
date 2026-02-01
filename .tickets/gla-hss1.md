---
id: gla-hss1
status: closed
deps: [gla-fvc3]
links: []
created: 2026-01-30T17:07:06Z
type: task
priority: 3
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, polish]
---
# Help modal with keybind reference

Implement '?' keybind to show help modal with all keybindings

## Design

- Modal overlay showing all keybinds
- Organized by context (global, list, detail)
- Dismissible with '?' or Esc
- Styled consistently with app theme

## Acceptance Criteria

- '?' opens help modal
- All keybinds documented
- Easy to dismiss
- Readable and well-organized


## Notes

**2026-02-01T22:03:41Z**

Obsolete: OpenTUI removed. Can add simple help to Rust TUI later if needed.
