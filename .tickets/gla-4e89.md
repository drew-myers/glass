---
id: gla-4e89
status: open
deps: [gla-2bst]
links: []
created: 2026-01-30T17:06:29Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [opencode, fix]
---
# Fix prompt template

Create the prompt template for implementing fixes

## Design

- Include: original Sentry issue data, approved proposal
- Instruct agent to implement the proposed fix
- Use configured fix_model
- Context about worktree environment

## Acceptance Criteria

- Prompt includes Sentry context and proposal
- Agent understands what to implement
- Clear instructions for fix scope

