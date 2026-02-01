---
id: gla-ruxi
status: open
deps: [gla-brhx]
links: [docs/RFC-001-pi-sdk-migration.md]
created: 2026-01-30T17:05:27Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [agent, streaming]
---
# Pi session event handling

Implement event subscription and mapping for Pi SDK agent sessions.

## Design

Pi SDK provides events via `session.subscribe()` callback. This ticket covers:

- Map Pi events to Glass domain events (IssueEvent)
- Completion detection via `agent_end` event
- Stream text deltas for UI display
- Track tool executions for visibility

## Event Mapping

| Pi SDK Event | Glass Event |
|--------------|-------------|
| `message_update` + `text_delta` | `IssueEvent.AgentMessage` |
| `message_update` + `thinking_delta` | `IssueEvent.AgentThinking` (optional) |
| `agent_end` | `IssueEvent.AgentComplete` |
| `tool_execution_start` | `IssueEvent.ToolStart` (optional) |
| `tool_execution_end` | `IssueEvent.ToolComplete` (optional) |

## Implementation

```typescript
const subscribeToSession = (
  session: AgentSession,
  issueId: string,
  publish: (event: IssueEvent) => void
) => {
  return session.subscribe((event) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          publish(IssueEvent.AgentMessage({
            issueId,
            sessionId: session.sessionId,
            content: event.assistantMessageEvent.delta,
          }));
        }
        break;
      case "agent_end":
        publish(IssueEvent.AgentComplete({
          issueId,
          sessionId: session.sessionId,
        }));
        break;
    }
  });
};
```

## Acceptance Criteria

- Text deltas forwarded to UI in real-time
- Agent completion detected reliably
- Unsubscribe cleans up properly
- No reconnection logic needed (in-process)
