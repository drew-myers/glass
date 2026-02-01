Glass is an issue orchestration system for fixing Sentry issues via coding agents.

## Architecture (RFC-002)

**Two-component design:**
- `server/` - TypeScript + Effect + Bun REST API backend
- `tui/` - Rust + Ratatui terminal UI

See [RFC-002](docs/RFC-002-architecture-redesign.md) for full architecture and API spec.
See [RFC-001](docs/RFC-001-pi-sdk-migration.md) for Pi SDK integration details.

**Key insight:** Agent interaction is headless by default. The TUI triggers analysis/implementation via REST, Pi runs in background. For interactive sessions, escape hatch shells out to `pi --session <path>`.

## Project Structure

```
glass/
├── server/           # TypeScript backend
│   ├── src/
│   │   ├── api/      # REST handlers
│   │   ├── config/   # TOML config loading
│   │   ├── db/       # SQLite + repositories
│   │   ├── domain/   # Issue types, state machine
│   │   ├── services/ # Sentry client, agent service
│   │   └── main.ts   # Server entry
│   └── test/
├── tui/              # Rust frontend
│   ├── src/
│   │   ├── api/      # HTTP client, types
│   │   ├── ui/       # Ratatui views
│   │   ├── app.rs    # App state
│   │   ├── server.rs # Server lifecycle
│   │   └── main.rs   # TUI entry
│   └── tests/
├── docs/
│   ├── RFC-001-pi-sdk-migration.md
│   └── RFC-002-architecture-redesign.md
└── justfile          # Build/dev commands
```

## Development

```bash
just dev      # Run server + TUI together
just server   # Server only
just tui      # TUI only (needs server running)
just test     # Run all tests
just dist     # Build distribution binaries
```

## Ticket Management

Uses `tk` for tickets (`tk --help`). Tickets in `.tickets/`.

```bash
tk list           # All open tickets
tk ready          # Tickets with no blockers
tk blocked        # Tickets waiting on dependencies
tk show <id>      # View ticket details
```

**IMPORTANT: Do not begin implementation immediately.** Follow this process:
1. Read the ticket (`tk show <id>`)
2. Read relevant docs (RFC-002 for architecture, RFC-001 for agent integration)
3. **Stop and discuss approach** with user before coding
4. `tk start <id>` when beginning work
5. Implement
6. `tk add-note <id>` with summary, then `tk close <id>`

## Code Style

### Server (TypeScript + Effect)

- Use Effect patterns: Layers, Services, tagged errors
- Prefer `Effect.gen` with generators for sequential code
- Use `Data.TaggedEnum` for discriminated unions
- Use `Match` for exhaustive pattern matching
- Use `@effect/vitest` for testing

### TUI (Rust)

- Standard Rust idioms
- `anyhow` for error handling in main
- `thiserror` for library errors if needed
- Serde for JSON deserialization (test with fixtures)

## Key Docs

| Topic | Document |
|-------|----------|
| Architecture & API | [RFC-002](docs/RFC-002-architecture-redesign.md) |
| Pi SDK integration | [RFC-001](docs/RFC-001-pi-sdk-migration.md) |
| Effect patterns | https://effect.website/llms-full.txt |
| Pi SDK | https://raw.githubusercontent.com/badlogic/pi-mono/refs/heads/main/packages/coding-agent/docs/sdk.md |
| Ratatui | https://ratatui.rs/introduction/ |

**Prefer retrieval-led reasoning** - fetch docs before using unfamiliar APIs.
