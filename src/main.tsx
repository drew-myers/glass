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
import { Effect, Layer, ManagedRuntime } from "effect";
import { Config, ConfigLive, getSentryConfig, hasSentrySource } from "./config/index.js";
import { DatabaseLive, SentryIssueRepository } from "./db/index.js";
import type { Issue, IssueSource } from "./domain/issue.js";
import { FileLoggerLive } from "./lib/logger.js";
import { ProjectPath } from "./lib/project.js";
import {
	type SentryError,
	SentryService,
	SentryServiceLive,
	getSentryErrorMessage,
	isSentryError,
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
		yield* Effect.logDebug("Loading issues from local database");
		const issueRepo = yield* SentryIssueRepository;

		const issues = yield* issueRepo.listAll().pipe(
			Effect.tap((issues) => Effect.logDebug(`Loaded ${issues.length} issues from database`)),
			Effect.catchAll((error) =>
				Effect.logWarning(`Failed to load issues from database: ${error}`).pipe(
					Effect.map(() => [] as readonly Issue[]),
				),
			),
		);

		state.setIssues(issues);
	});

/**
 * Fetches full event data for a specific issue (stacktrace, breadcrumbs, etc).
 * Updates the issue in the database and app state with the enriched data.
 */
const makeFetchEventDataEffect = (
	state: AppState,
	issueId: string,
): Effect.Effect<void, never, SentryService | SentryIssueRepository> =>
	Effect.gen(function* () {
		yield* Effect.logInfo(`Fetching event data for issue ${issueId}`);
		const sentry = yield* SentryService;
		const issueRepo = yield* SentryIssueRepository;

		// Set detail loading state
		state.setIsDetailLoading(true);

		// Find the issue to get the Sentry ID
		const currentIssue = state.issues().find((i) => i.id === issueId);
		if (!currentIssue || currentIssue.source._tag !== "Sentry") {
			yield* Effect.logWarning(
				`Issue ${issueId} not found or not a Sentry issue (found: ${currentIssue?.source._tag ?? "none"})`,
			);
			state.setIsDetailLoading(false);
			return;
		}

		// Use the actual Sentry issue ID from the source data
		const sentryIssueId = currentIssue.source.data.sentryId;
		yield* Effect.logDebug(`Using Sentry issue ID: ${sentryIssueId}`);

		// Fetch full event data from Sentry
		const eventResult = yield* sentry.getLatestEvent(sentryIssueId).pipe(
			Effect.tap((event) =>
				Effect.logDebug("Received event data", {
					eventId: event.eventId,
					exceptionsCount: event.exceptions?.length ?? 0,
					breadcrumbsCount: event.breadcrumbs?.length ?? 0,
					environment: event.environment,
					release: event.release,
					tagsCount: Object.keys(event.tags || {}).length,
				}),
			),
			Effect.map((event) => ({ success: true as const, event })),
			Effect.catchAll((error) => {
				// Format the error message properly for logging
				const errorMsg = isSentryError(error) ? getSentryErrorMessage(error) : String(error);
				const errorDetails = isSentryError(error)
					? { tag: error._tag, ...error }
					: { raw: String(error) };

				return Effect.logError(
					`Failed to fetch event data for issue ${sentryIssueId}: ${errorMsg}`,
					errorDetails,
				).pipe(Effect.map(() => ({ success: false as const, event: null })));
			}),
		);

		if (eventResult.success && eventResult.event) {
			const existingData = currentIssue.source.data;
			const event = eventResult.event;

			yield* Effect.logDebug("Merging event data with existing issue data");

			// Merge event data with existing issue data
			// Only include optional fields if they have values
			const enrichedData = {
				...existingData,
				exceptions: event.exceptions,
				breadcrumbs: event.breadcrumbs,
				...(event.environment !== undefined && { environment: event.environment }),
				...(event.release !== undefined && { release: event.release }),
				tags: event.tags,
			};

			yield* Effect.logDebug("Enriched data prepared", {
				hasExceptions: !!enrichedData.exceptions,
				exceptionsCount: enrichedData.exceptions?.length ?? 0,
				hasBreadcrumbs: !!enrichedData.breadcrumbs,
				breadcrumbsCount: enrichedData.breadcrumbs?.length ?? 0,
				environment: enrichedData.environment,
				release: enrichedData.release,
			});

			// Update the database with enriched data
			yield* issueRepo
				.upsert({
					id: sentryIssueId,
					project: currentIssue.source.project,
					data: enrichedData,
				})
				.pipe(
					Effect.tap(() => Effect.logDebug("Upserted enriched data to database")),
					Effect.catchAll((err) =>
						Effect.logError("Failed to upsert enriched data", { error: err }),
					),
				);

			// Reload issues from database to update state
			const issues = yield* issueRepo.listAll().pipe(
				Effect.tap((issues) => {
					const reloaded = issues.find((i) => i.id === issueId);
					const reloadedExceptions =
						reloaded?.source._tag === "Sentry"
							? (reloaded.source.data.exceptions?.length ?? 0)
							: "N/A";
					return Effect.logDebug(`Reloaded ${issues.length} issues from database`, {
						currentIssueExceptions: reloadedExceptions,
					});
				}),
				Effect.catchAll((error) =>
					Effect.logWarning(`Failed to reload issues: ${error}`).pipe(
						Effect.map(() => [] as readonly Issue[]),
					),
				),
			);

			state.setIssues(issues);
			yield* Effect.logInfo(`Successfully enriched issue ${issueId} with event data`);
		} else {
			yield* Effect.logWarning(`No event data received for issue ${sentryIssueId}`);
		}

		state.setIsDetailLoading(false);
	});

