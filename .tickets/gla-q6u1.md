---
id: gla-q6u1
status: open
deps: [gla-zrqi]
links: []
created: 2026-01-30T17:06:24Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [git, core]
---
# Git worktree service

Implement git worktree creation and management

## Design

- WorktreeService interface:
  - create(branchName) -> Effect<path, WorktreeError>
  - remove(path) -> Effect<void, WorktreeError>
  - exists(path) -> Effect<boolean>
  - list() -> Effect<string[], WorktreeError>
- Use configurable create_command with {path} and {branch} placeholders
- Use configurable parent_directory (can be relative, e.g., '../glass-worktrees/')
- Branch naming: glass/fix-{issueId}

## Acceptance Criteria

- Creates worktrees with configured command
- Respects parent_directory config
- Can detect existing worktrees
- Can remove worktrees
- Handles errors (branch exists, etc.)

