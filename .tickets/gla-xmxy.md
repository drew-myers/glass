---
id: gla-xmxy
status: open
deps: [gla-zrqi]
links: [docs/RFC-001-pi-sdk-migration.md]
created: 2026-01-30T19:13:11Z
type: task
priority: 2
assignee: Drew Myers
parent: gla-uyi9
tags: [config, foundation]
---
# Refactor config structure

Refactor the configuration schema for:
1. Multiple issue sources under `[sources]` section
2. Agent config with Pi SDK model format

## Design

### Sources Section
- Move `[sentry]` to `[sources.sentry]` with 'enabled' flag
- Add optional `[sources.github]` and `[sources.ticket]` sections
- At least one source must be enabled

### Agent Section (RFC-001)
- Rename `[opencode]` to `[agent]`
- New model format: `provider/model` or `provider/model@thinking`
- Thinking levels: off, minimal, low, medium, high, xhigh

```toml
[agent]
# Format: "provider/model" or "provider/model@thinking"
analyze_model = "anthropic/claude-opus-4-5"
fix_model = "openai/gpt-5.2@xhigh"
```

## Updated Schema

```toml
[sources.sentry]
enabled = true
organization = "my-org"
project = "my-project"
team = "my-team"
auth_token = "${SENTRY_AUTH_TOKEN}"
region = "us"

[agent]
analyze_model = "anthropic/claude-sonnet-4-20250514"
fix_model = "anthropic/claude-sonnet-4-20250514@medium"

[worktree]
create_command = "git worktree add {path} -b {branch}"
parent_directory = "../glass-worktrees"

[display]
page_size = 50
```

## Acceptance Criteria

- Config loads with `[sources.sentry]` format
- At least one source must be enabled
- `[agent]` section replaces `[opencode]`
- Model format supports `@thinking` suffix
- Tests updated for new format
- Example config updated


## Notes

**2026-01-30T19:13:22Z**

## Context

This ticket was created during gla-htpw (Domain model) when we added the IssueSource abstraction.

**2026-02-01**: Updated to include `[agent]` config changes from RFC-001 (Pi SDK migration).

**2026-02-01T16:31:35Z**

Update these files as part of config rename:
- src/config/schema.ts: Rename OpenCodeConfigSchema → AgentConfigSchema
- src/config/index.ts: Update export
- test/config/loader.test.ts: Update all opencode references to agent
- test/services/sentry/fixtures.ts: Update fixture
