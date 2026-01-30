---
id: gla-d38x
status: open
deps: [gla-ua27]
links: []
created: 2026-01-30T17:06:10Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [analysis, core]
---
# Proposal detection and state transition

Detect when analysis is complete and transition to Proposed state

## Design

- Detect completion via MessageComplete + idle status
- Extract proposal from agent output
- Save proposal to proposals table
- Transition to Proposed state
- Update UI to show review actions

## Acceptance Criteria

- Detects when agent finishes analysis
- Extracts and saves proposal
- State transitions to Proposed
- UI shows approve/reject/changes options

