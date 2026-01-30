---
id: gla-2bst
status: open
deps: [gla-zrqi, gla-jw8k]
links: []
created: 2026-01-30T17:05:48Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [opencode, analysis]
---
# Analysis prompt template

Create the prompt template for issue analysis

## Design

- Include: error message/type, full stacktrace, breadcrumbs, tags/context, event frequency, first/last seen
- Instruct agent to:
  1. Read relevant source files from stacktrace
  2. Understand context around error
  3. Propose specific fix with rationale
- Format output as structured proposal
- Use configured analyze_model

## Acceptance Criteria

- Prompt includes all Sentry context
- Agent can access codebase
- Output is structured and parseable

