/**
 * Configuration loading with TOML parsing and environment variable interpolation.
 *
 * Searches for config files in the following order:
 * 1. Explicit path (if provided via CLI)
 * 2. ./glass.toml (current working directory)
 * 3. ~/.config/glass/config.toml (XDG config location)
 *
 * @module
 */

import { FileSystem } from "@effect/platform";
import * as TOML from "@iarna/toml";
import { Context, Data, Effect, Layer, Schema } from "effect";
import { type GlassConfig, GlassConfigSchema } from "./schema.js";

// ----------------------------------------------------------------------------
// Error Types
// ----------------------------------------------------------------------------

/**
 * Tagged union of all configuration errors.
 */
export type ConfigError = Data.TaggedEnum<{
	/** No config file found in any of the searched locations */
	ConfigNotFound: { readonly searchedPaths: readonly string[] };
	/** Failed to read the config file from disk */
	ConfigReadError: { readonly path: string; readonly message: string };
	/** Failed to parse TOML syntax */
	ConfigParseError: { readonly path: string; readonly message: string };
	/** Schema validation failed */
	ConfigValidationError: { readonly path: string; readonly error: unknown };
	/** Environment variable referenced in config is not set */
	MissingEnvVar: { readonly varName: string; readonly path: string };
}>;

export const ConfigError = Data.taggedEnum<ConfigError>();

// ----------------------------------------------------------------------------
// Environment Variable Interpolation
// ----------------------------------------------------------------------------

/**
 * Pattern to match environment variable references: ${VAR_NAME}
 * Captures the variable name in group 1.
 */
const ENV_VAR_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Interpolates environment variables in a string.
 *
 * Replaces all occurrences of ${VAR_NAME} with the corresponding
 * environment variable value.
 *
 * @param content - The string containing potential env var references
 * @param path - The config file path (for error messages)
 * @returns Effect that resolves to the interpolated string
 */
export const interpolateEnvVars = (
	content: string,
	path: string,
): Effect.Effect<string, ConfigError> =>
	Effect.gen(function* () {
		const matches = content.matchAll(ENV_VAR_PATTERN);
		let result = content;

		for (const match of matches) {
			const fullMatch = match[0];
			const varName = match[1];

			if (varName === undefined) {
				continue;
			}

			const value = process.env[varName];

			if (value === undefined) {
				return yield* Effect.fail(ConfigError.MissingEnvVar({ varName, path }));
			}

			result = result.replace(fullMatch, value);
		}

		return result;
	});

// ----------------------------------------------------------------------------
// Config File Search
// ----------------------------------------------------------------------------

/**
 * Returns the list of paths to search for config files.
 *
 * @param explicitPath - Optional explicit path from CLI argument
 * @returns Array of paths to check, in priority order
 */
const getSearchPaths = (explicitPath?: string): readonly string[] => {
	const paths: string[] = [];

	if (explicitPath !== undefined) {
		paths.push(explicitPath);
	}

	// Current working directory
	paths.push("./glass.toml");

	// XDG config location
	const home = process.env.HOME;
	if (home !== undefined) {
		paths.push(`${home}/.config/glass/config.toml`);
	}

	return paths;
};

/**
 * Finds the first existing config file from the search paths.
 *
 * @param explicitPath - Optional explicit path from CLI argument
 * @returns Effect that resolves to the found path, or fails with ConfigNotFound
 */
const findConfigFile = (
	explicitPath?: string,
): Effect.Effect<string, ConfigError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const searchPaths = getSearchPaths(explicitPath);

		for (const path of searchPaths) {
			// fs.exists can throw PlatformError, treat errors as "not found"
			const exists = yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false));
			if (exists) {
				return path;
			}
		}

		return yield* Effect.fail(ConfigError.ConfigNotFound({ searchedPaths: searchPaths }));
	});

// ----------------------------------------------------------------------------
// Config Loading
// ----------------------------------------------------------------------------

/**
 * Parses TOML content into a JavaScript object.
 *
 * @param content - The TOML string to parse
 * @param path - The config file path (for error messages)
 * @returns Effect that resolves to the parsed object
 */
const parseTOML = (content: string, path: string): Effect.Effect<unknown, ConfigError> =>
	Effect.try({
		try: () => TOML.parse(content),
		catch: (error) =>
			ConfigError.ConfigParseError({
				path,
				message: error instanceof Error ? error.message : String(error),
			}),
	});

/**
 * Validates parsed config against the schema.
 *
 * @param data - The parsed TOML data
 * @param path - The config file path (for error messages)
 * @returns Effect that resolves to the validated config
 */
const validateConfig = (data: unknown, path: string): Effect.Effect<GlassConfig, ConfigError> =>
	Schema.decodeUnknown(GlassConfigSchema)(data).pipe(
		Effect.mapError((error) => ConfigError.ConfigValidationError({ path, error })),
	);

