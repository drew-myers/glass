/**
 * @fileoverview Error types for the Sentry API client.
 *
 * Uses Effect's Data.TaggedEnum for type-safe error handling with
 * exhaustive pattern matching support.
 *
 * @module
 */

import { Data } from "effect";

/**
 * Tagged union of all Sentry API errors.
 *
 * Use Match.tag for exhaustive handling:
 * @example
 * ```ts
 * Match.value(error).pipe(
 *   Match.tag("AuthError", (e) => `Auth failed: ${e.message}`),
 *   Match.tag("RateLimitError", (e) => `Rate limited until ${e.resetAt}`),
 *   Match.tag("NotFoundError", (e) => `${e.resource} ${e.id} not found`),
 *   Match.tag("NetworkError", (e) => `Network error: ${e.message}`),
 *   Match.tag("ApiError", (e) => `API error ${e.status}: ${e.message}`),
 *   Match.exhaustive,
 * )
 * ```
 */
export type SentryError = Data.TaggedEnum<{
	/**
	 * Authentication/authorization error (401/403).
	 * Typically means invalid or expired auth token.
	 */
	AuthError: {
		readonly status: number;
		readonly message: string;
	};

	/**
	 * Resource not found (404).
	 * The requested issue or event doesn't exist.
	 */
	NotFoundError: {
		readonly resource: "issue" | "event" | "project" | "organization";
		readonly id: string;
	};

	/**
	 * Rate limit exceeded (429).
	 * Contains information about when the rate limit resets.
	 */
	RateLimitError: {
		/** When the rate limit window resets */
		readonly resetAt: Date;
		/** Maximum requests allowed in the window */
		readonly limit: number;
		/** Requests remaining in the window (usually 0 when this error occurs) */
		readonly remaining: number;
	};

	/**
	 * Network/connection error.
	 * Failed to connect to the Sentry API.
	 */
	NetworkError: {
		readonly message: string;
		readonly cause?: unknown;
	};

	/**
	 * Other HTTP errors from the Sentry API.
	 * Includes server errors (5xx) and client errors not covered above.
	 */
	ApiError: {
		readonly status: number;
		readonly message: string;
		readonly body?: string;
	};
}>;

export const SentryError = Data.taggedEnum<SentryError>();

/**
 * Type guard to check if an error is a SentryError.
 */
export const isSentryError = (error: unknown): error is SentryError =>
	typeof error === "object" &&
	error !== null &&
	"_tag" in error &&
	typeof (error as { _tag: unknown })._tag === "string" &&
	["AuthError", "NotFoundError", "RateLimitError", "NetworkError", "ApiError"].includes(
		(error as { _tag: string })._tag,
	);

/**
 * Get a user-friendly error message from a SentryError.
 */
export const getSentryErrorMessage = (error: SentryError): string => {
	switch (error._tag) {
		case "AuthError":
			return `Sentry authentication failed (${error.status}): ${error.message}`;
		case "NotFoundError":
			return `Sentry ${error.resource} not found: ${error.id}`;
		case "RateLimitError":
			return `Sentry rate limit exceeded. Resets at ${error.resetAt.toISOString()}`;
		case "NetworkError":
			return `Failed to connect to Sentry: ${error.message}`;
		case "ApiError":
			return `Sentry API error (${error.status}): ${error.message}`;
	}
};
