---
id: gla-umop
status: open
deps: [gla-7t1h]
links: []
created: 2026-01-30T17:07:12Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [testing]
---
# End-to-end integration testing

Create integration tests for the full workflow

## Design

- Test full lifecycle: pending -> analyzing -> proposed -> fixing -> fixed -> cleanup
- Mock Sentry API responses
- Mock or use real OpenCode (configurable)
- Test error scenarios
- Test persistence/restart scenarios

## Acceptance Criteria

- Full happy path tested
- Error scenarios covered
- Persistence verified
- Tests run in CI

