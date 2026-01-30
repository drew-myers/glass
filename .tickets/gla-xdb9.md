---
id: gla-xdb9
status: open
deps: [gla-htpw, gla-nmfm, gla-brhx, gla-ruxi, gla-2bst]
links: []
created: 2026-01-30T17:05:57Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [core, orchestration]
---
# IssueLifecycleManager service

Implement the main orchestrator service that ties together state, sessions, and events

## Design

- Central service managing issue lifecycles
- dispatch(issueId, action) -> validates and executes state transitions
- Starts/stops OpenCode sessions based on transitions
- Manages active sessions in Ref<HashMap>
- Publishes IssueEvents via PubSub
- Forwards session events to issue events
- Persists state changes to database
- sendMessage() for user input to active sessions
- See DESIGN.md Service Architecture section

## Acceptance Criteria

- dispatch() performs valid transitions
- Sessions created/destroyed appropriately
- Events published for all changes
- State persisted to database
- Invalid transitions rejected with clear errors

