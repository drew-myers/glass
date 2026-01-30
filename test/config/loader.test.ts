import { FileSystem } from "@effect/platform";
import { SystemError } from "@effect/platform/Error";
import { describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Redacted, Schema } from "effect";
import { expect } from "vitest";
import {
	Config,
	ConfigLive,
	GlassConfigSchema,
	getSentryConfig,
	interpolateEnvVars,
	loadConfig,
} from "../../src/config/index.js";

// ----------------------------------------------------------------------------
// Test Fixtures
// ----------------------------------------------------------------------------

const VALID_CONFIG_TOML = `
[sources.sentry]
organization = "my-org"
project = "my-project"
team = "my-team"
auth_token = "secret-token"
region = "us"

[opencode]
analyze_model = "anthropic/claude-sonnet-4-20250514"
fix_model = "anthropic/claude-sonnet-4-20250514"

[worktree]
create_command = "git worktree add {path} -b {branch}"
parent_directory = "../glass-worktrees"

[display]
page_size = 50
`;

const CONFIG_WITH_ENV_VARS = `
[sources.sentry]
organization = "my-org"
project = "my-project"
team = "my-team"
auth_token = "\${SENTRY_AUTH_TOKEN}"
region = "de"

[opencode]
analyze_model = "\${ANALYZE_MODEL}"
fix_model = "anthropic/claude-sonnet-4-20250514"

[worktree]
create_command = "git worktree add {path} -b {branch}"
parent_directory = "../glass-worktrees"

[display]
page_size = 25
`;

const INVALID_TOML = `
[sentry
organization = "missing bracket"
`;

const INVALID_SCHEMA_CONFIG = `
[sources.sentry]
organization = "my-org"
# Missing required fields

[opencode]
analyze_model = "model"
fix_model = "model"

[worktree]
create_command = "cmd"
parent_directory = "dir"

[display]
page_size = 50
`;

// ----------------------------------------------------------------------------
// Mock FileSystem
// ----------------------------------------------------------------------------

/**
 * Creates a mock FileSystem layer that returns predefined content for paths.
 * We only implement the methods needed for config loading (exists, readFileString).
 */
const mockFileSystem = (files: Record<string, string>): Layer.Layer<FileSystem.FileSystem> =>
	Layer.succeed(
		FileSystem.FileSystem,
		FileSystem.FileSystem.of({
			exists: (path: string) => Effect.succeed(path in files),
			readFileString: (path: string) => {
				const content = files[path];
				if (content === undefined) {
					return Effect.fail(
						new SystemError({
							reason: "NotFound",
							module: "FileSystem",
							method: "readFileString",
							pathOrDescriptor: path,
						}),
					);
				}
				return Effect.succeed(content);
			},
			// Stub out other methods - they won't be called in our tests
			access: () => Effect.void,
			copy: () => Effect.void,
			copyFile: () => Effect.void,
			chmod: () => Effect.void,
			chown: () => Effect.void,
			link: () => Effect.void,
			makeDirectory: () => Effect.void,
			makeTempDirectory: () => Effect.succeed("/tmp/test"),
			makeTempDirectoryScoped: () => Effect.succeed("/tmp/test"),
			makeTempFile: () => Effect.succeed("/tmp/test.txt"),
			makeTempFileScoped: () => Effect.succeed("/tmp/test.txt"),
			open: () =>
				Effect.fail(
					new SystemError({
						reason: "NotFound",
						module: "FileSystem",
						method: "open",
						pathOrDescriptor: "",
					}),
				),
			readDirectory: () => Effect.succeed([]),
			readFile: () => Effect.succeed(new Uint8Array()),
			readLink: () => Effect.succeed(""),
			realPath: () => Effect.succeed(""),
			remove: () => Effect.void,
			rename: () => Effect.void,
			sink: () => {
				throw new Error("Not implemented");
			},
			stat: () =>
				Effect.fail(
					new SystemError({
						reason: "NotFound",
						module: "FileSystem",
						method: "stat",
						pathOrDescriptor: "",
					}),
				),
			stream: () => {
				throw new Error("Not implemented");
			},
			symlink: () => Effect.void,
			truncate: () => Effect.void,
			utimes: () => Effect.void,
			watch: () => {
				throw new Error("Not implemented");
			},
			writeFile: () => Effect.void,
			writeFileString: () => Effect.void,
		}),
	);

