# RFC-001: Migrate from OpenCode SDK to Pi SDK (In-Process Agent)

## Summary

Replace the OpenCode SDK (`@opencode-ai/sdk`) server-based architecture with Pi's SDK (`@mariozechner/pi-coding-agent`) for in-process agent execution. This eliminates external server process management while providing the same agent capabilities.

## Motivation

The current design requires Glass to:
1. Spawn and manage multiple OpenCode server processes
2. Allocate dynamic ports for each server
3. Handle SSE connections for event streaming
4. Implement reconnection logic on restart
5. Track external session IDs

Pi's SDK provides the same underlying agent capabilities but runs **in-process**, eliminating the server management complexity entirely.

## Design Changes

### Technology Stack Update

| Layer | Before | After |
|-------|--------|-------|
| Agent Interface | `@opencode-ai/sdk` (server client) | `@mariozechner/pi-coding-agent` (in-process SDK) |

### Architecture: Before

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GLASS APPLICATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    MAIN PROJECT OPENCODE SERVER                      │   │
│   │                      (shared, analysis only)                         │   │
│   │                          port: dynamic                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌──────────────────────┐  ┌──────────────────────┐                        │
│   │ WORKTREE SERVER #1   │  │ WORKTREE SERVER #2   │                        │
│   │ (fix mode, isolated) │  │ (fix mode, isolated) │                        │
│   │ port: dynamic        │  │ port: dynamic        │                        │
│   └──────────────────────┘  └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Architecture: After

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GLASS APPLICATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Pi AgentSession Pool                         │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                     │   │
│   │   ┌─────────────────┐                                               │   │
│   │   │ Analysis Session│  cwd: /project                                │   │
│   │   │ (read-only tools)│  tools: [read, grep, find, ls]               │   │
│   │   └─────────────────┘                                               │   │
│   │                                                                     │   │
│   │   ┌─────────────────┐  ┌─────────────────┐                          │   │
│   │   │  Fix Session #1 │  │  Fix Session #2 │                          │   │
│   │   │ cwd: /worktree1 │  │ cwd: /worktree2 │                          │   │
│   │   │ tools: [read,   │  │ tools: [read,   │                          │   │
│   │   │  bash,edit,write]│  │  bash,edit,write]│                          │   │
│   │   └─────────────────┘  └─────────────────┘                          │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Key differences:
- **No external processes** - all agent sessions run in Glass's process
- **No ports/networking** - direct function calls
- **Tool isolation by session** - analysis sessions get read-only tools, fix sessions get full tools
- **cwd per session** - each fix session operates in its worktree directory

### Service Interface Changes

#### Before: OpenCodeService

```typescript
interface OpenCodeService {
  startServer: (projectPath: string) => Effect<ServerInstance, OpenCodeError, Scope>
  createSession: (serverUrl: string) => Effect<Session, OpenCodeError>
  prompt: (sessionId: string, message: string) => Effect<void, OpenCodeError>
  subscribeEvents: () => Effect<Stream<SessionEvent, OpenCodeError>, OpenCodeError, Scope>
}
```

#### After: AgentService

```typescript
interface AgentService {
  // Create a new analysis session (read-only, main project cwd)
  createAnalysisSession: () => Effect<AgentSessionHandle, AgentError>
  
  // Create a new fix session (full tools, worktree cwd)
  createFixSession: (worktreePath: string) => Effect<AgentSessionHandle, AgentError>
  
  // Get existing session by ID
  getSession: (sessionId: string) => Effect<AgentSessionHandle | null, AgentError>
  
  // Dispose a session when done
  disposeSession: (sessionId: string) => Effect<void, AgentError>
}

interface AgentSessionHandle {
  readonly sessionId: string
  readonly session: AgentSession  // From pi-coding-agent
  
  // Send a prompt and wait for completion
  prompt: (message: string) => Effect<void, AgentError>
  
  // Subscribe to streaming events
  subscribe: (listener: AgentEventListener) => () => void
  
  // Abort current operation
  abort: () => Effect<void, AgentError>
}
```

### Session Creation Details

```typescript
import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  createReadOnlyTools,
  createCodingTools,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

// Analysis session: read-only tools, main project directory
const createAnalysisSession = (projectPath: string, model: string) => {
  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);
  
  return createAgentSession({
    cwd: projectPath,
    model: getModel("anthropic", model),
    tools: createReadOnlyTools(projectPath),  // [read, grep, find, ls]
    sessionManager: SessionManager.create(projectPath),
    authStorage,
    modelRegistry,
  });
};

// Fix session: full tools, worktree directory
const createFixSession = (worktreePath: string, model: string) => {
  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);
  
  return createAgentSession({
    cwd: worktreePath,
    model: getModel("anthropic", model),
    tools: createCodingTools(worktreePath),  // [read, bash, edit, write]
    sessionManager: SessionManager.create(worktreePath),
    authStorage,
    modelRegistry,
  });
};
```

