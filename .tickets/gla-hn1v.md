---
id: gla-hn1v
status: open
deps: [gla-0t1h]
links: []
created: 2026-02-01T22:03:08Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [tui]
---
# TUI: Wire up refresh and detail fetch

r key calls refresh, Enter fetches detail before showing


## Notes

**2026-02-01T22:33:55Z**

Loading flow clarification:

On startup:
1. TUI calls GET /issues immediately → displays cached data from DB (fast, may be stale/empty)
2. TUI calls POST /issues/refresh in background → server fetches from Sentry
3. When refresh completes → TUI re-fetches GET /issues and updates the list

This way user sees something instantly, then it updates when fresh data arrives.

On 'r' key press:
- Same as steps 2-3 above (manual refresh)

**2026-02-01T22:35:14Z**

Update: POST /issues/refresh now returns the full issue list directly (same format as GET /issues), so TUI doesn't need to make a second call after refresh.