// ----------------------------------------------------------------------------
// Schema Tests
// ----------------------------------------------------------------------------

describe("GlassConfigSchema", () => {
	it("decodes valid TOML-parsed config with sentry source", () => {
		const input = {
			sources: {
				sentry: {
					organization: "my-org",
					project: "my-project",
					team: "my-team",
					auth_token: "secret",
					region: "us" as const,
				},
			},
			opencode: {
				analyze_model: "model-a",
				fix_model: "model-f",
			},
			worktree: {
				create_command: "git worktree add {path} -b {branch}",
				parent_directory: "../worktrees",
			},
			display: {
				page_size: 50,
			},
		};

		const result = Schema.decodeUnknownSync(GlassConfigSchema)(input);

		expect(Option.isSome(result.sources.sentry)).toBe(true);
		const sentry = getSentryConfig(result);
		expect(sentry.organization).toBe("my-org");
		expect(sentry.authToken).toBeInstanceOf(Redacted.make("").constructor);
		expect(Redacted.value(sentry.authToken)).toBe("secret");
		expect(result.opencode.analyzeModel).toBe("model-a");
		expect(result.worktree.createCommand).toBe("git worktree add {path} -b {branch}");
		expect(result.display.pageSize).toBe(50);
	});

	it("decodes config without sentry source", () => {
		const input = {
			sources: {},
			opencode: { analyze_model: "m", fix_model: "m" },
			worktree: { create_command: "c", parent_directory: "p" },
			display: { page_size: 50 },
		};

		const result = Schema.decodeUnknownSync(GlassConfigSchema)(input);
		expect(Option.isNone(result.sources.sentry)).toBe(true);
	});

	it("rejects invalid region", () => {
		const input = {
			sources: {
				sentry: {
					organization: "my-org",
					project: "my-project",
					team: "my-team",
					auth_token: "secret",
					region: "invalid",
				},
			},
			opencode: { analyze_model: "m", fix_model: "m" },
			worktree: { create_command: "c", parent_directory: "p" },
			display: { page_size: 50 },
		};

		expect(() => Schema.decodeUnknownSync(GlassConfigSchema)(input)).toThrow();
	});

	it("rejects missing required fields in sentry", () => {
		const input = {
			sources: {
				sentry: { organization: "my-org" },
			},
			opencode: { analyze_model: "m", fix_model: "m" },
			worktree: { create_command: "c", parent_directory: "p" },
			display: { page_size: 50 },
		};

		expect(() => Schema.decodeUnknownSync(GlassConfigSchema)(input)).toThrow();
	});
});

// ----------------------------------------------------------------------------
// Environment Variable Helpers
// ----------------------------------------------------------------------------

/**
 * Helper to restore an environment variable to its original state.
 * Uses Reflect.deleteProperty to avoid biome lint warnings.
 */
const restoreEnvVar = (name: string, originalValue: string | undefined): void => {
	if (originalValue === undefined) {
		Reflect.deleteProperty(process.env, name);
	} else {
		process.env[name] = originalValue;
	}
};

// ----------------------------------------------------------------------------
// Environment Variable Interpolation Tests
// ----------------------------------------------------------------------------

describe("interpolateEnvVars", () => {
	it.effect("replaces single env var", () =>
		Effect.gen(function* () {
			const originalValue = process.env.TEST_VAR;
			process.env.TEST_VAR = "test-value";

			try {
				const result = yield* interpolateEnvVars("token = ${TEST_VAR}", "/test/path");
				expect(result).toBe("token = test-value");
			} finally {
				restoreEnvVar("TEST_VAR", originalValue);
			}
		}),
	);

	it.effect("replaces multiple env vars", () =>
		Effect.gen(function* () {
			const original1 = process.env.VAR_ONE;
			const original2 = process.env.VAR_TWO;
			process.env.VAR_ONE = "first";
			process.env.VAR_TWO = "second";

			try {
				const result = yield* interpolateEnvVars("a = ${VAR_ONE}, b = ${VAR_TWO}", "/test/path");
				expect(result).toBe("a = first, b = second");
			} finally {
				restoreEnvVar("VAR_ONE", original1);
				restoreEnvVar("VAR_TWO", original2);
			}
		}),
	);

	it.effect("returns content unchanged when no env vars present", () =>
		Effect.gen(function* () {
			const result = yield* interpolateEnvVars("plain text without vars", "/test/path");
			expect(result).toBe("plain text without vars");
		}),
	);

	it.effect("fails with MissingEnvVar for undefined env var", () =>
		Effect.gen(function* () {
			const originalValue = process.env.UNDEFINED_VAR;
			Reflect.deleteProperty(process.env, "UNDEFINED_VAR");

			try {
				const result = yield* interpolateEnvVars(
					"token = ${UNDEFINED_VAR}",
					"/test/config.toml",
				).pipe(Effect.flip);

				expect(result._tag).toBe("MissingEnvVar");
				if (result._tag === "MissingEnvVar") {
					expect(result.varName).toBe("UNDEFINED_VAR");
					expect(result.path).toBe("/test/config.toml");
				}
			} finally {
				restoreEnvVar("UNDEFINED_VAR", originalValue);
			}
		}),
	);
});

