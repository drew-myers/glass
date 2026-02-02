/**
 * @fileoverview Glass Server entry point.
 *
 * Starts the HTTP server that provides the REST API for the TUI client.
 */

import { FetchHttpClient, HttpServer } from "@effect/platform";
import { BunContext, BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { ConfigLive } from "./config/index.js";
import { DatabaseLive } from "./db/index.js";
import { FileLoggerLive } from "./lib/logger.js";
import { ProjectPath } from "./lib/project.js";
import { AgentServiceLive, EventBufferServiceLive } from "./services/agent/index.js";
import { SentryServiceLive } from "./services/sentry/index.js";
import { ApiLive } from "./api/routes.js";

// =============================================================================
// Configuration
// =============================================================================

const PORT = 7420;

// =============================================================================
// Layer Setup
// =============================================================================

/**
 * Get the project path from CLI arguments or current working directory.
 */
const getProjectPath = (): string => {
	const args = process.argv.slice(2);
	const projectArg = args.find((arg) => !arg.startsWith("-"));
	return projectArg ?? process.cwd();
};

/**
 * Creates the full application layer with all services.
 */
const createAppLayer = () => {
	const projectPath = getProjectPath();

	// Project path layer
	const ProjectPathLive = Layer.succeed(ProjectPath, projectPath);

	// Logger layer (logs to ~/.local/state/glass/server.log)
	const LoggerLayer = FileLoggerLive();

	// Config layer
	const ConfigLayer = ConfigLive().pipe(Layer.provide(BunContext.layer));

	// Database layer
	const DbLayer = DatabaseLive.pipe(
		Layer.provide(ProjectPathLive),
		Layer.provide(BunContext.layer),
	);

	// Sentry service
	const SentryLayer = SentryServiceLive.pipe(
		Layer.provide(ConfigLayer),
		Layer.provide(FetchHttpClient.layer),
	);

	// Agent service
	const AgentLayer = AgentServiceLive(projectPath).pipe(
		Layer.provide(ConfigLayer),
	);

	// Event buffer service (for SSE streaming)
	const EventBufferLayer = EventBufferServiceLive;

	// HTTP Server
	const ServerLayer = BunHttpServer.layer({ port: PORT });

	// Combine all layers
	return Layer.mergeAll(
		ProjectPathLive,
		LoggerLayer,
		ConfigLayer,
		DbLayer,
		SentryLayer,
		AgentLayer,
		EventBufferLayer,
		ServerLayer,
	);
};

// =============================================================================
// Main Program
// =============================================================================

const program = Effect.gen(function* () {
	const projectPath = yield* ProjectPath;
	yield* Effect.logInfo(`Glass server starting on http://localhost:${PORT}`);
	yield* Effect.logInfo(`Project path: ${projectPath}`);
	
	// Keep the server running
	yield* Effect.never;
});

// =============================================================================
// Entry Point
// =============================================================================

const main = program.pipe(
	Effect.provide(ApiLive),
	Effect.provide(createAppLayer()),
);

const mainWithErrorHandling = main.pipe(
	Effect.catchTag("ConfigNotFound", (error) =>
		Effect.sync(() => {
			console.error("Configuration file not found.");
			console.error("Searched paths:");
			for (const path of error.searchedPaths) {
				console.error(`  - ${path}`);
			}
			console.error("\nCreate a glass.toml file with your Sentry configuration.");
			process.exit(1);
		}),
	),
	Effect.catchTag("ConfigReadError", (error) =>
		Effect.sync(() => {
			console.error(`Failed to read config file: ${error.path}`);
			console.error(error.message);
			process.exit(1);
		}),
	),
	Effect.catchTag("ConfigParseError", (error) =>
		Effect.sync(() => {
			console.error(`Failed to parse config file: ${error.path}`);
			console.error(error.message);
			process.exit(1);
		}),
	),
	Effect.catchTag("ConfigValidationError", (error) =>
		Effect.sync(() => {
			console.error(`Invalid configuration in: ${error.path}`);
			console.error(String(error.error));
			process.exit(1);
		}),
	),
	Effect.catchTag("MissingEnvVar", (error) =>
		Effect.sync(() => {
			console.error(`Missing environment variable: ${error.varName}`);
			console.error(`Referenced in: ${error.path}`);
			process.exit(1);
		}),
	),
);

BunRuntime.runMain(mainWithErrorHandling);
