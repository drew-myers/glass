---
id: gla-jfww
status: closed
deps: [gla-4ia3]
links: []
created: 2026-01-30T17:05:40Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, agent]
---
# Agent input component

Implement the input field for responding to agent questions

## Design

- Input field at bottom of agent pane
- Only visible when agent is waiting for input
- Enter to send, Esc to cancel/unfocus
- Focus management (Enter from agent pane focuses input)
- OpenCode-style prompt aesthetic
- Persists user messages to conversation_messages table

## Acceptance Criteria

- Input appears when agent waiting
- Can type and send messages
- Messages persisted to DB
- Focus behavior works correctly


## Notes

**2026-02-01T22:03:38Z**

Obsolete: Architecture redesign uses escape hatch to pi CLI instead of embedded input.
