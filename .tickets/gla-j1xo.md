---
id: gla-j1xo
status: closed
deps: [gla-fvc3, gla-jw8k, gla-nmfm, gla-htpw]
links: []
created: 2026-01-30T17:05:06Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, sentry]
---
# Issue list screen

Implement the issue list screen showing Sentry issues with status indicators

## Design

- Columns: Status icon, Issue title, Event count, Last seen
- Status icons: ○ pending, ◐ analyzing/fixing, ◉ proposed, ● fixed, ✗ error
- Color coding per status (see DESIGN.md)
- Vim-style navigation (j/k, g/G)
- Selected row highlighting
- Header with org/project/team info
- Footer with keybind hints
- Fetch issues from Sentry on boot and on 'r' key

## Acceptance Criteria

- Displays issues from Sentry
- Status icons and colors match state
- Navigation works smoothly
- Refresh fetches new data
- Handles empty state gracefully

## Notes

**2026-01-30 - Implementation Complete**

### Files Created

- `src/lib/time.ts` - Relative time formatting (`formatRelativeTime`, `formatRelativeTimeShort`)
- `src/ui/screens/list.ts` - Issue list screen component with:
  - `IssueList` - Main list component with windowed scrolling
  - `IssueRow` - Single row with status icon, title, event count, last seen
  - `ListHeader` - Column headers
  - `LoadingIndicator` - Animated spinner during fetch
  - `ErrorBanner` - Error display with stale data fallback
  - `EmptyState` - "No issues loaded" message
  - `calculateWindowStart` - Sliding window calculation for scroll
- `test/lib/time.test.ts` - 28 tests for time formatting
- `test/ui/screens/list.test.ts` - 24 tests for list component

### Files Modified

- `src/ui/app.ts` - Extended AppState with:
  - `issues`, `selectedIndex`, `windowStart` for list state
  - `isLoading`, `spinnerFrame`, `error` for async state
  - New actions: `SetIssues`, `SetLoading`, `SetError`, `MoveSelection`, `JumpSelection`, `OpenSelected`, `TickSpinner`
  - Navigation keybind handlers (j/k/↑/↓, g/G, Enter)
  - Spinner animation interval
  - Refactored to `createApp` + `runAppLoop` pattern
- `src/main.ts` - Full wiring of all services:
  - Config, Database, SentryService layers
  - Initial refresh on startup
  - 'r' key triggers refresh
  - Graceful config error handling
- `src/lib/effect-opentui.ts` - Updated `withRenderer` signature for generic service requirements
- `test/ui/app.test.ts` - Updated to test new state fields and actions (34 tests)

### Architecture Decisions

1. **Windowed scrolling** - Instead of using ScrollBoxRenderable, implemented a simpler sliding window approach:
   - Track `selectedIndex` and `windowStart` in state
   - `calculateWindowStart` ensures selection stays visible
   - Only render visible items from `issues.slice(windowStart, windowStart + visibleCount)`

2. **Lazygit-style selection** - Highlighted row uses `backgroundColor: colors.bgHighlight` instead of marker characters

3. **Sync-then-display** - Refresh flow: Sentry API → upsert to DB → read all from DB → display
   - Ensures persistence survives restarts
   - Shows stale data with error banner on fetch failure

4. **Service capture pattern** - In main.ts, services are captured via `yield*` and passed to refresh callback via `Effect.provideService`

5. **Spinner animation** - Uses braille characters (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) with 80ms interval (~12fps)

### Keybinds Implemented

| Key | Action |
|-----|--------|
| j / ↓ | Move selection down |
| k / ↑ | Move selection up |
| g | Jump to top |
| G | Jump to bottom |
| Enter | Open selected issue (navigate to detail) |
| r | Refresh issues from Sentry |
| q | Quit (or back on detail screen) |

### Acceptance Criteria Verification

- [x] Displays issues from Sentry - via SentryService.listIssues() on startup and 'r'
- [x] Status icons and colors match state - using theme.getStatusIcon/getStatusColor
- [x] Navigation works smoothly - j/k/g/G with window sliding
- [x] Refresh fetches new data - 'r' key triggers full refresh cycle
- [x] Handles empty state gracefully - EmptyState component with "Press 'r' to refresh"

All 300 tests pass, typecheck clean, biome lint/format clean.

