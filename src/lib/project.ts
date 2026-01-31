/**
 * @fileoverview ProjectPath service for managing project context throughout the application.
 *
 * Provides the absolute path of the project being managed by Glass, which is used
 * for computing database locations, git worktree paths, and other project-specific resources.
 */

import * as Crypto from "node:crypto";
import * as Os from "node:os";
import * as Path from "node:path";
import { Context, Effect } from "effect";

/**
 * Service tag for the project path.
 * Provides the absolute path to the project being managed.
 */
export class ProjectPath extends Context.Tag("glass/ProjectPath")<ProjectPath, string>() {}

/**
 * Computes a short hash of the project path for use in database directory names.
 * Returns the first 12 characters of the SHA256 hash.
 *
 * @param projectPath - Absolute path to the project
 * @returns 12-character hex string
 */
export const computeProjectHash = (projectPath: string): string => {
	const hash = Crypto.createHash("sha256");
	hash.update(projectPath);
	return hash.digest("hex").slice(0, 12);
};

/**
 * Computes the database directory path for a given project.
 * Format: ~/.local/share/glass/<project-hash>/
 *
 * @param projectPath - Absolute path to the project
 * @returns Absolute path to the database directory
 */
export const getDatabaseDirectory = (projectPath: string): string => {
	const hash = computeProjectHash(projectPath);
	return Path.join(Os.homedir(), ".local", "share", "glass", hash);
};

/**
 * Computes the database file path for a given project.
 * Format: ~/.local/share/glass/<project-hash>/glass.db
 *
 * @param projectPath - Absolute path to the project
 * @returns Absolute path to the database file
 */
export const getDatabasePath = (projectPath: string): string => {
	return Path.join(getDatabaseDirectory(projectPath), "glass.db");
};

/**
 * Effect that retrieves the database path from the ProjectPath service.
 */
export const databasePath: Effect.Effect<string, never, ProjectPath> = Effect.map(
	ProjectPath,
	getDatabasePath,
);

/**
 * Effect that retrieves the database directory from the ProjectPath service.
 */
export const databaseDirectory: Effect.Effect<string, never, ProjectPath> = Effect.map(
	ProjectPath,
	getDatabaseDirectory,
);

/**
 * Computes the logs directory path for a given project.
 * Format: ~/.local/share/glass/<project-hash>/logs/
 *
 * @param projectPath - Absolute path to the project
 * @returns Absolute path to the logs directory
 */
export const getLogsDirectory = (projectPath: string): string => {
	return Path.join(getDatabaseDirectory(projectPath), "logs");
};

/**
 * Computes the log file path for a given project.
 * Format: ~/.local/share/glass/<project-hash>/logs/glass.log
 *
 * @param projectPath - Absolute path to the project
 * @returns Absolute path to the log file
 */
export const getLogFilePath = (projectPath: string): string => {
	return Path.join(getLogsDirectory(projectPath), "glass.log");
};

/**
 * Effect that retrieves the logs directory from the ProjectPath service.
 */
export const logsDirectory: Effect.Effect<string, never, ProjectPath> = Effect.map(
	ProjectPath,
	getLogsDirectory,
);

/**
 * Effect that retrieves the log file path from the ProjectPath service.
 */
export const logFilePath: Effect.Effect<string, never, ProjectPath> = Effect.map(
	ProjectPath,
	getLogFilePath,
);
