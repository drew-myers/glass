---
id: gla-ugvq
status: open
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
