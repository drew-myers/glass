/**
 * @fileoverview Error types for the AgentService.
 *
 * Uses Effect's Data.TaggedError for type-safe error handling.
 */

import { Data } from "effect";

/**
 * Error thrown when an agent operation fails.
 */
export class AgentError extends Data.TaggedError("AgentError")<{
	/** The operation that failed (e.g., "createSession", "prompt", "dispose") */
	readonly operation: string;
	/** Human-readable error message */
	readonly message: string;
	/** The underlying cause, if any */
	readonly cause?: unknown;
}> {}

/**
 * Error thrown when a session is not found.
 */
export class SessionNotFoundError extends Data.TaggedError("SessionNotFoundError")<{
	/** The session ID that was not found */
	readonly sessionId: string;
}> {}

/**
 * Error thrown when model configuration is invalid.
 */
export class InvalidModelError extends Data.TaggedError("InvalidModelError")<{
	/** The invalid model string */
	readonly modelString: string;
	/** Human-readable error message */
	readonly message: string;
}> {}