// ----------------------------------------------------------------------------
// Config Loading Tests
// ----------------------------------------------------------------------------

describe("loadConfig", () => {
	it.effect("loads config from explicit path", () =>
		Effect.gen(function* () {
			const config = yield* loadConfig("/custom/glass.toml").pipe(
				Effect.provide(
					mockFileSystem({
						"/custom/glass.toml": VALID_CONFIG_TOML,
					}),
				),
			);

			const sentry = getSentryConfig(config);
			expect(sentry.organization).toBe("my-org");
			expect(sentry.project).toBe("my-project");
			expect(sentry.region).toBe("us");
			expect(Redacted.value(sentry.authToken)).toBe("secret-token");
			expect(config.opencode.analyzeModel).toBe("anthropic/claude-sonnet-4-20250514");
			expect(config.worktree.parentDirectory).toBe("../glass-worktrees");
			expect(config.display.pageSize).toBe(50);
		}),
	);

	it.effect("loads config from ./glass.toml when no explicit path", () =>
		Effect.gen(function* () {
			const config = yield* loadConfig().pipe(
				Effect.provide(
					mockFileSystem({
						"./glass.toml": VALID_CONFIG_TOML,
					}),
				),
			);

			const sentry = getSentryConfig(config);
			expect(sentry.organization).toBe("my-org");
		}),
	);

	it.effect("interpolates env vars in config", () =>
		Effect.gen(function* () {
			const originalToken = process.env.SENTRY_AUTH_TOKEN;
			const originalModel = process.env.ANALYZE_MODEL;
			process.env.SENTRY_AUTH_TOKEN = "my-secret-token";
			process.env.ANALYZE_MODEL = "custom/model";

			try {
				const config = yield* loadConfig("/config.toml").pipe(
					Effect.provide(
						mockFileSystem({
							"/config.toml": CONFIG_WITH_ENV_VARS,
						}),
					),
				);

				const sentry = getSentryConfig(config);
				expect(Redacted.value(sentry.authToken)).toBe("my-secret-token");
				expect(config.opencode.analyzeModel).toBe("custom/model");
				expect(sentry.region).toBe("de");
				expect(config.display.pageSize).toBe(25);
			} finally {
				restoreEnvVar("SENTRY_AUTH_TOKEN", originalToken);
				restoreEnvVar("ANALYZE_MODEL", originalModel);
			}
		}),
	);

	it.effect("fails with ConfigNotFound when no config file exists", () =>
		Effect.gen(function* () {
			const result = yield* loadConfig().pipe(Effect.provide(mockFileSystem({})), Effect.flip);

			expect(result._tag).toBe("ConfigNotFound");
			if (result._tag === "ConfigNotFound") {
				expect(result.searchedPaths).toContain("./glass.toml");
			}
		}),
	);

	it.effect("fails with ConfigParseError for invalid TOML", () =>
		Effect.gen(function* () {
			const result = yield* loadConfig("/invalid.toml").pipe(
				Effect.provide(
					mockFileSystem({
						"/invalid.toml": INVALID_TOML,
					}),
				),
				Effect.flip,
			);

			expect(result._tag).toBe("ConfigParseError");
			if (result._tag === "ConfigParseError") {
				expect(result.path).toBe("/invalid.toml");
			}
		}),
	);

	it.effect("fails with ConfigValidationError for invalid schema", () =>
		Effect.gen(function* () {
			const result = yield* loadConfig("/invalid-schema.toml").pipe(
				Effect.provide(
					mockFileSystem({
						"/invalid-schema.toml": INVALID_SCHEMA_CONFIG,
					}),
				),
				Effect.flip,
			);

			expect(result._tag).toBe("ConfigValidationError");
			if (result._tag === "ConfigValidationError") {
				expect(result.path).toBe("/invalid-schema.toml");
			}
		}),
	);

	it.effect("fails with MissingEnvVar for undefined env var", () =>
		Effect.gen(function* () {
			const original = process.env.SENTRY_AUTH_TOKEN;
			Reflect.deleteProperty(process.env, "SENTRY_AUTH_TOKEN");

			try {
				const result = yield* loadConfig("/config.toml").pipe(
					Effect.provide(
						mockFileSystem({
							"/config.toml": CONFIG_WITH_ENV_VARS,
						}),
					),
					Effect.flip,
				);

				expect(result._tag).toBe("MissingEnvVar");
				if (result._tag === "MissingEnvVar") {
					expect(result.varName).toBe("SENTRY_AUTH_TOKEN");
				}
			} finally {
				restoreEnvVar("SENTRY_AUTH_TOKEN", original);
			}
		}),
	);
});

