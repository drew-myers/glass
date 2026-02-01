/**
 * Domain-specific errors for the Glass application.
 * Uses Effect's Data.TaggedError for type-safe error handling.
 */
import { Data } from "effect";

/**
 * Error thrown when an invalid state transition is attempted.
 * Contains the current state, attempted action, and a descriptive message.
 */
export class InvalidTransitionError extends Data.TaggedError("InvalidTransitionError")<{
	readonly currentState: string;
	readonly attemptedAction: string;
	readonly message: string;
}> {}
