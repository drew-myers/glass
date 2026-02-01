---
id: gla-0t1h
status: closed
deps: []
links: []
created: 2026-02-01T22:02:52Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [server, api]
---
# Server: Refresh issues endpoint

POST /issues/refresh - fetches from Sentry, upserts to DB


## Notes

**2026-02-01T22:16:36Z**

Implemented POST /issues/refresh endpoint:

- Added refreshIssuesHandler in server/src/api/handlers/issues.ts
- Wired up route in server/src/api/routes.ts
- Handler fetches issues from Sentry via SentryService.listIssues()
- Upserts each issue to DB via SentryIssueRepository.upsert()
- Tracks created vs updated by checking existence before upsert
- Returns { fetched, created, updated } per RFC-002 spec
- Returns 502 with SENTRY_ERROR code on Sentry API failures

**2026-02-01T22:23:44Z**

Added tests in server/test/api/handlers/issues.test.ts:
- stores no issues when Sentry returns empty list
- creates new issues from Sentry  
- updates existing issues with new data
- preserves issue state when updating
- returns error response on Sentry API failure
- returns error response on Sentry auth failure

All 185 tests pass.
