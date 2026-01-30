---
id: gla-jw8k
status: closed
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

**2026-01-30T16:12:00Z**

## Implementation Complete

### Files Created
- `src/services/sentry/errors.ts` - Tagged error union (AuthError, NotFoundError, RateLimitError, NetworkError, ApiError)
- `src/services/sentry/types.ts` - Effect Schemas for Sentry API responses including stacktrace, breadcrumbs, exceptions
- `src/services/sentry/client.ts` - SentryService with listIssues, getIssue, getLatestEvent methods
- `src/services/sentry/index.ts` - Module re-exports
- `src/db/migrations/0002_sentry_event_fields.ts` - Migration for new columns (environment, release, tags, exceptions, breadcrumbs)
- `test/services/sentry/client.test.ts` - Tests for pagination helpers and error types

### Files Modified
- `src/config/schema.ts` - Changed from `sentry` to `sources.sentry` with Option wrapper
- `src/config/index.ts` - Added new exports (hasSentrySource, getSentryConfig)
- `src/domain/issue.ts` - Expanded SentrySourceData with Stacktrace, StackFrame, Breadcrumb, ExceptionValue types
- `src/db/repositories/issues.ts` - Handle new fields in upsert/read operations
- `src/db/migrations.ts` - Registered new migration
- `test/config/loader.test.ts` - Updated TOML fixtures to use `[sources.sentry]` format

### Key Design Decisions
1. Config uses `[sources.sentry]` structure with Option wrapper for future multi-source support
2. Default query: `is:unresolved assigned:#${team}` 
3. Pagination: Fetches all pages automatically via Link header parsing (max 10 pages safety limit)
4. Rate limiting: Returns SentryRateLimitError with retry-after info, caller decides retry strategy
5. Database: Structured columns for environment/release, JSON for tags/exceptions/breadcrumbs
6. `listIssues` returns basic data; `getLatestEvent` fetches full stacktrace/breadcrumbs on demand

### API
```typescript
interface SentryServiceImpl {
  listIssues(options?: ListIssuesOptions): Effect<IssueSource[], SentryError>
  getIssue(issueId: string): Effect<IssueSource, SentryError>
  getLatestEvent(issueId: string): Effect<SentryEventData, SentryError>
}
```

All 194 tests pass, typecheck clean, biome check clean.
