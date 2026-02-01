---
id: gla-j8ic
status: open
deps: [gla-xdb9, gla-q6u1]
links: [docs/RFC-001-pi-sdk-migration.md]
created: 2026-01-30T17:07:01Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [startup, persistence]
---
# Startup session restoration

Restore Pi agent sessions and validate worktrees on Glass restart.

## Design

With Pi SDK, session restoration is simpler than SSE reconnection:

- Pi sessions persist as JSONL files via `SessionManager`
- On startup, load issues in active states from DB
- For each active issue:
  - Load the Pi session from disk via `SessionManager.open(sessionPath)`
  - Validate worktree still exists (for InProgress/PendingReview)
  - Re-subscribe to session events
  - Mark as Error if session file missing or worktree gone
- Detect orphaned worktrees (exist on disk but not in DB)

## Key Differences from SSE Approach

| Before (OpenCode SSE) | After (Pi SDK) |
|----------------------|----------------|
| Check if server process alive | N/A - no external process |
| Reconnect SSE stream | Just re-subscribe to session events |
| Session may be lost if server died | Session always on disk |

## Acceptance Criteria

- Sessions restored from disk on startup
- Events re-subscribed for active sessions
- Missing session files → Error state
- Missing worktrees → Error state  
- Orphaned worktrees warned about