// ----------------------------------------------------------------------------
// Layer Tests
// ----------------------------------------------------------------------------

describe("ConfigLive", () => {
	it.effect("provides Config service", () =>
		Effect.gen(function* () {
			const config = yield* Config;

			const sentry = getSentryConfig(config);
			expect(sentry.organization).toBe("my-org");
		}).pipe(
			Effect.provide(ConfigLive("/test/glass.toml")),
			Effect.provide(
				mockFileSystem({
					"/test/glass.toml": VALID_CONFIG_TOML,
				}),
			),
		),
	);
});

// ----------------------------------------------------------------------------
// auth_token_file Tests
// ----------------------------------------------------------------------------

const CONFIG_WITH_TOKEN_FILE = `
[sources.sentry]
organization = "my-org"
project = "my-project"
team = "my-team"
auth_token_file = "~/.sentry-token"
region = "us"

[opencode]
analyze_model = "anthropic/claude-sonnet-4-20250514"
fix_model = "anthropic/claude-sonnet-4-20250514"

[worktree]
create_command = "git worktree add {path} -b {branch}"
parent_directory = "../glass-worktrees"

[display]
page_size = 50
`;

describe("auth_token_file", () => {
	it.effect("reads token from file when auth_token_file is specified", () =>
		Effect.gen(function* () {
			const home = process.env.HOME ?? "/home/user";
			const tokenPath = `${home}/.sentry-token`;

			const config = yield* loadConfig("/config.toml").pipe(
				Effect.provide(
					mockFileSystem({
						"/config.toml": CONFIG_WITH_TOKEN_FILE,
						[tokenPath]: "token-from-file\n", // With trailing newline to test trimming
					}),
				),
			);

			const sentry = getSentryConfig(config);
			expect(Redacted.value(sentry.authToken)).toBe("token-from-file");
		}),
	);

	it.effect("fails when auth_token_file does not exist", () =>
		Effect.gen(function* () {
			const result = yield* loadConfig("/config.toml").pipe(
				Effect.provide(
					mockFileSystem({
						"/config.toml": CONFIG_WITH_TOKEN_FILE,
						// Token file is not in the mock filesystem
					}),
				),
				Effect.flip,
			);

			expect(result._tag).toBe("ConfigReadError");
			if (result._tag === "ConfigReadError") {
				expect(result.message).toContain("auth_token_file not found");
			}
		}),
	);

	it.effect("prefers auth_token over auth_token_file when both are specified", () =>
		Effect.gen(function* () {
			const configWithBoth = `
[sources.sentry]
organization = "my-org"
project = "my-project"
team = "my-team"
auth_token = "inline-token"
auth_token_file = "~/.sentry-token"
region = "us"

[opencode]
analyze_model = "model"
fix_model = "model"

[worktree]
create_command = "cmd"
parent_directory = "dir"

[display]
page_size = 50
`;
			const home = process.env.HOME ?? "/home/user";
			const tokenPath = `${home}/.sentry-token`;

			const config = yield* loadConfig("/config.toml").pipe(
				Effect.provide(
					mockFileSystem({
						"/config.toml": configWithBoth,
						[tokenPath]: "file-token",
					}),
				),
			);

			const sentry = getSentryConfig(config);
			// Should use inline token, not file token
			expect(Redacted.value(sentry.authToken)).toBe("inline-token");
		}),
	);
});
