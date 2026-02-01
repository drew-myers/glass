/**
 * @fileoverview Sentry API client service.
 *
 * Provides an Effect-based client for the Sentry REST API with:
 * - Bearer token authentication
 * - Rate limit handling
 * - Pagination support
 * - US and DE region support
 *
 * @module
 */

import {
	HttpClient,
	HttpClientError,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { Config, getSentryConfig } from "../../config/index.js";
import type {
	Breadcrumb,
	ExceptionValue,
	IssueSource,
	SentrySourceData,
	StackFrame,
	Stacktrace,
} from "../../domain/issue.js";
import { IssueSource as IssueSourceEnum } from "../../domain/issue.js";
import { SentryError } from "./errors.js";
import {
	type Breadcrumb as ApiBreadcrumb,
	type ExceptionValue as ApiExceptionValue,
	type StackFrame as ApiStackFrame,
	type Stacktrace as ApiStacktrace,
	type GenericEntry,
	SentryEventSchema,
	SentryIssueSchema,
	getNextCursor,
	hasNextPage,
	parseLinkHeader,
} from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Base URL for Sentry US region */
const SENTRY_US_BASE_URL = "https://sentry.io/api/0";

/** Base URL for Sentry DE region */
const SENTRY_DE_BASE_URL = "https://de.sentry.io/api/0";

/** Default page size for list requests */
const DEFAULT_PAGE_SIZE = 100;

/** Maximum number of pages to fetch (safety limit) */
const MAX_PAGES = 10;

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Options for listing issues.
 */
export interface ListIssuesOptions {
	/** Search query (default: "is:unresolved assigned:#{team}") */
	readonly query?: string;
	/** Maximum issues per page (default: 100) */
	readonly limit?: number;
	/** Whether to fetch all pages (default: true) */
	readonly fetchAllPages?: boolean;
}

/**
 * Event data returned by getLatestEvent.
 * Contains the full event details including exceptions and breadcrumbs.
 */
export interface SentryEventData {
	/** Event ID */
	readonly eventId: string;
	/** Event title */
	readonly title: string;
	/** Event message */
	readonly message: string;
	/** Platform (e.g., "python", "javascript") */
	readonly platform: string;
	/** ISO 8601 timestamp */
	readonly dateCreated: string;
	/** Culprit (file:function) */
	readonly culprit: string;
	/** Exception values with stacktraces */
	readonly exceptions: readonly ExceptionValue[];
	/** Breadcrumbs leading up to the error */
	readonly breadcrumbs: readonly Breadcrumb[];
	/** Environment (optional) */
	readonly environment: string | undefined;
	/** Release version (optional) */
	readonly release: string | undefined;
	/** Event tags */
	readonly tags: Readonly<Record<string, string>>;
}

/**
 * Sentry API client service interface.
 */
export interface SentryServiceImpl {
	/**
	 * List issues for the configured organization/project/team.
	 *
	 * By default, fetches all pages of unresolved issues assigned to the team.
	 * Returns issues wrapped in IssueSource.Sentry for compatibility with
	 * the Glass domain model.
	 *
	 * @param options - Query options
	 * @returns Array of issues wrapped in IssueSource.Sentry
	 */
	readonly listIssues: (
		options?: ListIssuesOptions,
	) => Effect.Effect<readonly IssueSource[], SentryError>;

	/**
	 * Get a single issue by its Sentry ID.
	 *
	 * @param issueId - The Sentry issue ID (numeric string)
	 * @returns Issue wrapped in IssueSource.Sentry
	 */
	readonly getIssue: (issueId: string) => Effect.Effect<IssueSource, SentryError>;

	/**
	 * Get the latest event for an issue with full details.
	 *
	 * This includes the full stacktrace, breadcrumbs, and other
	 * context that isn't available in the issue list.
	 *
	 * @param issueId - The Sentry issue ID (numeric string)
	 * @returns Full event data including exceptions and breadcrumbs
	 */
	readonly getLatestEvent: (issueId: string) => Effect.Effect<SentryEventData, SentryError>;
}

/**
 * Service tag for the SentryService.
 */
export class SentryService extends Context.Tag("glass/SentryService")<
	SentryService,
	SentryServiceImpl
>() {}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the base URL for the configured region.
 */
const getBaseUrl = (region: "us" | "de"): string =>
	region === "de" ? SENTRY_DE_BASE_URL : SENTRY_US_BASE_URL;

/**
 * Map HTTP errors to SentryError.
 */
const mapHttpError = (
	error: HttpClientError.HttpClientError,
	resource: "issue" | "event" | "project" | "organization" = "issue",
	id = "unknown",
): SentryError => {
	// Handle response errors (we got a response, but it indicates an error)
	if (error._tag === "ResponseError") {
		const status = error.response.status;

		if (status === 401 || status === 403) {
			return SentryError.AuthError({
				status,
				message: status === 401 ? "Invalid or missing auth token" : "Access forbidden",
			});
		}

		if (status === 404) {
			return SentryError.NotFoundError({ resource, id });
		}

		if (status === 429) {
			const headers = error.response.headers;
			const resetHeader = headers["x-sentry-rate-limit-reset"];
			const limitHeader = headers["x-sentry-rate-limit-limit"];
			const remainingHeader = headers["x-sentry-rate-limit-remaining"];

			return SentryError.RateLimitError({
				resetAt: resetHeader ? new Date(Number(resetHeader) * 1000) : new Date(),
				limit: limitHeader ? Number(limitHeader) : 0,
				remaining: remainingHeader ? Number(remainingHeader) : 0,
			});
		}

		return SentryError.ApiError({
			status,
			message: error.message,
		});
	}

	// Handle request errors (couldn't make the request)
	return SentryError.NetworkError({
		message: error.message,
		cause: error,
	});
};

/**
 * Convert API stack frame to domain stack frame.
 */
const convertStackFrame = (apiFrame: ApiStackFrame): StackFrame => {
	const frame: StackFrame = {
		filename: apiFrame.filename,
		absPath: apiFrame.absPath,
		function: apiFrame.function,
		module: apiFrame.module,
		lineNo: apiFrame.lineNo,
		colNo: apiFrame.colNo,
		inApp: apiFrame.inApp,
	};

	// Only add optional fields if they have values
	if (apiFrame.context && apiFrame.context.length > 0) {
		return { ...frame, context: apiFrame.context };
	}
	if (apiFrame.vars) {
		return { ...frame, vars: apiFrame.vars };
	}

	return frame;
};

/**
 * Convert API stacktrace to domain stacktrace.
 */
const convertStacktrace = (apiStacktrace: ApiStacktrace): Stacktrace => ({
	frames: apiStacktrace.frames.map(convertStackFrame),
	hasSystemFrames: apiStacktrace.hasSystemFrames,
});

/**
 * Convert API exception value to domain exception value.
 */
const convertExceptionValue = (apiException: ApiExceptionValue): ExceptionValue => ({
	type: apiException.type,
	value: apiException.value,
	module: apiException.module,
	mechanism: apiException.mechanism
		? {
				type: apiException.mechanism.type,
				handled: apiException.mechanism.handled,
			}
		: null,
	stacktrace: apiException.stacktrace ? convertStacktrace(apiException.stacktrace) : null,
});

/**
 * Convert API breadcrumb to domain breadcrumb.
 */
const convertBreadcrumb = (apiBreadcrumb: ApiBreadcrumb): Breadcrumb => {
	const breadcrumb: Breadcrumb = {
		type: apiBreadcrumb.type,
		category: apiBreadcrumb.category,
		level: apiBreadcrumb.level,
		message: apiBreadcrumb.message,
		timestamp: apiBreadcrumb.timestamp,
	};

	if (apiBreadcrumb.data) {
		return { ...breadcrumb, data: apiBreadcrumb.data };
	}

	return breadcrumb;
};

/**
 * Extract exceptions from event entries.
 */
const extractExceptions = (entries: readonly GenericEntry[]): readonly ExceptionValue[] => {
	for (const entry of entries) {
		if (entry.type === "exception" && typeof entry.data === "object" && entry.data !== null) {
			const data = entry.data as { values?: unknown[] };
			if (Array.isArray(data.values)) {
				return data.values
					.filter((v): v is ApiExceptionValue => typeof v === "object" && v !== null)
					.map(convertExceptionValue);
			}
		}
	}
	return [];
};

/**
 * Extract breadcrumbs from event entries.
 */
const extractBreadcrumbs = (entries: readonly GenericEntry[]): readonly Breadcrumb[] => {
	for (const entry of entries) {
		if (entry.type === "breadcrumbs" && typeof entry.data === "object" && entry.data !== null) {
			const data = entry.data as { values?: unknown[] };
			if (Array.isArray(data.values)) {
				return data.values
					.filter((v): v is ApiBreadcrumb => typeof v === "object" && v !== null)
					.map(convertBreadcrumb);
			}
		}
	}
	return [];
};

/**
 * Extract environment from event tags.
 */
const extractEnvironment = (
	tags: readonly { key: string; value: string }[],
): string | undefined => {
	const envTag = tags.find((t) => t.key === "environment");
	return envTag?.value;
};

/**
 * Extract tags as a record.
 */
const extractTags = (tags: readonly { key: string; value: string }[]): Record<string, string> => {
	const result: Record<string, string> = {};
	for (const tag of tags) {
		result[tag.key] = tag.value;
	}
	return result;
};

/**
 * Build metadata object, only including defined properties.
 */
const buildMetadata = (issue: {
	metadata: { type: string; value: string; filename: string; function: string };
}): SentrySourceData["metadata"] => {
	const metadata: {
		type?: string;
		value?: string;
		filename?: string;
		function?: string;
	} = {};

	if (issue.metadata.type) {
		metadata.type = issue.metadata.type;
	}
	if (issue.metadata.value) {
		metadata.value = issue.metadata.value;
	}
	if (issue.metadata.filename) {
		metadata.filename = issue.metadata.filename;
	}
	if (issue.metadata.function) {
		metadata.function = issue.metadata.function;
	}

	return metadata;
};

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Create the SentryService implementation.
 */
const make = Effect.gen(function* () {
	const config = yield* Config;
	const sentryConfig = getSentryConfig(config);
	const httpClient = yield* HttpClient.HttpClient;

	const baseUrl = getBaseUrl(sentryConfig.region);
	const authToken = Redacted.value(sentryConfig.authToken);

	// Create a configured HTTP client with auth header
	const client = httpClient.pipe(
		HttpClient.mapRequest(HttpClientRequest.setHeader("Authorization", `Bearer ${authToken}`)),
	);

	/**
	 * Make an authenticated request to the Sentry API.
	 */
	const request = <A, I>(
		path: string,
		schema: Schema.Schema<A, I>,
		resource: "issue" | "event" | "project" | "organization" = "issue",
		id = "unknown",
	): Effect.Effect<{ data: A; headers: Record<string, string> }, SentryError> =>
		Effect.gen(function* () {
			const url = `${baseUrl}${path}`;

			const response = yield* client
				.get(url)
				.pipe(Effect.mapError((error) => mapHttpError(error, resource, id)));

			// Check for non-2xx status
			if (response.status >= 400) {
				return yield* Effect.fail(
					mapHttpError(
						new HttpClientError.ResponseError({
							request: HttpClientRequest.get(url),
							response,
							reason: "StatusCode",
							description: `HTTP ${response.status}`,
						}),
						resource,
						id,
					),
				);
			}

			const json = yield* response.json.pipe(
				Effect.mapError(
					(): SentryError =>
						SentryError.ApiError({
							status: response.status,
							message: "Failed to parse response JSON",
						}),
				),
			);

			const data = yield* Schema.decodeUnknown(schema)(json).pipe(
				Effect.mapError(
					(error): SentryError =>
						SentryError.ApiError({
							status: response.status,
							message: `Schema validation failed: ${error.message}`,
						}),
				),
			);

			return { data, headers: response.headers };
		});

	/**
	 * List issues with pagination.
	 */
	const listIssues: SentryServiceImpl["listIssues"] = (options) =>
		Effect.gen(function* () {
			const query = options?.query ?? `is:unresolved assigned:#${sentryConfig.team}`;
			const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
			const fetchAllPages = options?.fetchAllPages ?? true;

			const allIssues: IssueSource[] = [];
			let cursor: string | undefined;
			let pageCount = 0;

			do {
				const queryParams = new URLSearchParams({
					query,
					limit: String(limit),
					...(cursor ? { cursor } : {}),
				});

				const path = `/organizations/${sentryConfig.organization}/issues/?${queryParams}`;

				const { data: issues, headers } = yield* request(
					path,
					Schema.Array(SentryIssueSchema),
					"organization",
					sentryConfig.organization,
				);

				// Convert to domain types
				for (const issue of issues) {
					const sourceData: SentrySourceData = {
						sentryId: issue.id,
						title: issue.title,
						shortId: issue.shortId,
						culprit: issue.culprit,
						firstSeen: new Date(issue.firstSeen),
						lastSeen: new Date(issue.lastSeen),
						count: Number.parseInt(issue.count, 10),
						userCount: issue.userCount,
						metadata: buildMetadata(issue),
					};

					allIssues.push(
						IssueSourceEnum.Sentry({
							project: issue.project.slug,
							data: sourceData,
						}),
					);
				}

				// Check for more pages
				const links = parseLinkHeader(headers.link);
				cursor = fetchAllPages && hasNextPage(links) ? getNextCursor(links) : undefined;
				pageCount++;
			} while (cursor && pageCount < MAX_PAGES);

			return allIssues;
		});

	/**
	 * Get a single issue by ID.
	 */
	const getIssue: SentryServiceImpl["getIssue"] = (issueId) =>
		Effect.gen(function* () {
			const path = `/organizations/${sentryConfig.organization}/issues/${issueId}/`;

			const { data: issue } = yield* request(path, SentryIssueSchema, "issue", issueId);

			const sourceData: SentrySourceData = {
				sentryId: issue.id,
				title: issue.title,
				shortId: issue.shortId,
				culprit: issue.culprit,
				firstSeen: new Date(issue.firstSeen),
				lastSeen: new Date(issue.lastSeen),
				count: Number.parseInt(issue.count, 10),
				userCount: issue.userCount,
				metadata: buildMetadata(issue),
			};

			return IssueSourceEnum.Sentry({
				project: issue.project.slug,
				data: sourceData,
			});
		});

	/**
	 * Get the latest event for an issue.
	 */
	const getLatestEvent: SentryServiceImpl["getLatestEvent"] = (issueId) =>
		Effect.gen(function* () {
			const path = `/organizations/${sentryConfig.organization}/issues/${issueId}/events/latest/`;

			const { data: event } = yield* request(path, SentryEventSchema, "event", issueId);

			// Extract release version from various formats
			let release: string | undefined;
			if (event.release) {
				if (typeof event.release === "string") {
					release = event.release;
				} else {
					release = event.release.version;
				}
			}

			const eventData: SentryEventData = {
				eventId: event.eventID,
				title: event.title,
				message: event.message,
				platform: event.platform,
				dateCreated: event.dateCreated,
				culprit: event.culprit,
				exceptions: extractExceptions(event.entries),
				breadcrumbs: extractBreadcrumbs(event.entries),
				environment: extractEnvironment(event.tags),
				release,
				tags: extractTags(event.tags),
			};

			return eventData;
		});

	return {
		listIssues,
		getIssue,
		getLatestEvent,
	} satisfies SentryServiceImpl;
});

// =============================================================================
// Layer
// =============================================================================

/**
 * Layer that provides the SentryService.
 *
 * Requires:
 * - Config: Glass configuration with Sentry settings
 * - HttpClient: Effect HTTP client for making requests
 */
export const SentryServiceLive: Layer.Layer<SentryService, never, Config | HttpClient.HttpClient> =
	Layer.effect(SentryService, make);
