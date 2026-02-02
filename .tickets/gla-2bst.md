---
id: gla-2bst
status: closed
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

## Notes

**2026-02-02T01:06:45Z**

Implemented analysis prompt template module:

**Files created:**
- `server/src/services/prompts/formatters.ts` - Reusable formatters for stacktraces, exceptions, breadcrumbs, requests, user/context info, and tags
- `server/src/services/prompts/analysis.ts` - `buildAnalysisPrompt(issue)` function that builds the full analysis prompt for Sentry issues
- `server/src/services/prompts/index.ts` - Module exports
- `server/test/services/prompts/formatters.test.ts` - 26 tests for formatters
- `server/test/services/prompts/analysis.test.ts` - 20 tests for prompt builder

**Key features:**
- Supports all Sentry context: exceptions, stacktraces (with source context + locals), breadcrumbs, HTTP requests, user info, runtime contexts, tags
- Stacktraces shown in standard order (most recent first)
- Breadcrumbs limited to last 30 with count of omitted
- Sensitive headers (auth, cookie) redacted
- Long values truncated
- `extractStacktraceFiles()` utility to get in-app file paths from stacktrace
- Extensible via Match.tag for future GitHub/Ticket sources

**Prompt structure:**
1. Error Summary (title, type, message, culprit, project)
2. Impact (events, users, first/last seen)
3. Environment (if available)
4. Exception & Stacktrace
5. Breadcrumbs
6. HTTP Request (if available)
7. User/Runtime Context (if available)
8. Tags
9. Task instructions (read-only tools, structured output guidance)

All 46 tests pass.
