---
id: gla-cu9p
status: open
deps: []
links: []
created: 2026-01-30T17:04:15Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [foundation, setup]
---
# Project scaffolding and tooling setup

Initialize the Glass project with bun, typescript, and all dependencies

## Design

- package.json with all deps (effect, @effect/platform-bun, @effect/sql-sqlite-bun, @opentui/core, @opencode-ai/sdk, @iarna/toml)
- tsconfig.json configured for bun + effect
- Basic src/ directory structure as defined in DESIGN.md
- .gitignore for node_modules, .glass/, etc.

## Acceptance Criteria

- bun install succeeds
- bun run typecheck passes
- Basic src/main.ts exists and runs

