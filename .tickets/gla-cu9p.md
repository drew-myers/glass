---
id: gla-cu9p
status: closed
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

## Notes

Completed 2026-01-30.

### Files Created

- `package.json` - Dependencies with aligned Effect ecosystem versions (v3.19/0.94/0.87/0.49/0.50)
- `tsconfig.json` - Strict TypeScript config for Bun + Effect
- `biome.json` - Linter/formatter config (tabs, 100 line width)
- `.gitignore` - Standard ignores (node_modules, .glass/, etc.)
- `src/main.ts` - Effect-based hello world using BunRuntime
- `test/setup.test.ts` - Dummy test with @effect/vitest

### Directory Structure

```
src/
├── main.ts
├── config/
├── db/repositories/
├── domain/
├── services/{sentry,opencode,git}/
├── ui/{screens,components}/
└── lib/
test/
└── setup.test.ts
```

### Scripts Available

- `bun run dev` - Run the application
- `bun run typecheck` - TypeScript type checking
- `bun run test` - Run tests with vitest
- `bun run lint` - Lint with biome
- `bun run format` - Format with biome
- `bun run check` - Lint + format with biome

