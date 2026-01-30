/**
 * @fileoverview Effect Schemas for Sentry API responses.
 *
 * These schemas define the shape of data returned by the Sentry API
 * and handle transformation to domain types.
 *
 * @module
 */

import { Schema } from "effect";

// =============================================================================
// Stack Frame & Stacktrace
// =============================================================================

/**
 * A single frame in a stacktrace.
 * Contains file location, function name, and optional source context.
 */
export const StackFrameSchema = Schema.Struct({
	/** Relative or short filename */
	filename: Schema.String,
	/** Full absolute path or URL */
	absPath: Schema.NullOr(Schema.String),
	/** Function/method name */
	function: Schema.NullOr(Schema.String),
	/** Module/package name */
	module: Schema.NullOr(Schema.String),
	/** Line number (1-indexed) */
	lineNo: Schema.NullOr(Schema.Number),
	/** Column number (1-indexed) */
	colNo: Schema.NullOr(Schema.Number),
	/** Whether this frame is from user code (vs library) */
	inApp: Schema.Boolean,
	/** Source code context: array of [lineNo, code] tuples */
	context: Schema.optionalWith(Schema.Array(Schema.Tuple(Schema.Number, Schema.String)), {
		default: () => [],
	}),
	/** Local variables captured at this frame */
	vars: Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

export type StackFrame = typeof StackFrameSchema.Type;

/**
 * A stacktrace consisting of multiple frames.
 * Frames are ordered from oldest to newest (caller to callee).
 */
export const StacktraceSchema = Schema.Struct({
	frames: Schema.Array(StackFrameSchema),
	hasSystemFrames: Schema.Boolean,
	framesOmitted: Schema.NullOr(Schema.Array(Schema.Number)),
	registers: Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

export type Stacktrace = typeof StacktraceSchema.Type;

// =============================================================================
// Exception
// =============================================================================

/**
 * Exception mechanism info (how the exception was captured).
 */
export const MechanismSchema = Schema.Struct({
	type: Schema.String,
	handled: Schema.Boolean,
	data: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Unknown }), {
		default: () => ({}),
	}),
});

export type Mechanism = typeof MechanismSchema.Type;

/**
 * A single exception value with type, message, and stacktrace.
 */
export const ExceptionValueSchema = Schema.Struct({
	/** Exception class/type name (e.g., "TypeError", "ValueError") */
	type: Schema.String,
	/** Exception message */
	value: Schema.String,
	/** Module where exception is defined */
	module: Schema.NullOr(Schema.String),
	/** Thread ID if from a multi-threaded context */
	threadId: Schema.NullOr(Schema.String),
	/** How the exception was captured */
	mechanism: Schema.NullOr(MechanismSchema),
	/** Stacktrace at the point of the exception */
	stacktrace: Schema.NullOr(StacktraceSchema),
});

export type ExceptionValue = typeof ExceptionValueSchema.Type;

// =============================================================================
// Breadcrumbs
// =============================================================================

/**
 * A breadcrumb representing an event that happened before the error.
 * Used to understand the sequence of actions leading to an error.
 */
export const BreadcrumbSchema = Schema.Struct({
	/** Breadcrumb type (e.g., "default", "http", "navigation") */
	type: Schema.String,
	/** Category for grouping (e.g., "xhr", "console", "ui.click") */
	category: Schema.String,
	/** Severity level */
	level: Schema.String,
	/** Human-readable message */
	message: Schema.NullOr(Schema.String),
	/** ISO 8601 timestamp */
	timestamp: Schema.String,
	/** Type-specific data */
	data: Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

export type Breadcrumb = typeof BreadcrumbSchema.Type;

// =============================================================================
// Event Entries
// =============================================================================

/**
 * Exception entry containing one or more exception values.
 */
export const ExceptionEntrySchema = Schema.Struct({
	type: Schema.Literal("exception"),
	data: Schema.Struct({
		values: Schema.Array(ExceptionValueSchema),
		excOmitted: Schema.NullOr(Schema.Unknown),
		hasSystemFrames: Schema.Boolean,
	}),
});

export type ExceptionEntry = typeof ExceptionEntrySchema.Type;

/**
 * Breadcrumbs entry containing the trail of events.
 */
export const BreadcrumbsEntrySchema = Schema.Struct({
	type: Schema.Literal("breadcrumbs"),
	data: Schema.Struct({
		values: Schema.Array(BreadcrumbSchema),
	}),
});

export type BreadcrumbsEntry = typeof BreadcrumbsEntrySchema.Type;

/**
 * HTTP request entry with request details.
 */
export const RequestEntrySchema = Schema.Struct({
	type: Schema.Literal("request"),
	data: Schema.Struct({
		url: Schema.String,
		method: Schema.NullOr(Schema.String),
		query: Schema.optionalWith(Schema.Array(Schema.Tuple(Schema.String, Schema.String)), {
			default: () => [],
		}),
		headers: Schema.optionalWith(Schema.Array(Schema.Tuple(Schema.String, Schema.String)), {
			default: () => [],
		}),
		cookies: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }),
		data: Schema.NullOr(Schema.Unknown),
		fragment: Schema.NullOr(Schema.String),
		env: Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
		inferredContentType: Schema.NullOr(Schema.String),
	}),
});

export type RequestEntry = typeof RequestEntrySchema.Type;

/**
 * Message entry for log-style events.
 */
export const MessageEntrySchema = Schema.Struct({
	type: Schema.Literal("message"),
	data: Schema.Struct({
		message: Schema.String,
		params: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }),
		formatted: Schema.NullOr(Schema.String),
	}),
});

