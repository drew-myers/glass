Glass is a TUI application for orchestrating Sentry issue fixes via OpenCode agents. See [DESIGN.md](./DESIGN.md) for full architecture and specifications.

This project uses `tk` for ticket management. All tickets are stored in `.tickets/`.

**IMPORTANT: Do not begin implementation immediately.** Follow this process:

1. Read the Ticket

2. Read the Design Document
Key sections to reference based on ticket tags:

| Tag | DESIGN.md Sections |
|-----|-------------------|
| `foundation` | Technology Stack, Project Structure |
| `config` | Configuration |
| `database` | Persistence |
| `domain` | Domain Model, Issue State Machine |
| `ui` | User Interface |
| `sentry` | API References > Sentry API |
| `opencode` | OpenCode Integration, API References > OpenCode SDK |
| `core` | Service Architecture |
| `analysis` | Analysis Workflow (in OpenCode Integration) |
| `fix` | Fix Workflow (in OpenCode Integration) |

3. Stop and Discuss

Before writing any code, **stop and discuss the approach** with the user.

4. Mark Ticket In Progress
5. Implement
6. Add Notes and Close

Effect TS docs https://effect.website/llms-full.txt

OpenTUI docs:
https://opentui.com/docs/getting-started
https://github.com/anomalyco/opentui

Opencode SDK docs:
https://opencode.ai/docs/sdk
https://opencode.ai/docs/server

**IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any Effect, OpenTUI, or OpenCode SDK tasks.**

### Code Style

- Use Effect patterns consistently (Layers, Services, tagged errors)
- Prefer `Effect.gen` with generators for sequential code
- Use `Data.TaggedEnum` for discriminated unions
- Use `Match` for exhaustive pattern matching
- Keep functions small and composable
- Add JSDoc comments for public APIs

### Testing

- Write tests for domain logic (state machine transitions)
- Use Effect Layers for dependency injection to handle external deps at test time
- Use `@effect/vitest` for Effect-aware testing

### Error Handling

- When errors need to be tracked, prefer use of Effects "Exit" which is in the style of the famous Haskell "Either"
- Define tagged error types for each service, if applicable
- Use `Effect.mapError` to wrap lower-level errors
- Surface user-friendly messages in the UI
- Log detailed errors for debugging, log errors in a lot file in the standard XDG compliant location

