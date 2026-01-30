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

