---
id: gla-ruxi
status: open
deps: [gla-brhx]
links: []
created: 2026-01-30T17:05:27Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [opencode, streaming]
---
# OpenCode SSE event stream handling

Implement SSE event stream subscription and parsing for OpenCode sessions

## Design

- SessionEvent tagged enum: MessageDelta, MessageComplete, StatusChanged, ToolStart, ToolComplete, Error
- parseSessionEvent() to convert raw SSE to typed events
- Scoped event stream with automatic cleanup
- Filter events by session ID
- Completion detection: MessageComplete + StatusChanged to 'idle'
- PubSub for broadcasting to multiple subscribers
- Reconnection logic for dropped connections

## Acceptance Criteria

- Can subscribe to session events
- Events correctly parsed and typed
- Stream cleans up on scope close
- Detects when agent is waiting for input

