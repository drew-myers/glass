---
id: gla-4e89
status: open
deps: [gla-2bst]
links: [docs/RFC-001-pi-sdk-migration.md]
created: 2026-01-30T17:06:29Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [agent, fix]
---
# Fix prompt template

Create the prompt template for implementing approved fixes.

## Design

- Include: original Sentry issue summary, approved proposal
- Instruct agent to implement the proposed fix
- Use configured `fix_model` (from `[agent]` config)
- Explain worktree context (isolated branch for this fix)

## Tools Available

Fix sessions use **full coding tools** via `createCodingTools()`:
- `read` - Read file contents
- `bash` - Execute shell commands
- `edit` - Make surgical edits to files
- `write` - Create or overwrite files

The agent operates in the worktree directory, so all changes are isolated.

## Prompt Structure

```markdown
# Implement Fix

## Original Issue
- Type: {error_type}
- Message: {error_message}
- Location: {culprit}

## Approved Proposal

{proposal_content}

## Environment
You are working in a git worktree at: {worktree_path}
Branch: {worktree_branch}

All changes are isolated to this branch. Implement the proposed fix.

## Instructions
1. Implement the changes described in the proposal
2. Verify the fix compiles/passes basic checks if possible
3. Keep changes minimal and focused on the fix
```

## Acceptance Criteria

- Prompt includes issue summary and full proposal
- Agent understands worktree isolation
- Agent has full editing capabilities
- Clear scope boundaries for implementation
