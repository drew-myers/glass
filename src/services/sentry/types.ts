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
 * Issue metadata type.
 */
export interface IssueMetadata {
	readonly type: string;
	readonly value: string;
	readonly filename: string;
	readonly function: string;
	readonly title: string;
}

/**
 * Helper: Schema for a string field that may be null, undefined, or string.
 * Decodes to empty string if null/undefined.
 */
const NullableString = Schema.transform(Schema.NullishOr(Schema.String), Schema.String, {
	strict: true,
	decode: (v) => v ?? "",
	encode: (v) => v,
});

/**
 * Helper: Schema for a string field with a custom default.
 */
const NullableStringWithDefault = (defaultValue: string) =>
	Schema.transform(Schema.NullishOr(Schema.String), Schema.String, {
		strict: true,
		decode: (v) => v ?? defaultValue,
		encode: (v) => v,
	});

/**
 * Schema for issue metadata.
 * All fields are optional with defaults since Sentry may return null or omit fields.
 * Extra fields (sdk, in_app_frame_mix, initial_priority, etc.) are ignored.
 */
export const IssueMetadataSchema = Schema.Struct({
	type: Schema.optionalWith(NullableString, { default: () => "" }),
	value: Schema.optionalWith(NullableString, { default: () => "" }),
	filename: Schema.optionalWith(NullableString, { default: () => "" }),
	function: Schema.optionalWith(NullableString, { default: () => "" }),
	title: Schema.optionalWith(NullableString, { default: () => "" }),
	// Ignore extra fields from API
	in_app_frame_mix: Schema.optional(Schema.Unknown),
	sdk: Schema.optional(Schema.Unknown),
	initial_priority: Schema.optional(Schema.Unknown),
});

/**
 * Issue list item as returned by the Sentry API.
 * This is the shape from GET /organizations/{org}/issues/
 *
 * Required fields: id, shortId, title, firstSeen, lastSeen, project
 * Optional fields have defaults for robustness.
 * Extra fields from API (stats, lifetime, filtered, etc.) are ignored.
 */
export const SentryIssueSchema = Schema.Struct({
	// Required fields - must be present
	id: Schema.String,
	shortId: Schema.String,
	title: Schema.String,
	firstSeen: Schema.String,
	lastSeen: Schema.String,
	project: ProjectRefSchema,

	// Optional string fields (may be null or missing)
	culprit: Schema.optionalWith(NullableString, { default: () => "" }),
	permalink: Schema.optionalWith(NullableString, { default: () => "" }),
	level: Schema.optionalWith(NullableStringWithDefault("error"), { default: () => "error" }),
	status: Schema.optionalWith(NullableStringWithDefault("unresolved"), {
		default: () => "unresolved",
	}),
	platform: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
	count: Schema.optionalWith(NullableStringWithDefault("0"), { default: () => "0" }),
	logger: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
	type: Schema.optionalWith(NullableStringWithDefault("error"), { default: () => "error" }),

	// Optional number fields
	userCount: Schema.optionalWith(Schema.Number, { default: () => 0 }),
	numComments: Schema.optionalWith(Schema.Number, { default: () => 0 }),

	// Optional boolean fields
	isBookmarked: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	isPublic: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	isSubscribed: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	hasSeen: Schema.optionalWith(Schema.Boolean, { default: () => false }),

	// Complex optional fields
	metadata: Schema.optionalWith(IssueMetadataSchema, {
		default: () => ({ type: "", value: "", filename: "", function: "", title: "" }),
	}),
	assignedTo: Schema.optionalWith(
		Schema.NullOr(
			Schema.Struct({
				type: Schema.String,
				id: Schema.String,
				name: Schema.String,
				email: Schema.optionalWith(Schema.String, { default: () => "" }),
			}),
		),
		{ default: () => null },
	),

	// Ignore extra fields from API that we don't use
	shareId: Schema.optional(Schema.Unknown),
	statusDetails: Schema.optional(Schema.Unknown),
	substatus: Schema.optional(Schema.Unknown),
	annotations: Schema.optional(Schema.Unknown),
	issueType: Schema.optional(Schema.Unknown),
	issueCategory: Schema.optional(Schema.Unknown),
	priority: Schema.optional(Schema.Unknown),
	priorityLockedAt: Schema.optional(Schema.Unknown),
	seerFixabilityScore: Schema.optional(Schema.Unknown),
	seerAutofixLastTriggered: Schema.optional(Schema.Unknown),
	isUnhandled: Schema.optional(Schema.Unknown),
	stats: Schema.optional(Schema.Unknown),
	lifetime: Schema.optional(Schema.Unknown),
	filtered: Schema.optional(Schema.Unknown),
	subscriptionDetails: Schema.optional(Schema.Unknown),
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
 * User geo location from an event.
 */
export const EventUserGeoSchema = Schema.Struct({
	country_code: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
	city: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
	region: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
});

/**
 * User context from an event.
 */
export const EventUserSchema = Schema.Struct({
	id: Schema.NullOr(Schema.String),
	email: Schema.NullOr(Schema.String),
	username: Schema.NullOr(Schema.String),
	name: Schema.NullOr(Schema.String),
	ip_address: Schema.NullOr(Schema.String),
	geo: Schema.optionalWith(Schema.NullOr(EventUserGeoSchema), { default: () => null }),
	data: Schema.optionalWith(
		Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
		{ default: () => null },
	),
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
