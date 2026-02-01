---
id: gla-61cx
status: closed
deps: []
links: []
created: 2026-02-01T22:00:00Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [foundation]
---
# Architecture redesign: Server + Rust TUI

Replace OpenTUI-based TypeScript TUI with a two-component architecture:
1. **glass-server** (TypeScript + Effect + Bun) - REST API backend
2. **glass** (Rust + Ratatui) - Native terminal UI

See RFC-002 for full design.

## Motivation

- OpenTUI too complex for simple list/detail UI
- JS/TS lacks mature native TUI options
- Agent interaction should be headless by default
- Escape hatch to `pi` CLI for interactive sessions

## Acceptance Criteria

- [x] Monorepo structure (server/ + tui/)
- [x] Server exposes REST API on :7420
- [x] TUI connects to server, renders list/detail
- [x] TUI auto-starts server if not running
- [x] `just dev` runs both together
- [x] `just dist` builds distribution package
- [x] All server tests pass (179)
- [x] TUI serde tests pass (8)

## Notes

Completed 2026-02-01.

### Key Decisions

1. **Headless Pi by default** - Agent interaction is the exception, not the rule
2. **Escape hatch** - Shell out to `pi --session <path>` for interactive mode
3. **Clean separation** - Server owns state/logic, TUI is thin client
4. **Distribution** - Two binaries, TUI spawns server as child process

### Files Created

- `docs/RFC-002-architecture-redesign.md` - Full API spec
- `server/src/api/` - REST handlers
- `tui/` - Entire Rust TUI
- `justfile` - Build/dev commands
- `dist/` - Distribution binaries

### Distribution

- glass (Rust TUI): 4.5MB
- glass-server (Bun compiled): 58MB
- Total: 63MB
