/**
 * @fileoverview Event buffer for streaming analysis events to clients.
 *
 * Maintains an in-memory buffer of events per active session. When clients
 * connect via SSE, they receive a backfill of all previous events, then
 * continue receiving live events.
 */

import { Context, Effect, HashMap, Layer, Option, Ref } from "effect";

// =============================================================================
// Event Types
// =============================================================================

/**
 * Simplified event types for streaming to clients.
 * These are derived from Pi SDK AgentSessionEvent but simplified for the TUI.
 */
export type AnalysisEvent =
	| { type: "thinking" }
	| { type: "text_delta"; delta: string }
	| { type: "tool_start"; tool: string; args: Record<string, unknown> }
	| { type: "tool_output"; output: string }
	| { type: "tool_end"; tool: string; isError: boolean }
	| { type: "complete"; proposal: string }
	| { type: "error"; message: string };

/**
 * Message sent over SSE. First message is backfill, rest are live events.
 */
export type SSEMessage =
	| { type: "backfill"; events: AnalysisEvent[] }
	| AnalysisEvent;

// =============================================================================
// Session Buffer
// =============================================================================

interface SessionBuffer {
	/** Accumulated events for this session */
	events: AnalysisEvent[];
	/** Subscribers waiting for new events */
	subscribers: Set<(event: AnalysisEvent) => void>;
	/** Whether the session has completed */
	completed: boolean;
}

// =============================================================================
// Service Interface
// =============================================================================

export interface EventBufferServiceInterface {
	/**
	 * Create a new buffer for an analysis session.
	 */
	readonly createBuffer: (sessionId: string) => Effect.Effect<void>;

	/**
	 * Append an event to a session's buffer and notify subscribers.
	 */
	readonly appendEvent: (
		sessionId: string,
		event: AnalysisEvent,
	) => Effect.Effect<void>;

	/**
	 * Subscribe to events for a session. Returns backfill + live subscription.
	 *
	 * @returns Object with backfill events and unsubscribe function, or null if session not found
	 */
	readonly subscribe: (
		sessionId: string,
		listener: (event: AnalysisEvent) => void,
	) => Effect.Effect<{ backfill: AnalysisEvent[]; unsubscribe: () => void } | null>;

	/**
	 * Check if a session buffer exists and is not completed.
	 */
	readonly isActive: (sessionId: string) => Effect.Effect<boolean>;

	/**
	 * Remove a session buffer (after completion or error).
	 * Called automatically after a short delay when session completes.
	 */
	readonly removeBuffer: (sessionId: string) => Effect.Effect<void>;
}

export class EventBufferService extends Context.Tag("EventBufferService")<
	EventBufferService,
	EventBufferServiceInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

export const EventBufferServiceLive = Layer.effect(
	EventBufferService,
	Effect.gen(function* () {
		const buffersRef = yield* Ref.make(HashMap.empty<string, SessionBuffer>());

		const service: EventBufferServiceInterface = {
			createBuffer: (sessionId: string) =>
				Ref.update(buffersRef, (buffers) =>
					HashMap.set(buffers, sessionId, {
						events: [],
						subscribers: new Set(),
						completed: false,
					}),
				),

			appendEvent: (sessionId: string, event: AnalysisEvent) =>
				Effect.gen(function* () {
					const buffers = yield* Ref.get(buffersRef);
					const maybeBuffer = HashMap.get(buffers, sessionId);

					if (Option.isNone(maybeBuffer)) {
						return; // Session not found, ignore
					}

					const buffer = maybeBuffer.value;

					// Mark as completed if this is a terminal event
					if (event.type === "complete" || event.type === "error") {
						buffer.completed = true;
					}

					// Append event
					buffer.events.push(event);

					// Notify all subscribers
					for (const listener of buffer.subscribers) {
						try {
							listener(event);
						} catch {
							// Ignore listener errors
						}
					}

					// Schedule cleanup after completion (keep buffer for 30s for late joiners)
					if (buffer.completed) {
						setTimeout(() => {
							Effect.runSync(
								Ref.update(buffersRef, HashMap.remove(sessionId)),
							);
						}, 30_000);
					}
				}),

			subscribe: (sessionId: string, listener: (event: AnalysisEvent) => void) =>
				Effect.gen(function* () {
					const buffers = yield* Ref.get(buffersRef);
					const maybeBuffer = HashMap.get(buffers, sessionId);

					if (Option.isNone(maybeBuffer)) {
						return null;
					}

					const buffer = maybeBuffer.value;

					// Get backfill (copy to avoid mutation issues)
					const backfill = [...buffer.events];

					// If already completed, no need to subscribe
					if (buffer.completed) {
						return { backfill, unsubscribe: () => {} };
					}

					// Add subscriber
					buffer.subscribers.add(listener);

					const unsubscribe = () => {
						buffer.subscribers.delete(listener);
					};

					return { backfill, unsubscribe };
				}),

			isActive: (sessionId: string) =>
				Effect.gen(function* () {
					const buffers = yield* Ref.get(buffersRef);
					const maybeBuffer = HashMap.get(buffers, sessionId);

					if (Option.isNone(maybeBuffer)) {
						return false;
					}

					return !maybeBuffer.value.completed;
				}),

			removeBuffer: (sessionId: string) =>
				Ref.update(buffersRef, HashMap.remove(sessionId)),
		};

		return service;
	}),
);
