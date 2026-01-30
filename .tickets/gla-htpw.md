---
id: gla-htpw
status: closed
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

- IssueState tagged enum: Pending, Analyzing, PendingApproval, InProgress, PendingReview, Error
- IssueAction tagged enum: StartAnalysis, CompleteAnalysis, Approve, Reject, RequestChanges, Complete, Fail, Retry, Cleanup
- IssueEvent tagged enum for pub/sub: StateChanged, AgentMessage, AgentWaitingForInput, AgentComplete, AgentError
- transition() function that validates and performs state transitions
- ConversationMessage and Proposal types
- See DESIGN.md Domain Model section

## Acceptance Criteria

- All state types compile with proper exhaustive matching
- transition() rejects invalid state transitions
- All valid transitions work correctly
- Types are exported for use by other modules


## Notes

**2026-01-30T17:54:54Z**

## Implementation Complete

### Files Created
- `src/domain/errors.ts` - InvalidTransitionError tagged error
- `src/domain/issue.ts` - Core domain model:
  - `IssueState` TaggedEnum (Pending, Analyzing, PendingApproval, InProgress, PendingReview, Error)
  - `IssueAction` TaggedEnum (StartAnalysis, CompleteAnalysis, Approve, Reject, RequestChanges, Complete, Fail, Retry, Cleanup)
  - `IssueEvent` TaggedEnum (StateChanged, AgentMessage, AgentWaitingForInput, AgentComplete, AgentError)
  - `Issue` interface with SentryIssueData placeholder
  - `transition()` function with exhaustive pattern matching via Effect Match
- `src/domain/conversation.ts` - ConversationMessage and Proposal types
- `src/domain/index.ts` - Re-exports
- `test/domain/issue.test.ts` - 27 tests covering all valid/invalid transitions

### Configuration Changes
- `biome.json` - Disabled `noBannedTypes` rule (Effect TaggedEnum requires `{}` for empty variants)

### Design Decisions
- Used `Data.TaggedEnum` for type-safe discriminated unions
- `transition()` returns `Effect<IssueState, InvalidTransitionError>` for composability
- `SentryIssueData` is a placeholder - will be expanded in gla-jw8k (Sentry API client)
- Error state tracks `previousState` ("analyzing" | "in_progress") for better error context

All tests pass (44 total), typecheck clean, lint clean.

**2026-01-30T19:13:37Z**

## Additional Work: IssueSource Abstraction

After initial implementation, we added an `IssueSource` abstraction to support multiple issue sources (Sentry, GitHub, local tickets).

### Additional Changes
- Added `IssueSource` tagged enum with Sentry, GitHub, Ticket variants
- Added `IssueSourceCommon` interface for shared display fields
- Added `SentrySourceData`, `GitHubSourceData`, `TicketSourceData` interfaces
- Added `getSourceCommon()` and `getSourceType()` helper functions
- Updated `Issue` interface to use `source: IssueSource` instead of `sentryProject`/`sentryData`
- Added composite ID format: `{source_type}:{source_id}`
- Updated DESIGN.md with new domain model and schema
- Added 7 new tests for IssueSource (51 total tests passing)

### Related Ticket Updates
- gla-jw8k: Now implements SentrySourceData, returns IssueSource.Sentry
- gla-nmfm: Schema uses source_type + source_data columns
- gla-ugvq: Becomes Sentry-specific detail pane with Match on source._tag
- gla-xmxy: New ticket for config refactor to [sources.sentry] structure
