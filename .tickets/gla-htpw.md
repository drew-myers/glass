---
id: gla-htpw
status: open
deps: [gla-cu9p]
links: []
created: 2026-01-30T17:04:35Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [foundation, domain]
---
# Domain model and state machine

Implement the Issue domain model with Effect tagged unions and state machine

## Design

- IssueState tagged enum: Pending, Analyzing, Proposed, Fixing, Fixed, Error
- IssueAction tagged enum: StartAnalysis, CompleteAnalysis, Approve, Reject, RequestChanges, CompleteFix, Fail, Retry, Cleanup
- IssueEvent tagged enum for pub/sub: StateChanged, AgentMessage, AgentWaitingForInput, AgentComplete, AgentError
- transition() function that validates and performs state transitions
- ConversationMessage and Proposal types
- See DESIGN.md Domain Model section

## Acceptance Criteria

- All state types compile with proper exhaustive matching
- transition() rejects invalid state transitions
- All valid transitions work correctly
- Types are exported for use by other modules

