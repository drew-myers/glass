/**
 * Sentry API client service module.
 *
 * Provides an Effect-based client for interacting with the Sentry REST API.
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { SentryService, SentryServiceLive } from "./services/sentry"
 * import { Config, ConfigLive } from "./config"
 *
 * const program = Effect.gen(function* () {
 *   const sentry = yield* SentryService
 *   const issues = yield* sentry.listIssues()
 *   console.log(`Found ${issues.length} issues`)
 * })
 *
 * // Run with required dependencies
 * program.pipe(
 *   Effect.provide(SentryServiceLive),
 *   Effect.provide(ConfigLive()),
 *   Effect.provide(HttpClient.layer),
 * )
 * ```
 *
 * @module
 */

// Re-export errors
export { SentryError, getSentryErrorMessage, isSentryError } from "./errors.js";

// Re-export client
export {
	type ListIssuesOptions,
	type SentryEventData,
	SentryService,
	SentryServiceLive,
	type SentryServiceImpl,
} from "./client.js";

// Re-export useful types from the types module
export {
	type Breadcrumb,
	type ExceptionValue,
	type PaginationLink,
	type SentryEvent,
	type SentryIssue,
	type StackFrame,
	type Stacktrace,
	getNextCursor,
	hasNextPage,
	parseLinkHeader,
} from "./types.js";
