/**
 * @fileoverview AgentService implementation using Pi SDK.
 *
 * Manages Pi SDK agent sessions in-process:
 * - Analysis sessions: read-only tools, main project cwd
 * - Fix sessions: full coding tools, worktree cwd
 *
 * Sessions are tracked in a Ref<HashMap> and properly disposed on cleanup.
 * Shared AuthStorage and ModelRegistry instances are created once per service.
 */

import type { ThinkingLevel } from "@mariozechner/pi-ai";
import {
	type AgentSession,
	AuthStorage,
	ModelRegistry,
	SessionManager,
	SettingsManager,
	createAgentSession,
	createCodingTools,
	createReadOnlyTools,
} from "@mariozechner/pi-coding-agent";
import { Context, Effect, HashMap, Layer, Option, Ref } from "effect";
import { Config } from "../../config/index.js";
import { AgentError, InvalidModelError } from "./errors.js";
import type { AgentEventListener, AgentSessionHandle, ParsedModel } from "./types.js";

// -----------------------------------------------------------------------------
// Service Interface
// -----------------------------------------------------------------------------

/**
 * Service interface for managing Pi SDK agent sessions.
 */
export interface AgentServiceInterface {
	/**
	 * Create a new analysis session with read-only tools.
	 * Uses the main project directory as cwd.
	 */
	readonly createAnalysisSession: () => Effect.Effect<AgentSessionHandle, AgentError>;

	/**
	 * Create a new fix session with full coding tools.
	 * Uses the specified worktree directory as cwd.
	 *
	 * @param worktreePath - Absolute path to the worktree directory
	 */
	readonly createFixSession: (
		worktreePath: string,
	) => Effect.Effect<AgentSessionHandle, AgentError>;

	/**
	 * Get an existing session by ID.
	 *
	 * @param sessionId - The session ID to look up
	 * @returns The session handle, or null if not found
	 */
	readonly getSession: (sessionId: string) => Effect.Effect<AgentSessionHandle | null, AgentError>;

	/**
	 * Dispose a session and remove it from tracking.
	 *
	 * @param sessionId - The session ID to dispose
	 */
	readonly disposeSession: (sessionId: string) => Effect.Effect<void, AgentError>;

	/**
	 * Dispose all active sessions.
	 * Called during application shutdown.
	 */
	readonly disposeAll: () => Effect.Effect<void, AgentError>;
}

/**
 * Tag for the AgentService in Effect's dependency injection system.
 */
export class AgentService extends Context.Tag("AgentService")<
	AgentService,
	AgentServiceInterface
>() {}

// -----------------------------------------------------------------------------
// Model Parsing (temporary - replace with shared utility)
// -----------------------------------------------------------------------------

/**
 * Parse a model string in format "provider/model" or "provider/model@thinking".
 *
 * TODO: Replace with shared utility from config ticket when available.
 *
 * @param modelString - Model string like "anthropic/claude-sonnet-4-20250514"
 * @returns Parsed model configuration
 */
const parseModelString = (modelString: string): Effect.Effect<ParsedModel, InvalidModelError> =>
	Effect.try({
		try: () => {
			// Split thinking level if present
			const parts = modelString.split("@");
			const modelPart = parts[0];
			const thinkingPart = parts[1];

			if (!modelPart) {
				throw new Error("Model string cannot be empty");
			}

			// Split provider and model ID
			const slashIndex = modelPart.indexOf("/");
			if (slashIndex === -1) {
				throw new Error("Model string must be in format 'provider/model'");
			}

			const provider = modelPart.slice(0, slashIndex);
			const modelId = modelPart.slice(slashIndex + 1);

			if (!provider || !modelId) {
				throw new Error("Provider and model ID cannot be empty");
			}

			const validThinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
			type ValidThinkingLevel = (typeof validThinkingLevels)[number];
			let thinkingLevel: ValidThinkingLevel | undefined;

			if (thinkingPart) {
				if (!validThinkingLevels.includes(thinkingPart as ValidThinkingLevel)) {
					throw new Error(
						`Invalid thinking level '${thinkingPart}'. Valid levels: ${validThinkingLevels.join(", ")}`,
					);
				}
				thinkingLevel = thinkingPart as ValidThinkingLevel;
			}

			return { provider, modelId, thinkingLevel };
		},
		catch: (error) =>
			new InvalidModelError({
				modelString,
				message: error instanceof Error ? error.message : "Unknown parsing error",
			}),
	});

// -----------------------------------------------------------------------------
// Session Handle Factory
// -----------------------------------------------------------------------------

/**
 * Create an AgentSessionHandle wrapping a Pi SDK AgentSession.
 */
