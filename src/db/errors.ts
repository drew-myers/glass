/**
 * @fileoverview Database error types for Glass.
 *
 * Provides tagged error types for database operations, wrapping underlying
 * SQL errors with additional context about which operation failed.
 */

import { Data } from "effect";

/**
 * Database operation error.
 * Wraps underlying SQL errors with context about the failing operation.
 */
export class DbError extends Data.TaggedError("DbError")<{
	/** The repository method or operation that failed */
	readonly method: string;
	/** The underlying error cause */
	readonly cause: unknown;
}> {
	get message(): string {
		const causeMsg = this.cause instanceof Error ? this.cause.message : String(this.cause);
		return `Database error in ${this.method}: ${causeMsg}`;
	}
}

/**
 * Database not found error.
 * Indicates a query expected to find a record but found none.
 */
export class DbNotFoundError extends Data.TaggedError("DbNotFoundError")<{
	/** The entity type being queried */
	readonly entity: string;
	/** The identifier that was not found */
	readonly id: string;
}> {
	get message(): string {
		return `${this.entity} not found: ${this.id}`;
	}
}
