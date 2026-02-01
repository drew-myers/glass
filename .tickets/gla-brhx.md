---
id: gla-brhx
status: closed
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

**2026-02-01T16:45:00Z - Implementation Complete**

### Files Created

- `src/services/agent/errors.ts` - Tagged error types (AgentError, SessionNotFoundError, InvalidModelError)
- `src/services/agent/types.ts` - AgentSessionHandle, AgentEventListener, ParsedModel types
- `src/services/agent/service.ts` - AgentService Effect Layer implementation
- `src/services/agent/index.ts` - Barrel exports
- `test/services/agent/errors.test.ts` - Error type tests

### Files Modified

- `package.json` - Replaced `@opencode-ai/sdk` with `@mariozechner/pi-coding-agent` and `@mariozechner/pi-ai`

### Files Removed

- `src/services/opencode/` directory (was placeholder with only .gitkeep)

### Implementation Details

1. **AgentServiceLive Layer**: Takes `projectPath` parameter and depends on `Config` service
   - Creates shared `AuthStorage` and `ModelRegistry` instances (reused across sessions)
   - Creates shared `SettingsManager` with auto-compaction disabled (Glass manages state)
   - Tracks sessions in `Ref<HashMap<string, AgentSessionHandle>>`

2. **Session Creation**:
   - Parses model string format `"provider/model"` or `"provider/model@thinking"`
   - Uses `modelRegistry.find()` to look up models (supports custom models.json)
   - Creates tools via `createReadOnlyTools(cwd)` or `createCodingTools(cwd)`
   - Uses `SessionManager.inMemory()` for Pi SDK session management

3. **Session Handle**:
   - Wraps Pi SDK `AgentSession` with Effect-based methods
   - `prompt()` returns `Effect<void, AgentError>`
   - `subscribe()` passes through to Pi SDK (returns unsubscribe function)
   - `abort()` returns `Effect<void, AgentError>`
   - Includes `type` field ("analysis" | "fix")

4. **Model String Parsing**:
   - Temporary local implementation (TODO: replace with shared utility from config ticket)
   - Supports thinking level suffix: `@off`, `@minimal`, `@low`, `@medium`, `@high`, `@xhigh`
   - Defaults to "off" if not specified

5. **Disposal**:
   - `disposeSession()` is idempotent (no-op if session not found)
   - `disposeAll()` logs warnings for individual dispose failures but continues

### Testing

- All 285 tests pass
- Added 4 new tests for error types
- Service integration tests deferred (would require mocking Pi SDK)

### Dependencies

The config still uses `opencode` section name (e.g., `config.opencode.analyzeModel`). This will be updated when the config schema ticket is completed.