const createSessionHandle = (
	sessionId: string,
	session: AgentSession,
	type: "analysis" | "fix",
): AgentSessionHandle => ({
	sessionId,
	session,
	type,

	prompt: (message: string) =>
		Effect.tryPromise({
			try: () => session.prompt(message),
			catch: (error) =>
				new AgentError({
					operation: "prompt",
					message: `Failed to send prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				}),
		}),

	subscribe: (listener: AgentEventListener) => session.subscribe(listener),

	abort: () =>
		Effect.tryPromise({
			try: () => session.abort(),
			catch: (error) =>
				new AgentError({
					operation: "abort",
					message: `Failed to abort session: ${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				}),
		}),
});

// -----------------------------------------------------------------------------
// Service Implementation
// -----------------------------------------------------------------------------

/**
 * Create the AgentService Layer.
 *
 * @param projectPath - Absolute path to the main project directory
 * @returns Layer providing the AgentService
 */
export const AgentServiceLive = (
	projectPath: string,
): Layer.Layer<AgentService, AgentError, Config> =>
	Layer.effect(
		AgentService,
		Effect.gen(function* () {
			const config = yield* Config;

			// Create shared auth storage and model registry
			// These are reused across all sessions
			const authStorage = new AuthStorage();
			const modelRegistry = new ModelRegistry(authStorage);

			// Create shared settings manager (in-memory, no file I/O)
			const settingsManager = SettingsManager.inMemory({
				// Disable auto-compaction - Glass manages conversation state
				compaction: { enabled: false },
				// Enable retry for resilience
				retry: { enabled: true, maxRetries: 3 },
			});

			// Track active sessions
			const sessionsRef = yield* Ref.make(HashMap.empty<string, AgentSessionHandle>());

			// Session ID generator
			let sessionCounter = 0;
			const generateSessionId = (type: "analysis" | "fix"): string => {
				sessionCounter++;
				return `${type}-${Date.now()}-${sessionCounter}`;
			};

			/**
			 * Create a session with the specified configuration.
			 */
			const createSession = (
				type: "analysis" | "fix",
				cwd: string,
				modelString: string,
			): Effect.Effect<AgentSessionHandle, AgentError> =>
				Effect.gen(function* () {
					// Parse model string
					const parsed = yield* parseModelString(modelString).pipe(
						Effect.mapError(
							(err) =>
								new AgentError({
									operation: "createSession",
									message: err.message,
									cause: err,
								}),
						),
					);

					// Get the model from Pi's registry (supports custom models from models.json)
					const model = modelRegistry.find(parsed.provider, parsed.modelId);
					if (!model) {
						return yield* Effect.fail(
							new AgentError({
								operation: "createSession",
								message: `Model not found: ${parsed.provider}/${parsed.modelId}`,
							}),
						);
					}

					// Create tools based on session type
					const tools = type === "analysis" ? createReadOnlyTools(cwd) : createCodingTools(cwd);

					// Create the Pi SDK session
					const { session } = yield* Effect.tryPromise({
						try: () =>
							createAgentSession({
								cwd,
								model,
								thinkingLevel: (parsed.thinkingLevel ?? "off") as ThinkingLevel,
								tools,
								sessionManager: SessionManager.inMemory(),
								settingsManager,
								authStorage,
								modelRegistry,
							}),
						catch: (error) =>
							new AgentError({
								operation: "createSession",
								message: `Failed to create ${type} session: ${error instanceof Error ? error.message : "Unknown error"}`,
								cause: error,
							}),
					});

					// Create handle and track it
					const sessionId = generateSessionId(type);
					const handle = createSessionHandle(sessionId, session, type);

					yield* Ref.update(sessionsRef, HashMap.set(sessionId, handle));

					return handle;
				});

			const service: AgentServiceInterface = {
				createAnalysisSession: () =>
					createSession("analysis", projectPath, config.opencode.analyzeModel),

				createFixSession: (worktreePath: string) =>
					createSession("fix", worktreePath, config.opencode.fixModel),

				getSession: (sessionId: string) =>
					Effect.gen(function* () {
						const sessions = yield* Ref.get(sessionsRef);
						return Option.getOrNull(HashMap.get(sessions, sessionId));
					}),

				disposeSession: (sessionId: string) =>
					Effect.gen(function* () {
						const sessions = yield* Ref.get(sessionsRef);
						const maybeHandle = HashMap.get(sessions, sessionId);

						if (Option.isSome(maybeHandle)) {
							const handle = maybeHandle.value;

							// Dispose the Pi SDK session
							yield* Effect.try({
								try: () => handle.session.dispose(),
								catch: (error) =>
									new AgentError({
										operation: "disposeSession",
										message: `Failed to dispose session ${sessionId}: ${error instanceof Error ? error.message : "Unknown error"}`,
										cause: error,
									}),
							});

							// Remove from tracking
							yield* Ref.update(sessionsRef, HashMap.remove(sessionId));
						}
						// If session not found, no-op (idempotent)
					}),

				disposeAll: () =>
					Effect.gen(function* () {
						const sessions = yield* Ref.get(sessionsRef);

						// Dispose all sessions, collecting errors
						const entries = Array.from(HashMap.entries(sessions));
						for (const [sessionId, handle] of entries) {
							yield* Effect.try({
								try: () => handle.session.dispose(),
								catch: (error) =>
									new AgentError({
										operation: "disposeAll",
										message: `Failed to dispose session ${sessionId}: ${error instanceof Error ? error.message : "Unknown error"}`,
										cause: error,
									}),
							}).pipe(
								// Log but don't fail on individual dispose errors
								Effect.catchAll((err) =>
									Effect.logWarning(`Failed to dispose session ${sessionId}`, err),
								),
							);
						}

						// Clear the sessions map
						yield* Ref.set(sessionsRef, HashMap.empty());
					}),
			};

			return service;
		}),
	);
