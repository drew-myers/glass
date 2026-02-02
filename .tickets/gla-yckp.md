---
id: gla-yckp
status: closed
deps: [gla-0t1h, gla-2bst]
links: []
created: 2026-02-01T22:02:55Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [server, api, agent]
---
# Server: Analyze issue endpoint

POST /issues/:id/analyze - runs headless Pi analysis, updates state


## Notes

**2026-02-02T01:14:20Z**

Implemented POST /api/v1/issues/:id/analyze endpoint:

**Changes:**
- `server/src/api/handlers/issues.ts`: Added `analyzeIssueHandler`
  - Validates issue exists and is in Pending or Error state (409 if not)
  - Creates analysis session via AgentService
  - Updates issue state to Analyzing
  - Builds prompt using `buildAnalysisPrompt()` 
  - Fires off agent.prompt() in background (non-blocking)
  - Returns { status: 'analyzing', sessionId } immediately
  - On agent error, updates issue state to Error

- `server/src/api/routes.ts`: Added route for POST /api/v1/issues/:id/analyze

- `server/src/main.ts`: Added AgentServiceLive to layer stack

**Tests added (5):**
- starts analysis for pending issue
- returns 404 for non-existent issue  
- returns 409 for issue in wrong state (e.g., already Analyzing)
- allows analysis from Error state (retry)
- returns 500 when agent service fails

All 237 tests pass.
