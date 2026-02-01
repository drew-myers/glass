/**
 * @fileoverview SQLite database client layer for Glass.
 *
 * Creates and manages the SQLite database connection, handling:
 * - Computing the database path from the project path
 * - Creating the database directory if it doesn't exist
 * - Initializing the SQLite client with WAL mode
 */

import { FileSystem, type Error as PlatformError } from "@effect/platform";
import type { SqlClient } from "@effect/sql";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { type ConfigError, Effect, Layer } from "effect";
import { ProjectPath, getDatabaseDirectory, getDatabasePath } from "../lib/project.js";

/**
 * Layer that creates the SQLite client for the Glass database.
 *
 * Dependencies:
 * - ProjectPath: The absolute path to the project being managed
 * - FileSystem: For creating the database directory
 *
 * The database is stored at ~/.local/share/glass/<project-hash>/glass.db
 * where project-hash is the first 12 characters of SHA256(projectPath).
 */
export const SqliteLive: Layer.Layer<
	SqliteClient.SqliteClient | SqlClient.SqlClient,
	ConfigError.ConfigError | PlatformError.PlatformError,
	ProjectPath | FileSystem.FileSystem
> = Layer.unwrapEffect(
	Effect.gen(function* () {
		const projectPath = yield* ProjectPath;
		const fs = yield* FileSystem.FileSystem;

		// Ensure database directory exists
		const dbDir = getDatabaseDirectory(projectPath);
		yield* fs.makeDirectory(dbDir, { recursive: true });

		// Get the database file path
		const dbPath = getDatabasePath(projectPath);

		yield* Effect.log(`Initializing database at ${dbPath}`);

		// Return the SqliteClient layer configured for this path
		// WAL mode is enabled by default in bun:sqlite for better concurrency
		return SqliteClient.layer({
			filename: dbPath,
		});
	}),
);

/**
 * Test layer that uses an in-memory SQLite database.
 * Useful for unit tests that don't need persistent storage.
 */
export const SqliteTestLive: Layer.Layer<
	SqliteClient.SqliteClient | SqlClient.SqlClient,
	ConfigError.ConfigError
> = SqliteClient.layer({
	filename: ":memory:",
});
