---
id: gla-2bst
status: open
deps: [gla-zrqi, gla-jw8k]
links: [docs/RFC-001-pi-sdk-migration.md]
created: 2026-01-30T17:05:48Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [agent, analysis]
---
# Analysis prompt template

Create the prompt template for issue analysis phase.

## Design

- Include: error message/type, full stacktrace, breadcrumbs, tags/context, event frequency, first/last seen
- Instruct agent to:
  1. Read relevant source files from stacktrace
  2. Understand context around error
  3. Propose specific fix with rationale
- Format output as structured proposal
- Use configured `analyze_model` (from `[agent]` config)

## Tools Available

Analysis sessions use **read-only tools** via `createReadOnlyTools()`:
- `read` - Read file contents
- `grep` - Search file contents  
- `find` - Find files by name/pattern
- `ls` - List directory contents

The agent cannot modify files during analysis - only propose changes.

## Prompt Structure

```markdown
# Issue Analysis

## Error Details
- Type: {error_type}
- Message: {error_message}
- Culprit: {culprit}

## Stacktrace
{formatted_stacktrace}

## Breadcrumbs
{formatted_breadcrumbs}

## Context
- Environment: {environment}
- Release: {release}
- Events: {event_count} | Users: {user_count}
- First seen: {first_seen} | Last seen: {last_seen}

## Instructions
1. Read the source files mentioned in the stacktrace
2. Understand the context and root cause
3. Propose a specific fix with clear rationale

Format your proposal as:
### Root Cause
[explanation]

### Proposed Fix
[specific changes with file paths and code]

### Risk Assessment
[potential side effects or concerns]
```

## Acceptance Criteria

- Prompt includes all Sentry context
- Agent uses read-only tools to explore codebase
- Output follows structured proposal format
- Proposal is parseable for storage
