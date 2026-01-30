/**
 * @fileoverview Database migrations layer for Glass.
 *
 * Configures and runs database migrations using @effect/sql-sqlite-bun.
 * Migrations are loaded from the migrations directory and run in order.
 */

import type { CommandExecutor, FileSystem, Path } from "@effect/platform";
import type { SqlClient, SqlError } from "@effect/sql";
import type { Migrator } from "@effect/sql";
import { type SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect, type Layer } from "effect";

// Import migrations
import migration0001 from "./migrations/0001_initial_schema.js";
import migration0002 from "./migrations/0002_sentry_event_fields.js";

/**
 * Array of all migrations in order.
 * Each migration is a tuple of [id, name, load].
 * The load effect should return the migration effect.
 */
const migrations: Migrator.ResolvedMigration[] = [
	[1, "initial_schema", Effect.succeed(migration0001)],
	[2, "sentry_event_fields", Effect.succeed(migration0002)],
];

/**
 * Custom loader that returns migrations from the in-memory array.
 * This approach avoids filesystem dependencies at runtime and ensures
 * migrations are bundled with the application.
 */
const loader: Migrator.Loader = Effect.succeed(migrations);

/**
 * Migrator layer that runs all pending migrations on startup.
 *
 * Dependencies:
 * - SqlClient: The database client to run migrations against
 * - SqliteClient: The SQLite-specific client
 * - CommandExecutor, FileSystem, Path: Platform dependencies
 *
 * This layer will:
 * 1. Create the migrations tracking table if it doesn't exist
 * 2. Run any migrations that haven't been applied yet
 * 3. Track which migrations have been applied
 */
export const MigratorLive: Layer.Layer<
	never,
	SqlError.SqlError | Migrator.MigrationError,
	| SqlClient.SqlClient
	| SqliteClient.SqliteClient
	| CommandExecutor.CommandExecutor
	| FileSystem.FileSystem
	| Path.Path
> = SqliteMigrator.layer({ loader });

/**
 * Effect that runs migrations manually.
 * Useful for testing or CLI commands that need to run migrations explicitly.
 */
export const runMigrations: Effect.Effect<
	ReadonlyArray<readonly [id: number, name: string]>,
	SqlError.SqlError | Migrator.MigrationError,
	| SqlClient.SqlClient
	| SqliteClient.SqliteClient
	| CommandExecutor.CommandExecutor
	| FileSystem.FileSystem
	| Path.Path
> = SqliteMigrator.run({ loader });
