/**
 * @fileoverview Database module for Glass.
 *
 * Exports the combined database layer and all repository services.
 * Use DatabaseLive to get a fully configured database with migrations run.
 *
 * @example
 * ```typescript
 * import { DatabaseLive, SentryIssueRepository, ConversationRepository } from "./db/index.js"
 * import { ProjectPath } from "./lib/project.js"
 * import { BunContext } from "@effect/platform-bun"
 *
 * const program = Effect.gen(function* () {
 *   const issueRepo = yield* SentryIssueRepository
 *   const issues = yield* issueRepo.listAll()
 *   // ...
 * })
 *
 * const ProjectPathLive = Layer.succeed(ProjectPath, "/path/to/project")
 *
 * pipe(
 *   program,
 *   Effect.provide(DatabaseLive),
 *   Effect.provide(ProjectPathLive),
 *   Effect.provide(BunContext.layer),
 *   BunRuntime.runMain
 * )
 * ```
 */

import type { SqlClient } from "@effect/sql";
import { Layer } from "effect";
import { SqliteLive, SqliteTestLive } from "./client.js";
import { MigratorLive } from "./migrations.js";
import {
	ConversationRepository,
	ConversationRepositoryLive,
	type ConversationRepositoryService,
} from "./repositories/conversations.js";
import {
	SentryIssueRepository,
	SentryIssueRepositoryLive,
	type SentryIssueRepositoryService,
} from "./repositories/issues.js";

// Re-export all public types and services
export {
	ConversationRepository,
	type ConversationRepositoryService,
	SentryIssueRepository,
	type SentryIssueRepositoryService,
};
export type { IssueStatus, UpsertSentryIssue } from "./repositories/issues.js";
export { getStatusFromState } from "./repositories/issues.js";
export { DbError, DbNotFoundError } from "./errors.js";
export { runMigrations } from "./migrations.js";
export { SqliteLive, SqliteTestLive } from "./client.js";
export { MigratorLive } from "./migrations.js";

// =============================================================================
// Combined Layers
// =============================================================================

/**
 * Layer that provides both repositories.
 * Requires SqlClient to be provided.
 */
export const RepositoriesLive: Layer.Layer<
	SentryIssueRepository | ConversationRepository,
	never,
	SqlClient.SqlClient
> = Layer.mergeAll(SentryIssueRepositoryLive, ConversationRepositoryLive);

/**
 * Full database layer for production use.
 * Provides both repositories with SQLite client and migrations.
 *
 * Dependencies:
 * - ProjectPath: The absolute path to the project being managed
 * - FileSystem: For creating database directory and running migrations
 * - Path: For path manipulation in migrations
 * - CommandExecutor: Required by migrations
 *
 * Usage:
 * ```typescript
 * const MainLive = DatabaseLive.pipe(
 *   Layer.provide(Layer.succeed(ProjectPath, projectPath)),
 *   Layer.provide(BunContext.layer),
 * )
 * ```
 */
export const DatabaseLive = RepositoriesLive.pipe(
	Layer.provideMerge(MigratorLive),
	Layer.provideMerge(SqliteLive),
);

/**
 * Test database layer using in-memory SQLite.
 * Provides real SQLite behavior but data is not persisted between runs.
 * Each test can get a fresh database by building a new layer.
 *
 * Dependencies:
 * - CommandExecutor: Required by migrations
 * - FileSystem: Required by migrations
 * - Path: Required by migrations
 *
 * Usage in tests:
 * ```typescript
 * import { it } from "@effect/vitest"
 * import { BunContext } from "@effect/platform-bun"
 *
 * const TestLayer = DatabaseTestLive.pipe(
 *   Layer.provide(BunContext.layer),
 * )
 *
 * it.effect("should insert issue", () =>
 *   Effect.gen(function* () {
 *     const repo = yield* SentryIssueRepository
 *     // test with real SQLite behavior
 *   }).pipe(Effect.provide(TestLayer))
 * )
 * ```
 */
export const DatabaseTestLive = RepositoriesLive.pipe(
	Layer.provideMerge(MigratorLive),
	Layer.provideMerge(SqliteTestLive),
);
