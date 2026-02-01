---
id: gla-xdb9
status: open
deps: [gla-htpw, gla-nmfm, gla-brhx, gla-ruxi, gla-2bst]
links: [docs/RFC-001-pi-sdk-migration.md]
created: 2026-01-30T17:05:57Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [core, orchestration]
---
# IssueLifecycleManager service

Implement the main orchestrator service that ties together state, sessions, and events.

## Design

- Central service managing issue lifecycles
- `dispatch(issueId, action)` → validates and executes state transitions
- Creates/disposes Pi AgentSessions based on transitions (via AgentService)
- Manages active sessions in `Ref<HashMap<issueId, AgentSessionHandle>>`
- Publishes IssueEvents via PubSub
- Subscribes to session events and forwards as IssueEvents
- Persists state changes to database
- `sendMessage()` for user input to active sessions
- See DESIGN.md Service Architecture section

## Key Transitions

| Action | Session Behavior |
|--------|------------------|
| `StartAnalysis` | Create analysis session, subscribe to events, send analysis prompt |
| `Approve` | Dispose analysis session, create fix session in worktree |
| `Reject` | Dispose analysis session |
| `Complete` | Dispose fix session |
| `Cleanup` | Dispose fix session if still active |

## Acceptance Criteria

- `dispatch()` performs valid transitions
- Analysis/fix sessions created with correct tools and cwd
- Events published for all state changes
- State persisted to database
- Invalid transitions rejected with clear errors
- `sendMessage()` forwards to active session's `prompt()`