/**
 * Fetches issues from Sentry and updates the database.
 * Shows loading state in the status bar while fetching.
 */
const makeRefreshEffect = (
	state: AppState,
): Effect.Effect<void, never, SentryService | SentryIssueRepository> =>
	Effect.gen(function* () {
		yield* Effect.logInfo("Refreshing issues from Sentry");
		const sentry = yield* SentryService;
		const issueRepo = yield* SentryIssueRepository;

		// Set loading state (shows spinner in status bar)
		state.setIsLoading(true);
		state.setError(null);

		// Fetch issues from Sentry
		const sourcesResult = yield* sentry.listIssues().pipe(
			Effect.tap((sources) => Effect.logDebug(`Fetched ${sources.length} issues from Sentry API`)),
			Effect.map((sources) => ({ success: true as const, sources })),
			Effect.catchAll((error: SentryError) => {
				const errorMsg = getSentryErrorMessage(error);
				return Effect.logWarning(`Sentry API error: ${errorMsg}`).pipe(
					Effect.map(() => ({
						success: false as const,
						error: errorMsg,
						sources: [] as readonly IssueSource[],
					})),
				);
			}),
		);

		// If there was an error, show it but continue to load from DB
		if (!sourcesResult.success) {
			state.setError(sourcesResult.error);
		}

		// Upsert fetched issues to database
		for (const source of sourcesResult.sources) {
			if (source._tag === "Sentry") {
				// Use the actual Sentry issue ID as our database ID
				yield* issueRepo
					.upsert({
						id: source.data.sentryId,
						project: source.project,
						data: source.data,
					})
					.pipe(Effect.catchAll(() => Effect.void));
			}
		}

		// Load all issues from database
		const issues = yield* issueRepo.listAll().pipe(
			Effect.tap((issues) => Effect.logDebug(`Loaded ${issues.length} issues from database`)),
			Effect.catchAll((error) =>
				Effect.logWarning(`Failed to load issues from database: ${error}`).pipe(
					Effect.map(() => [] as readonly Issue[]),
				),
			),
		);

		// Update app state with issues
		state.setIssues(issues);
		state.setIsLoading(false);
		yield* Effect.logInfo("Refresh complete");
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
		yield* Effect.logInfo("Glass TUI starting up");

		// Load configuration
		const config = yield* Config;
		const sentry = yield* SentryService;
		const issueRepo = yield* SentryIssueRepository;

		yield* Effect.logDebug("Services initialized");

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

		// Get project path for creating a runtime with proper logging
		const projectPath = getProjectPath();
		const LoggerLayer = FileLoggerLive(projectPath);

		// Create a runtime with logger + services for forked effects
		const forkRuntime = ManagedRuntime.make(
			Layer.mergeAll(
				LoggerLayer,
				Layer.succeed(SentryService, sentry),
				Layer.succeed(SentryIssueRepository, issueRepo),
			),
		);

		// Refresh function that can be called from the UI
		const handleRefresh = () => {
			forkRuntime.runFork(makeRefreshEffect(appState));
		};

		// Fetch event data when opening detail view
		const handleOpenDetail = (issueId: string) => {
			forkRuntime.runFork(makeFetchEventDataEffect(appState, issueId));
		};

		// Create renderer explicitly so we can destroy it on quit
		const renderer = yield* Effect.promise(() => createCliRenderer());

		// Render the app with Solid.js
		render(
			() => (
				<App
					state={appState}
					statusBarProps={statusBarProps}
					onRefresh={handleRefresh}
					onOpenDetail={handleOpenDetail}
				/>
			),
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

	// Logger layer - writes to project-specific log file
	const LoggerLayer = FileLoggerLive(projectPath);

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

	// Combine all layers (Logger is first so it's available throughout)
	return Layer.mergeAll(LoggerLayer, ConfigLayer, DbLayer, SentryLayer);
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
