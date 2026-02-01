/**
 * @fileoverview AgentService module for managing Pi SDK agent sessions.
 *
 * @example
 * ```typescript
 * import { AgentService, AgentServiceLive } from "./services/agent/index.js";
 *
 * // Create the layer
 * const layer = AgentServiceLive("/path/to/project");
 *
 * // Use the service
 * const program = Effect.gen(function* () {
 *   const agent = yield* AgentService;
 *
 *   // Create an analysis session
 *   const session = yield* agent.createAnalysisSession();
 *
 *   // Subscribe to events
 *   const unsubscribe = session.subscribe((event) => {
 *     if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
 *       process.stdout.write(event.assistantMessageEvent.delta);
 *     }
 *   });
 *
 *   // Send a prompt
 *   yield* session.prompt("Analyze this error...");
 *
 *   // Clean up
 *   unsubscribe();
 *   yield* agent.disposeSession(session.sessionId);
 * });
 * ```
 *
 * @module
 */

export { AgentService, AgentServiceLive, type AgentServiceInterface } from "./service.js";
export { AgentError, SessionNotFoundError, InvalidModelError } from "./errors.js";
export type {
	AgentSessionHandle,
	AgentEventListener,
	ParsedModel,
	ThinkingLevelValue,
} from "./types.js";
