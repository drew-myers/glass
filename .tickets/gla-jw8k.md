---
id: gla-jw8k
status: open
deps: [gla-zrqi]
links: []
created: 2026-01-30T17:04:58Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [sentry, api]
---
# Sentry API client service

Implement Sentry HTTP API client as an Effect service

## Design

- Use Effect HttpClient for requests
- SentryService interface with methods:
  - listTeamIssues(options) -> Effect<Issue[], SentryError>
  - getIssue(id) -> Effect<IssueDetail, SentryError>
  - getLatestEvent(issueId) -> Effect<Event, SentryError>
- Support both US and DE regions
- Auth via Bearer token
- Rate limit handling
- Pagination support for issue list

## Acceptance Criteria

- Can fetch issues for org/project/team
- Can get issue details
- Can get latest event with full stacktrace
- Handles auth errors gracefully
- Respects rate limits


## Notes

**2026-01-30T19:12:37Z**

## Design Update: IssueSource Abstraction

The domain model now uses `IssueSource` tagged union. This ticket should:

1. Implement `SentrySourceData` interface from `src/domain/issue.ts`:
   - Extends `IssueSourceCommon` (title, shortId, firstSeen, lastSeen, count, userCount)
   - Adds Sentry-specific: culprit, metadata, stacktrace, breadcrumbs, environment, release, tags

2. Return data wrapped in `IssueSource.Sentry({ project, data })`:
   ```typescript
   IssueSource.Sentry({
     project: "my-project",
     data: { /* SentrySourceData */ }
   })
   ```

3. Generate composite IDs: `sentry:{sentry_issue_id}` (e.g., `sentry:12345`)

4. Config is now under `[sources.sentry]` section (see DESIGN.md Configuration)

See DESIGN.md Domain Model > Issue Source Abstraction for details.
