---
id: gla-ugvq
status: closed
deps: [gla-j1xo]
links: []
created: 2026-01-30T17:05:13Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [ui, sentry]
---
# Issue detail screen - Sentry pane

Implement the left pane of the detail screen showing Sentry issue data

## Design

- Split-pane layout (left: Sentry, right: Agent)
- Sentry pane contents:
  - Error message and type
  - Full stacktrace with file/line info
  - Breadcrumbs
  - Tags (environment, release)
  - Event count and user impact
  - First/last seen timestamps
- Scrollable content
- Panel focus switching with Tab or h/l
- Back navigation with 'q' or left arrow

## Acceptance Criteria

- Shows full Sentry issue details
- Scrolling works
- Panel focus visually indicated
- Navigation back to list works


## Notes

**2026-01-30T19:12:50Z**

## Design Update: IssueSource Abstraction

This ticket now implements the **Sentry-specific** detail pane. The detail screen has a common header (Glass metadata) plus source-specific content.

1. The detail screen should match on `issue.source._tag` to render the appropriate pane:
   ```typescript
   Match.value(issue.source).pipe(
     Match.tag("Sentry", ({ data }) => <SentryDetailPane data={data} />),
     Match.tag("GitHub", ({ data }) => <GitHubDetailPane data={data} />),  // future
     Match.tag("Ticket", ({ data }) => <TicketDetailPane data={data} />),  // future
     Match.exhaustive,
   )
   ```

2. Use `getSourceCommon(issue.source)` for the common header fields (title, shortId, counts, timestamps)

3. The Sentry pane shows source-specific data: stacktrace, breadcrumbs, culprit, metadata, tags, environment, release

See DESIGN.md Domain Model > Issue Source Abstraction for details.

## Blocking

- gla-4ia3 [open] Agent output display component

---

## Implementation Notes - 2026-01-30

### Files Created

- `src/ui/components/glass-section.tsx` - Common Glass metadata section (ID, status, timestamps)
- `src/ui/components/sentry-pane.tsx` - Sentry-specific content with sections:
  - ErrorSection: type, value, culprit
  - StacktraceSection: frames with file/line/function and context lines
  - BreadcrumbsSection: timestamped timeline of events
  - MetadataSection: environment, release, tags table
  - StatsSection: event count, user count, first/last seen
- `src/ui/screens/detail.tsx` - Split-pane detail screen (60/40 layout)
- `test/ui/components/glass-section.test.ts` - Tests for GlassSection helpers
- `test/ui/components/sentry-pane.test.ts` - Tests for SentryPane helpers

### Files Modified

- `src/ui/state.ts` - Added detail screen state:
  - `focusedPane: "left" | "agent"` signal
  - `leftPaneScrollOffset` signal
  - `switchPane()`, `scrollLeftPane()`, `resetDetailState()` actions
  - `openSelected()` now resets detail state
- `src/ui/app.tsx` - Wired up detail screen:
  - Imported and rendered `DetailScreen` component
  - Added keybind handlers: Tab (switch pane), j/k (scroll), Esc/q (back)
  - Context-sensitive action bar based on issue state
- `src/ui/keybinds.ts` - Updated detail screen keybinds to show j/k scroll hint

### Architecture Decisions

1. **60/40 split ratio** - Sentry pane gets 60% width for stacktrace display, Agent placeholder gets 40%
2. **Glass metadata as sibling** - Common Glass info (ID, status, timestamps) appears above source-specific content, not nested inside
3. **Simulated scroll** - Uses `marginTop={-scrollOffset}` with `overflow="hidden"` for scroll simulation (same as list screen windowing approach)
4. **Focus indication** - Focused pane has `borderFocus` color (#7aa2f7), unfocused has `border` color (#414868)
5. **Pattern matching** - Uses Effect's `Match.value().pipe(Match.tag())` for exhaustive source type handling

### Keybinds

| Key | Action |
|-----|--------|
| Esc / q | Back to list |
| Tab | Switch pane focus |
| h / l / arrows | Switch pane focus |
| j / k / arrows | Scroll left pane (when focused) |
| Ctrl+D/U | Page scroll (half page) |

State-specific keybinds appear based on issue state (Pending, PendingApproval, etc.)

### Acceptance Criteria Verification

- [x] Shows full Sentry issue details - All sections implemented (error, stacktrace, breadcrumbs, metadata, stats)
- [x] Scrolling works - j/k scrolls left pane, Ctrl+D/U for page scroll
- [x] Panel focus visually indicated - Border color changes on focus
- [x] Navigation back to list works - Esc or q returns to list

All 108 UI tests pass, typecheck clean, biome lint clean.

---

## Follow-up: Lazy Event Data Loading

The initial implementation only showed basic issue metadata (no stacktrace, breadcrumbs, etc.) because `listIssues()` API doesn't return event details.

### Additional Changes

**Files Modified:**
- `src/main.tsx` - Added `makeFetchEventDataEffect()` that:
  - Fetches full event data via `SentryService.getLatestEvent()`
  - Merges exceptions, breadcrumbs, environment, release, tags into existing issue
  - Updates database and app state
- `src/ui/state.ts` - Added `isDetailLoading` signal for loading state
- `src/ui/app.tsx` - Added `onOpenDetail` callback prop, triggers event fetch when opening detail
- `src/ui/screens/detail.tsx` - Shows "Loading event details..." while fetching

### Data Flow

1. User opens issue detail (Enter key)
2. UI immediately shows cached data from database
3. Background fetch of `getLatestEvent()` starts
4. When complete, database is updated with enriched data
5. UI re-renders with full stacktrace, breadcrumbs, etc.

This matches the list screen pattern of showing stale data while fetching fresh data.

All 111 UI tests pass, typecheck clean, biome lint clean.