export type MessageEntry = typeof MessageEntrySchema.Type;

/**
 * Generic entry for unknown entry types.
 * Sentry has many entry types; we capture unknown ones generically.
 */
export const GenericEntrySchema = Schema.Struct({
	type: Schema.String,
	data: Schema.Unknown,
});

export type GenericEntry = typeof GenericEntrySchema.Type;

// =============================================================================
// Issue List Item (from /organizations/{org}/issues/)
// =============================================================================

/**
 * Project reference in issue responses.
 */
export const ProjectRefSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	slug: Schema.String,
	platform: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
});

export type ProjectRef = typeof ProjectRefSchema.Type;

/**
 * Issue metadata with error type/value info.
 */
export const IssueMetadataSchema = Schema.Struct({
	type: Schema.optionalWith(Schema.String, { default: () => "" }),
	value: Schema.optionalWith(Schema.String, { default: () => "" }),
	filename: Schema.optionalWith(Schema.String, { default: () => "" }),
	function: Schema.optionalWith(Schema.String, { default: () => "" }),
	title: Schema.optionalWith(Schema.String, { default: () => "" }),
});

export type IssueMetadata = typeof IssueMetadataSchema.Type;

/**
 * Issue list item as returned by the Sentry API.
 * This is the shape from GET /organizations/{org}/issues/
 */
export const SentryIssueSchema = Schema.Struct({
	/** Sentry issue ID (numeric string) */
	id: Schema.String,
	/** Short display ID (e.g., "PROJ-123") */
	shortId: Schema.String,
	/** Issue title/summary */
	title: Schema.String,
	/** Culprit (usually file:function) */
	culprit: Schema.String,
	/** Permanent link to the issue */
	permalink: Schema.String,
	/** Log level (error, warning, info) */
	level: Schema.String,
	/** Issue status (unresolved, resolved, ignored) */
	status: Schema.String,
	/** Platform (python, javascript, etc.) */
	platform: Schema.NullOr(Schema.String),
	/** ISO 8601 timestamp of first occurrence */
	firstSeen: Schema.String,
	/** ISO 8601 timestamp of most recent occurrence */
	lastSeen: Schema.String,
	/** Event count (Sentry returns this as a string) */
	count: Schema.String,
	/** Number of affected users */
	userCount: Schema.Number,
	/** Issue metadata */
	metadata: IssueMetadataSchema,
	/** Project reference */
	project: ProjectRefSchema,
	/** Logger name if set */
	logger: Schema.NullOr(Schema.String),
	/** Issue type (error, default, etc.) */
	type: Schema.String,
	/** Whether the issue is bookmarked */
	isBookmarked: Schema.Boolean,
	/** Whether the issue is public */
	isPublic: Schema.Boolean,
	/** Whether user is subscribed to updates */
	isSubscribed: Schema.Boolean,
	/** Whether user has seen this issue */
	hasSeen: Schema.Boolean,
	/** Number of comments on the issue */
	numComments: Schema.Number,
	/** Assignee info if assigned */
	assignedTo: Schema.NullOr(
		Schema.Struct({
			type: Schema.String,
			id: Schema.String,
			name: Schema.String,
			email: Schema.optionalWith(Schema.String, { default: () => "" }),
		}),
	),
});

export type SentryIssue = typeof SentryIssueSchema.Type;

// =============================================================================
// Event (from /organizations/{org}/issues/{issue_id}/events/latest/)
// =============================================================================

/**
 * Tag key-value pair from an event.
 */
export const EventTagSchema = Schema.Struct({
	key: Schema.String,
	value: Schema.String,
	_meta: Schema.NullOr(Schema.Unknown),
});

export type EventTag = typeof EventTagSchema.Type;

/**
 * User context from an event.
 */