### Event Mapping

| Pi SDK Event | Glass Event |
|--------------|-------------|
| `message_update` + `text_delta` | `AgentMessage` (streaming content) |
| `message_end` | Part of completion detection |
| `agent_end` | `AgentComplete` |
| `tool_execution_start/end` | Could surface as `ToolExecution` events |

```typescript
session.subscribe((event) => {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        // Stream content to UI
        publish(IssueEvent.AgentMessage({
          issueId,
          sessionId,
          content: event.assistantMessageEvent.delta,
        }));
      }
      break;
    
    case "agent_end":
      // Agent finished all work
      publish(IssueEvent.AgentComplete({ issueId, sessionId }));
      break;
  }
});
```

### State Machine: Session ID Semantics

Session IDs remain strings, but now reference Pi's session file paths (or in-memory session UUIDs) rather than OpenCode server session IDs.

```typescript
type IssueState = 
  | { _tag: "Pending" }
  | { _tag: "Analyzing"; sessionId: string }  // Pi session path/ID
  | { _tag: "PendingApproval"; sessionId: string; proposal: string }
  | { _tag: "InProgress"; 
      analysisSessionId: string;      // Pi session for analysis
      implementationSessionId: string; // Pi session for fix (different cwd)
      worktreePath: string; 
      worktreeBranch: string }
  // ... etc
```

### Persistence Changes

Pi's `SessionManager` handles session persistence natively:
- Sessions stored as JSONL files
- Tree structure with branching support
- Glass just needs to track the session file path

We may want to use `SessionManager.inMemory()` and handle our own persistence to SQLite for tighter integration. TBD.

### Configuration Changes

```toml
# Before
[opencode]
analyze_model = "anthropic/claude-sonnet-4-20250514"
fix_model = "anthropic/claude-sonnet-4-20250514"

# After
[agent]
# Format: "provider/model" or "provider/model@thinking"
# Thinking levels: off, minimal, low, medium, high, xhigh
analyze_model = "anthropic/claude-opus-4-5"           # No thinking specified = off
fix_model = "openai/gpt-5.2@xhigh"                    # With extended thinking
```

The `@thinking` suffix is optional. When omitted, defaults to `off`. Examples:
- `anthropic/claude-sonnet-4-20250514` → model with thinking off
- `anthropic/claude-opus-4-5@high` → model with high thinking
- `openai/o3@xhigh` → model with extended thinking

### Startup Sequence Changes

#### Before
1. Load config
2. Initialize database
3. Validate worktrees
4. **Start main OpenCode server for project** ← external process
5. **Reconnect any active sessions** ← SSE reconnection
6. Fetch issues
7. Start TUI

#### After
1. Load config
2. Initialize database
3. Validate worktrees
4. **Initialize AuthStorage and ModelRegistry** ← one-time setup
5. **Reload any active sessions from disk** ← just file I/O
6. Fetch issues
7. Start TUI

### Error Handling

| Scenario | Before | After |
|----------|--------|-------|
| Agent crashes | Server process dies, detect via SSE disconnect | Exception in prompt(), catch and surface |
| Network timeout | SSE connection timeout | N/A (no network) |
| Invalid API key | Server returns error | `AuthStorage` validation or model call fails |
| Model unavailable | Server returns error | `modelRegistry.getAvailable()` check |

### Dependencies

```json
{
  "dependencies": {
    // Remove
    "@opencode-ai/sdk": "latest",
    
    // Add
    "@mariozechner/pi-coding-agent": "latest"
  }
}
```

## Migration Steps

1. **Update DESIGN.md** - Replace OpenCode sections with Pi SDK architecture
2. **Update package.json** - Swap dependencies
3. **Implement AgentService** - New service using Pi SDK
4. **Update IssueLifecycleManager** - Use new AgentService
5. **Update event handling** - Map Pi events to Glass events
6. **Test** - Verify analysis and fix workflows

## Open Questions

1. **Session persistence strategy**: Use Pi's built-in `SessionManager` or roll our own with SQLite?
   - Pro Pi: Less code, proven implementation
   - Pro SQLite: Single source of truth, easier querying

2. **Custom tools**: Should we add Glass-specific tools?
   - `glass_signal_complete` - Agent signals it's done with a structured output
   - `glass_ask_question` - Agent asks user a structured question
   - Could help with completion detection and proposal parsing

3. **Shared AuthStorage**: One global instance or per-session?
   - Likely one global instance since API keys don't vary by session

4. ~~**Thinking levels**~~ - Resolved: thinking level is part of model config string via `@level` suffix

## References

- [Pi SDK Documentation](https://raw.githubusercontent.com/badlogic/pi-mono/refs/heads/main/packages/coding-agent/docs/sdk.md)
- [Pi README](https://raw.githubusercontent.com/badlogic/pi-mono/refs/heads/main/packages/coding-agent/README.md)
