/**
 * @fileoverview Glass TUI application entry point.
 *
 * Initializes the Effect runtime, loads configuration, sets up services,
 * and launches the TUI application with issue list refresh capability.
 */

import { FetchHttpClient } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Ref, type Scope } from "effect";
import { Config, ConfigLive, getSentryConfig, hasSentrySource } from "./config/index.js";
import { DatabaseLive, SentryIssueRepository } from "./db/index.js";
import type { Issue, IssueSource } from "./domain/issue.js";
import { Renderer, withRenderer } from "./lib/effect-opentui.js";
import { ProjectPath } from "./lib/project.js";
import {
	type SentryError,
	SentryService,
	SentryServiceLive,
	getSentryErrorMessage,
} from "./services/sentry/index.js";
import {
	AppAction,
	type AppContext,
	type AppState,
	createApp,
	dispatch,
	runAppLoop,
} from "./ui/app.js";
import type { StatusBarProps } from "./ui/components/status-bar.js";

// =============================================================================
// Refresh Logic
// =============================================================================

/**
 * Creates the refresh effect that:
 * 1. Sets loading state
 * 2. Fetches issues from Sentry
 * 3. Upserts each issue to the database
 * 4. Loads all issues from the database
 * 5. Updates the app state with issues
 */
const makeRefreshEffect = (
	stateRef: Ref.Ref<AppState>,
	statusBarProps?: StatusBarProps,
): Effect.Effect<void, never, Renderer | SentryService | SentryIssueRepository> =>
	Effect.gen(function* () {
		const renderer = yield* Renderer;
		const sentry = yield* SentryService;
		const issueRepo = yield* SentryIssueRepository;

		// Set loading state
		yield* dispatch(stateRef, renderer, AppAction.SetLoading({ isLoading: true }), statusBarProps);
		yield* dispatch(stateRef, renderer, AppAction.SetError({ error: null }), statusBarProps);

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
			yield* dispatch(
				stateRef,
				renderer,
				AppAction.SetError({ error: sourcesResult.error }),
				statusBarProps,
			);
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
		yield* dispatch(stateRef, renderer, AppAction.SetIssues({ issues }), statusBarProps);
		yield* dispatch(stateRef, renderer, AppAction.SetLoading({ isLoading: false }), statusBarProps);
	});

// =============================================================================
// Main Program
// =============================================================================

/**
 * The main Glass TUI program.
 *
 * Sets up all services and runs the application loop until quit.
 */
const program: Effect.Effect<
	void,
	never,
	Renderer | Scope.Scope | Config | SentryService | SentryIssueRepository
> = Effect.gen(function* () {
	// Load configuration
	const config = yield* Config;
	const renderer = yield* Renderer;
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

	// Create app context - the refresh callback will use the captured services
	const context: AppContext = {
		onRefresh: () => Effect.void, // Placeholder, we'll run refresh directly
		statusBarProps,
	};

	// Create the app
	const stateRef = yield* createApp(context);

	// Trigger initial refresh using the captured services
	yield* makeRefreshEffect(stateRef, statusBarProps).pipe(
		Effect.provideService(Renderer, renderer),
		Effect.provideService(SentryService, sentry),
		Effect.provideService(SentryIssueRepository, issueRepo),
	);

	// Create a refresh function that can be called from keybind handler
	const runRefresh = () => {
		Effect.runFork(
			makeRefreshEffect(stateRef, statusBarProps).pipe(
				Effect.provideService(Renderer, renderer),
				Effect.provideService(SentryService, sentry),
				Effect.provideService(SentryIssueRepository, issueRepo),
			),
		);
	};

	// Listen for the 'r' key to trigger refresh
	const refreshHandler = (event: import("@opentui/core").KeyEvent) => {
		// Get current state to check if we're on list screen
		const state = Effect.runSync(Ref.get(stateRef));
		if (state.screen._tag === "List" && event.name === "r") {
			runRefresh();
		}
	};

	renderer.keyInput.on("keypress", refreshHandler);

	// Cleanup on exit
	yield* Effect.addFinalizer(() =>
		Effect.sync(() => {
			renderer.keyInput.off("keypress", refreshHandler);
		}),
	);

	// Run until quit
	yield* runAppLoop(stateRef, statusBarProps);
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
const main = withRenderer(program).pipe(Effect.provide(createAppLayer()));

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