export const EventUserSchema = Schema.Struct({
	id: Schema.NullOr(Schema.String),
	email: Schema.NullOr(Schema.String),
	username: Schema.NullOr(Schema.String),
	name: Schema.NullOr(Schema.String),
	ip_address: Schema.NullOr(Schema.String),
	data: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Unknown }), {
		default: () => ({}),
	}),
});

export type EventUser = typeof EventUserSchema.Type;

/**
 * SDK info from an event.
 */
export const SdkInfoSchema = Schema.Struct({
	name: Schema.String,
	version: Schema.String,
});

export type SdkInfo = typeof SdkInfoSchema.Type;

/**
 * Full event as returned by the Sentry API.
 * This is the shape from GET /organizations/{org}/issues/{issue_id}/events/latest/
 */
export const SentryEventSchema = Schema.Struct({
	/** Event ID (UUID) */
	eventID: Schema.String,
	/** Issue/group ID this event belongs to */
	groupID: Schema.String,
	/** Same as eventID */
	id: Schema.String,
	/** Project ID */
	projectID: Schema.String,
	/** Event title */
	title: Schema.String,
	/** Event message (may be empty for exceptions) */
	message: Schema.String,
	/** Platform (python, javascript, etc.) */
	platform: Schema.String,
	/** Event type (error, default, transaction) */
	type: Schema.String,
	/** Event size in bytes */
	size: Schema.Number,
	/** ISO 8601 timestamp when event was created */
	dateCreated: Schema.String,
	/** ISO 8601 timestamp when event was received by Sentry */
	dateReceived: Schema.String,
	/** Culprit (file:function) */
	culprit: Schema.String,
	/** Location string (e.g., "file.py:123") */
	location: Schema.NullOr(Schema.String),
	/** Event metadata */
	metadata: IssueMetadataSchema,
	/** Event tags */
	tags: Schema.Array(EventTagSchema),
	/** User context */
	user: Schema.NullOr(EventUserSchema),
	/** Event entries (exceptions, breadcrumbs, request, etc.) */
	entries: Schema.Array(GenericEntrySchema),
	/** Additional contexts (browser, os, device, etc.) */
	contexts: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Unknown }), {
		default: () => ({}),
	}),
	/** Custom context data */
	context: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Unknown }), {
		default: () => ({}),
	}),
	/** Fingerprints used for issue grouping */
	fingerprints: Schema.Array(Schema.String),
	/** Errors during event processing */
	errors: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }),
	/** SDK info */
	sdk: Schema.NullOr(SdkInfoSchema),
	/** Release version */
	release: Schema.NullOr(
		Schema.Union(
			Schema.String,
			Schema.Struct({
				version: Schema.String,
				shortVersion: Schema.optionalWith(Schema.String, { default: () => "" }),
			}),
		),
	),
	/** Distribution */
	dist: Schema.NullOr(Schema.String),
});

export type SentryEvent = typeof SentryEventSchema.Type;

// =============================================================================
// Pagination
// =============================================================================

/**
 * Parsed Link header for pagination.
 */
export interface PaginationLink {
	readonly url: string;
	readonly rel: "previous" | "next";
	readonly results: boolean;
	readonly cursor: string;
}

/**
 * Parse the Link header from Sentry API responses.
 *
 * Format: `<URL>; rel="next"; results="true"; cursor="0:100:0"`
 *
 * @param linkHeader - The raw Link header value
 * @returns Array of parsed pagination links
 */
export const parseLinkHeader = (linkHeader: string | undefined): PaginationLink[] => {
	if (!linkHeader) return [];

	const links: PaginationLink[] = [];
	// Split on comma, but be careful of commas in URLs
	const parts = linkHeader.split(/,(?=\s*<)/);

	for (const part of parts) {
		// Match: <url>; rel="value"; results="value"; cursor="value"
		const urlMatch = part.match(/<([^>]+)>/);
		const relMatch = part.match(/rel="([^"]+)"/);
		const resultsMatch = part.match(/results="([^"]+)"/);
		const cursorMatch = part.match(/cursor="([^"]+)"/);

		if (urlMatch?.[1] && relMatch?.[1]) {
			links.push({
				url: urlMatch[1],
				rel: relMatch[1] as "previous" | "next",
				results: resultsMatch?.[1] === "true",
				cursor: cursorMatch?.[1] ?? "",
			});
		}
	}

	return links;
};

/**
 * Check if there are more results available (for pagination).
 */
export const hasNextPage = (links: PaginationLink[]): boolean =>
	links.some((link) => link.rel === "next" && link.results);

/**
 * Get the cursor for the next page.
 */
export const getNextCursor = (links: PaginationLink[]): string | undefined =>
	links.find((link) => link.rel === "next" && link.results)?.cursor;
