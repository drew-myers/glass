/**
 * @fileoverview Glass TUI application entry point.
 *
 * Initializes the Effect runtime, loads configuration, sets up services,
 * and launches the TUI application with Solid.js reactive rendering.
 */

import { FetchHttpClient } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { Effect, Layer } from "effect";
import { Config, ConfigLive, getSentryConfig, hasSentrySource } from "./config/index.js";
import { DatabaseLive, SentryIssueRepository } from "./db/index.js";
import type { Issue, IssueSource } from "./domain/issue.js";
import { ProjectPath } from "./lib/project.js";
import {
	type SentryError,
	SentryService,
	SentryServiceLive,
	getSentryErrorMessage,
} from "./services/sentry/index.js";
import { App, type AppState, createAppState } from "./ui/app.js";
import type { StatusBarProps } from "./ui/components/status-bar.js";

// =============================================================================
// Data Loading Effects
// =============================================================================

/**
 * Loads issues from the local database (fast, no network).
 * Used for eager display on startup.
 */
const makeLoadFromDbEffect = (state: AppState): Effect.Effect<void, never, SentryIssueRepository> =>
	Effect.gen(function* () {
		const issueRepo = yield* SentryIssueRepository;

		const issues = yield* issueRepo
			.listAll()
			.pipe(Effect.catchAll((): Effect.Effect<readonly Issue[]> => Effect.succeed([])));

		state.setIssues(issues);
	});

/**
 * Fetches issues from Sentry and updates the database.
 * Shows loading state in the status bar while fetching.
 */
const makeRefreshEffect = (
	state: AppState,
): Effect.Effect<void, never, SentryService | SentryIssueRepository> =>
	Effect.gen(function* () {
		const sentry = yield* SentryService;
		const issueRepo = yield* SentryIssueRepository;

		// Set loading state (shows spinner in status bar)
		state.setIsLoading(true);
		state.setError(null);

		// Fetch issues from Sentry
		const sourcesResult = yield* sentry.listIssues().pipe(
			Effect.map((sources) => ({ success: true as const, sources })),
			Effect.catchAll((error: SentryError) =>
				Effect.succeed({
					success: false as const,
					error: getSentryErrorMessage(error),
					sources: [] as readonly IssueSource[],
				}),
			),
		);

		// If there was an error, show it but continue to load from DB
		if (!sourcesResult.success) {
			state.setError(sourcesResult.error);
		}

		// Upsert fetched issues to database
		for (const source of sourcesResult.sources) {
			if (source._tag === "Sentry") {
				// Extract Sentry issue ID from the source data
				const sentryId = source.data.shortId.split("-").pop() ?? source.data.shortId;
				yield* issueRepo
					.upsert({
						id: sentryId,
						project: source.project,
						data: source.data,
					})
					.pipe(Effect.catchAll(() => Effect.void));
			}
		}

		// Load all issues from database
		const issues = yield* issueRepo
			.listAll()
			.pipe(Effect.catchAll((): Effect.Effect<readonly Issue[]> => Effect.succeed([])));

		// Update app state with issues
		state.setIssues(issues);
		state.setIsLoading(false);
	});

// =============================================================================
// Main Program
// =============================================================================

/**
 * The main Glass TUI program.
 *
 * Sets up all services and runs the application.
 */
const program: Effect.Effect<void, never, Config | SentryService | SentryIssueRepository> =
	Effect.gen(function* () {
		// Load configuration
		const config = yield* Config;
		const sentry = yield* SentryService;
		const issueRepo = yield* SentryIssueRepository;

		// Determine status bar props from config
		const statusBarProps: StatusBarProps | undefined = hasSentrySource(config)
			? (() => {
					const sentryConfig = getSentryConfig(config);
					return {
						organization: sentryConfig.organization,
						project: sentryConfig.project,
						team: sentryConfig.team,
					};
				})()
			: undefined;

		// Create app state
		const appState = createAppState();

		// Eagerly load issues from local database (fast, no network)
		yield* makeLoadFromDbEffect(appState).pipe(
			Effect.provideService(SentryIssueRepository, issueRepo),
		);

		// Refresh function that can be called from the UI
		const handleRefresh = () => {
			Effect.runFork(
				makeRefreshEffect(appState).pipe(
					Effect.provideService(SentryService, sentry),
					Effect.provideService(SentryIssueRepository, issueRepo),
				),
			);
		};

		// Create renderer explicitly so we can destroy it on quit
		const renderer = yield* Effect.promise(() => createCliRenderer());

		// Render the app with Solid.js
		render(
			() => <App state={appState} statusBarProps={statusBarProps} onRefresh={handleRefresh} />,
			renderer,
		);

		// Trigger background refresh from Sentry
		handleRefresh();

		// Wait for quit signal
		yield* Effect.async<void>((resume) => {
			const check = setInterval(() => {
				if (appState.shouldQuit()) {
					clearInterval(check);
					resume(Effect.void);
				}
			}, 50);

			return Effect.sync(() => clearInterval(check));
		});

		// Destroy the renderer to properly exit
		renderer.destroy();
	});

// =============================================================================
// Layer Setup
// =============================================================================

/**
 * Get the project path from CLI arguments or current working directory.
 */
const getProjectPath = (): string => {
	const args = process.argv.slice(2);
	// Find non-flag argument (not starting with -)
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

	// Config layer
	const ConfigLayer = ConfigLive().pipe(Layer.provide(BunContext.layer));

	// Database layer needs ProjectPath and BunContext
	const DbLayer = DatabaseLive.pipe(
		Layer.provide(ProjectPathLive),
		Layer.provide(BunContext.layer),
	);

	// Sentry service needs Config and HttpClient
	const SentryLayer = SentryServiceLive.pipe(
		Layer.provide(ConfigLayer),
		Layer.provide(FetchHttpClient.layer),
	);

	// Combine all layers
	return Layer.mergeAll(ConfigLayer, DbLayer, SentryLayer);
};

// =============================================================================
// Entry Point
// =============================================================================

/**
 * Run the main program with all layers.
 */
const main = program.pipe(Effect.provide(createAppLayer()));

// Handle configuration errors gracefully
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

// Run the application
BunRuntime.runMain(mainWithErrorHandling);
