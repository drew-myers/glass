/**
 * Effect Schema definitions for Glass configuration.
 *
 * The TOML file uses snake_case (standard for TOML), while TypeScript
 * uses camelCase. The schemas handle this transformation automatically.
 *
 * @module
 */

import { Option, Schema } from "effect";

/**
 * Encoded schema for Sentry configuration (TOML format).
 * Supports either auth_token (inline) or auth_token_file (path to file).
 */
const SentryConfigEncodedSchema = Schema.Struct({
	organization: Schema.String,
	project: Schema.String,
	team: Schema.String,
	auth_token: Schema.optional(Schema.String),
	auth_token_file: Schema.optional(Schema.String),
	region: Schema.Literal("us", "de"),
});

/**
 * Decoded schema for Sentry configuration (TypeScript format).
 */
const SentryConfigDecodedSchema = Schema.Struct({
	organization: Schema.String,
	project: Schema.String,
	team: Schema.String,
	authToken: Schema.Redacted(Schema.String),
	region: Schema.Literal("us", "de"),
});

/**
 * Schema for Sentry configuration section.
 * Handles auth_token -> authToken transformation.
 * Supports either auth_token (inline) or auth_token_file (path to file).
 *
 * Note: The actual file reading for auth_token_file happens in the loader,
 * after environment variable interpolation. This schema expects either
 * auth_token or auth_token_file to be present, and the loader will
 * resolve auth_token_file to auth_token before schema validation.
 */
export const SentryConfigSchema = Schema.transform(
	SentryConfigEncodedSchema,
	SentryConfigDecodedSchema,
	{
		strict: true,
		decode: (from) => {
			// At this point, the loader should have resolved auth_token_file to auth_token
			const token = from.auth_token;
			if (!token) {
				throw new Error(
					"Sentry auth_token is required. Provide either auth_token or auth_token_file.",
				);
			}
			return {
				organization: from.organization,
				project: from.project,
				team: from.team,
				authToken: token,
				region: from.region,
			};
		},
		encode: (to) => ({
			organization: to.organization,
			project: to.project,
			team: to.team,
			auth_token: to.authToken,
			region: to.region,
		}),
	},
);

export type SentryConfig = typeof SentryConfigSchema.Type;
export type SentryConfigEncoded = typeof SentryConfigEncodedSchema.Type;

/**
 * Schema for OpenCode configuration section.
 * Handles analyze_model -> analyzeModel and fix_model -> fixModel transformation.
 */
export const OpenCodeConfigSchema = Schema.transform(
	Schema.Struct({
		analyze_model: Schema.String,
		fix_model: Schema.String,
	}),
	Schema.Struct({
		analyzeModel: Schema.String,
		fixModel: Schema.String,
	}),
	{
		strict: true,
		decode: (from) => ({
			analyzeModel: from.analyze_model,
			fixModel: from.fix_model,
		}),
		encode: (to) => ({
			analyze_model: to.analyzeModel,
			fix_model: to.fixModel,
		}),
	},
);

export type OpenCodeConfig = typeof OpenCodeConfigSchema.Type;

/**
 * Schema for worktree configuration section.
 * Handles create_command -> createCommand and parent_directory -> parentDirectory.
 */
export const WorktreeConfigSchema = Schema.transform(
	Schema.Struct({
		create_command: Schema.String,
		parent_directory: Schema.String,
	}),
	Schema.Struct({
		createCommand: Schema.String,
		parentDirectory: Schema.String,
	}),
	{
		strict: true,
		decode: (from) => ({
			createCommand: from.create_command,
			parentDirectory: from.parent_directory,
		}),
		encode: (to) => ({
			create_command: to.createCommand,
			parent_directory: to.parentDirectory,
		}),
	},
);

export type WorktreeConfig = typeof WorktreeConfigSchema.Type;

/**
 * Schema for display configuration section.
 * Handles page_size -> pageSize transformation.
 */
export const DisplayConfigSchema = Schema.transform(
	Schema.Struct({
		page_size: Schema.Number,
	}),
	Schema.Struct({
		pageSize: Schema.Number,
	}),
	{
		strict: true,
		decode: (from) => ({
			pageSize: from.page_size,
		}),
		encode: (to) => ({
			page_size: to.pageSize,
		}),
	},
);

export type DisplayConfig = typeof DisplayConfigSchema.Type;

/**
 * Schema for the sources configuration section.
 * Each source is optional and can be enabled/disabled independently.
 */
export const SourcesConfigSchema = Schema.Struct({
	sentry: Schema.optionalWith(SentryConfigSchema, { as: "Option" }),
	// Future: github, ticket sources
});

export type SourcesConfig = typeof SourcesConfigSchema.Type;

/**
 * Schema for the complete Glass configuration file.
 * Combines all section schemas into a single configuration schema.
 */
export const GlassConfigSchema = Schema.Struct({
	sources: SourcesConfigSchema,
	opencode: OpenCodeConfigSchema,
	worktree: WorktreeConfigSchema,
	display: DisplayConfigSchema,
});

/**
 * The decoded TypeScript type for Glass configuration.
 * All field names are camelCase.
 */
export type GlassConfig = typeof GlassConfigSchema.Type;

/**
 * The encoded type (TOML format) for Glass configuration.
 * All field names are snake_case.
 */
export type GlassConfigEncoded = typeof GlassConfigSchema.Encoded;

/**
 * Helper to check if Sentry source is configured.
 */
export const hasSentrySource = (config: GlassConfig): boolean =>
	Option.isSome(config.sources.sentry);

/**
 * Helper to get Sentry config, throwing if not configured.
 * Use only when you've already checked hasSentrySource.
 */
export const getSentryConfig = (config: GlassConfig): SentryConfig =>
	Option.getOrThrow(config.sources.sentry);
