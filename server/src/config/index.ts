/**
 * Configuration module for Glass.
 *
 * Provides TOML-based configuration loading with:
 * - Effect Schema validation
 * - Environment variable interpolation (${VAR_NAME} syntax)
 * - Multiple search paths (CLI arg > ./glass.toml > ~/.config/glass/config.toml)
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
 *
 * @module
 */

// Re-export types from schema
export type {
	GlassConfig,
	GlassConfigEncoded,
	SentryConfig,
	OpenCodeConfig,
	WorktreeConfig,
	DisplayConfig,
	SourcesConfig,
} from "./schema.js";

// Re-export schema for advanced use cases (e.g., testing)
export { GlassConfigSchema, hasSentrySource, getSentryConfig } from "./schema.js";

// Re-export loader functionality
export {
	Config,
	ConfigLive,
	ConfigError,
	loadConfig,
	interpolateEnvVars,
} from "./loader.js";
