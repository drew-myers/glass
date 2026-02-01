---
id: gla-hn1v
status: closed
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

**2026-02-01T23:02:37Z**

Implemented async refresh flow:

**API Client changes (tui/src/api/mod.rs):**
- Added `refresh_issues()` method that calls `POST /api/v1/issues/refresh`

**App state changes (tui/src/app.rs):**
- Added `BackgroundMessage` enum for async task results
- Added mpsc channel (bg_tx/bg_rx) for background task communication
- Added `is_refreshing` flag for background refresh state
- Changed `client` to `Arc<ApiClient>` for sharing across tasks
- Added `load_cached()` for initial fast load via `GET /issues`
- Added `start_refresh()` that spawns background task calling `POST /issues/refresh`
- Added `poll_background()` to check for task completions (called from main loop)

**Main loop changes (tui/src/main.rs):**
- On startup: `load_cached()` then `start_refresh()` (fast initial display, async refresh)
- Added `poll_background()` call in main loop
- Changed 'r' key to call `start_refresh()` (non-blocking)

**UI changes (tui/src/ui/list.rs):**
- Updated title spinner to show during `is_refreshing` as well as `is_loading`

All TUI tests pass (8/8).
