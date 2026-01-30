---
id: gla-zrqi
status: closed
deps: [gla-cu9p]
links: []
created: 2026-01-30T17:04:22Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [foundation, config]
---
# Config system with TOML loading

Implement configuration loading from TOML files with Effect Schema validation

## Design

- Effect Schema for config validation
- Support env var interpolation (${VAR_NAME})
- Config file search: CLI arg > ./glass.toml > ~/.config/glass/config.toml
- Sections: sentry, opencode, worktree, display
- See DESIGN.md Config section for full schema

## Acceptance Criteria

- Loads and validates glass.toml
- Interpolates environment variables
- Returns typed Config object
- Fails gracefully with clear error on invalid config

