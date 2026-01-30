---
id: gla-xmxy
status: open
deps: [gla-zrqi]
links: []
created: 2026-01-30T19:13:11Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [config, foundation]
---
# Refactor config to sources section structure

Refactor the configuration schema to support multiple issue sources under a [sources] section. This replaces the top-level [sentry] with [sources.sentry] and adds support for future sources.

## Design

- Move [sentry] to [sources.sentry] with 'enabled' flag
- Add optional [sources.github] and [sources.ticket] sections
- Update GlassConfigSchema to use SourcesConfigSchema
- Update tests and example config
- Backward compatibility: support both old and new format during migration

## Acceptance Criteria

- Config loads with [sources.sentry] format
- At least one source must be enabled
- Old [sentry] format shows deprecation warning (optional)
- Tests updated for new format


## Notes

**2026-01-30T19:13:22Z**

## Context

This ticket was created during gla-htpw (Domain model) when we added the IssueSource abstraction.

The design now specifies config sources under `[sources.sentry]` instead of `[sentry]` to allow for multiple issue sources (GitHub, local tickets, etc.) in the future.

See DESIGN.md Configuration section for the new schema format.
