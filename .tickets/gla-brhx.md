---
id: gla-brhx
status: open
deps: [gla-zrqi, gla-cu9p]
links: [docs/RFC-001-pi-sdk-migration.md]
created: 2026-01-30T17:05:20Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [agent, core]
---
# Pi AgentSession management

Implement AgentService for managing Pi SDK agent sessions in-process.

## Design

See RFC-001 for full architecture details.

- **No external servers** - agents run in-process via Pi SDK's `createAgentSession()`
- Analysis sessions: read-only tools (`createReadOnlyTools`), main project cwd
- Fix sessions: full coding tools (`createCodingTools`), worktree cwd
- Track active sessions in `Ref<HashMap<issueId, AgentSessionHandle>>`
- Session cleanup via `session.dispose()`
- Shared `AuthStorage` and `ModelRegistry` instances

## Interface

```typescript
interface AgentService {
  createAnalysisSession: () => Effect<AgentSessionHandle, AgentError>
  createFixSession: (worktreePath: string) => Effect<AgentSessionHandle, AgentError>
  getSession: (sessionId: string) => Effect<AgentSessionHandle | null, AgentError>
  disposeSession: (sessionId: string) => Effect<void, AgentError>
}

interface AgentSessionHandle {
  readonly sessionId: string
  readonly session: AgentSession  // From pi-coding-agent
  prompt: (message: string) => Effect<void, AgentError>
  subscribe: (listener: AgentEventListener) => () => void
  abort: () => Effect<void, AgentError>
}
```

## Acceptance Criteria

- Can create analysis sessions with read-only tools
- Can create fix sessions with full tools and worktree cwd
- Sessions tracked and retrievable by ID
- Sessions properly disposed on cleanup
- Shared auth/model registry across sessions

## Notes

**2026-02-01T16:31:39Z**

Update package.json:
- Remove @opencode-ai/sdk
- Add @mariozechner/pi-coding-agent