/**
 * Expands a path that may start with ~ to the user's home directory.
 */
const expandHomePath = (filePath: string): string => {
	if (filePath.startsWith("~/")) {
		const home = process.env.HOME;
		if (home) {
			return filePath.replace("~", home);
		}
	}
	return filePath;
};

/**
 * Resolves auth_token_file to auth_token for sources that support it.
 * Reads the token from the file and sets it as auth_token.
 *
 * @param data - The parsed TOML data (mutable)
 * @param configPath - The config file path (for error messages)
 * @returns Effect that resolves when all token files have been read
 */
const resolveTokenFiles = (
	data: unknown,
	configPath: string,
): Effect.Effect<unknown, ConfigError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;

		// Type guard for accessing nested properties
		if (typeof data !== "object" || data === null) {
			return data;
		}

		const config = data as Record<string, unknown>;

		// Check for sources.sentry.auth_token_file
		const sources = config.sources as Record<string, unknown> | undefined;
		if (sources && typeof sources === "object") {
			const sentry = sources.sentry as Record<string, unknown> | undefined;
			if (sentry && typeof sentry === "object") {
				const tokenFile = sentry.auth_token_file as string | undefined;
				if (tokenFile && !sentry.auth_token) {
					// Read the token from the file
					const expandedPath = expandHomePath(tokenFile);
					const exists = yield* fs.exists(expandedPath).pipe(Effect.orElseSucceed(() => false));

					if (!exists) {
						return yield* Effect.fail(
							ConfigError.ConfigReadError({
								path: configPath,
								message: `auth_token_file not found: ${tokenFile}`,
							}),
						);
					}

					const token = yield* fs.readFileString(expandedPath).pipe(
						Effect.map((content) => content.trim()),
						Effect.mapError((error) =>
							ConfigError.ConfigReadError({
								path: configPath,
								message: `Failed to read auth_token_file (${tokenFile}): ${error.message}`,
							}),
						),
					);

					// Set the token on the sentry config
					sentry.auth_token = token;
				}
			}
		}

		return data;
	});

/**
 * Loads and validates a Glass configuration file.
 *
 * This is the main entry point for config loading. It:
 * 1. Searches for a config file (explicit path or default locations)
 * 2. Reads the file content
 * 3. Interpolates environment variables
 * 4. Parses the TOML
 * 5. Validates against the schema
 *
 * @param explicitPath - Optional explicit path to config file (e.g., from CLI)
 * @returns Effect that resolves to the validated GlassConfig
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { BunContext } from "@effect/platform-bun"
 * import { loadConfig } from "./config/loader"
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* loadConfig()
 *   console.log(config.sentry.organization)
 * })
 *
 * Effect.runPromise(program.pipe(Effect.provide(BunContext.layer)))
 * ```
 */
export const loadConfig = (
	explicitPath?: string,
): Effect.Effect<GlassConfig, ConfigError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;

		// Find config file
		const path = yield* findConfigFile(explicitPath);

		// Read file content
		const rawContent = yield* fs.readFileString(path).pipe(
			Effect.mapError((error) =>
				ConfigError.ConfigReadError({
					path,
					message: error.message,
				}),
			),
		);

		// Interpolate environment variables
		const content = yield* interpolateEnvVars(rawContent, path);

		// Parse TOML
		const data = yield* parseTOML(content, path);

		// Resolve auth_token_file references
		const resolvedData = yield* resolveTokenFiles(data, path);

		// Validate and return
		return yield* validateConfig(resolvedData, path);
	});

// ----------------------------------------------------------------------------
// Service Tag and Layer
// ----------------------------------------------------------------------------

/**
 * Service tag for accessing GlassConfig from the Effect context.
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { Config } from "./config"
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* Config
 *   console.log(config.sentry.organization)
 * })
 * ```
 */
export class Config extends Context.Tag("GlassConfig")<Config, GlassConfig>() {}

/**
 * Creates a Layer that provides the GlassConfig service.
 *
 * @param explicitPath - Optional explicit path to config file
 * @returns Layer that provides Config
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { BunContext } from "@effect/platform-bun"
 * import { Config, ConfigLive } from "./config"
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* Config
 *   console.log(config.sentry.organization)
 * })
 *
 * const MainLive = ConfigLive().pipe(
 *   Layer.provide(BunContext.layer)
 * )
 *
 * Effect.runPromise(program.pipe(Effect.provide(MainLive)))
 * ```
 */
export const ConfigLive = (
	explicitPath?: string,
): Layer.Layer<Config, ConfigError, FileSystem.FileSystem> =>
	Layer.effect(Config, loadConfig(explicitPath));
