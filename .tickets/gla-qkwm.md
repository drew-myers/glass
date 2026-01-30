---
id: gla-qkwm
status: open
deps: [gla-cu9p]
links: []
created: 2026-01-30T17:04:48Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [foundation]
---
# CLI argument parsing

Implement CLI argument parsing for project path and config file

## Design

- Positional arg: project path (required)
- -c/--config: path to config file (optional)
- --help: show usage
- Use @effect/cli or simple manual parsing
- Validate project path exists and is a directory

## Acceptance Criteria

- glass /path/to/project works
- glass /path/to/project -c config.toml works
- glass --help shows usage
- Invalid paths show clear errors

