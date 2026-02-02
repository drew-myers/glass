/**
 * @fileoverview Formatting utilities for prompt construction.
 *
 * Pure functions that transform domain types into human-readable
 * markdown strings for agent prompts.
 *
 * @module
 */

import type {
	Breadcrumb,
	ContextInfo,
	ExceptionValue,
	RequestInfo,
	StackFrame,
	UserInfo,
} from "../../domain/issue.js";

// =============================================================================
// Stack Frames & Traces
// =============================================================================

/**
 * Format a single stack frame for display.
 *
 * Example output:
 * ```
 *   at processRequest (src/handlers/api.ts:42:15)
 *      40 |   const data = await fetch(url);
 *      41 |   if (!data.ok) {
 *   >  42 |     throw new ApiError(data.status);
 *      43 |   }
 *      44 |   return data.json();
 * ```
 */
export const formatStackFrame = (frame: StackFrame, options?: { includeContext?: boolean }): string => {
	const { includeContext = true } = options ?? {};
	const parts: string[] = [];

	// Location line
	const func = frame.function ?? "<anonymous>";
	const file = frame.absPath ?? frame.filename;
	const location = frame.lineNo
		? frame.colNo
			? `${file}:${frame.lineNo}:${frame.colNo}`
			: `${file}:${frame.lineNo}`
		: file;

	const inAppMarker = frame.inApp ? "" : " [library]";
	parts.push(`  at ${func} (${location})${inAppMarker}`);

	// Source context if available
	if (includeContext && frame.context && frame.context.length > 0) {
		for (const [lineNo, code] of frame.context) {
			const marker = lineNo === frame.lineNo ? ">" : " ";
			const lineNum = String(lineNo).padStart(6);
			parts.push(`${marker}${lineNum} | ${code}`);
		}
	}

	// Local variables if available
	if (frame.vars && Object.keys(frame.vars).length > 0) {
		parts.push("     locals:");
		for (const [key, value] of Object.entries(frame.vars)) {
			const valueStr = typeof value === "string" ? value : JSON.stringify(value);
			// Truncate long values
			const truncated = valueStr.length > 100 ? `${valueStr.slice(0, 100)}...` : valueStr;
			parts.push(`       ${key} = ${truncated}`);
		}
	}

	return parts.join("\n");
};

/**
 * Format an exception with its stacktrace.
 *
 * Frames are reversed to show most recent call first (standard stacktrace order).
 */
export const formatException = (exception: ExceptionValue): string => {
	const parts: string[] = [];

	// Exception header
	const module = exception.module ? `${exception.module}.` : "";
	parts.push(`${module}${exception.type}: ${exception.value}`);

	// Mechanism info
	if (exception.mechanism) {
		const handled = exception.mechanism.handled ? "handled" : "unhandled";
		parts.push(`  (${exception.mechanism.type}, ${handled})`);
	}

	// Stacktrace (reversed - most recent first)
	if (exception.stacktrace?.frames) {
		parts.push("");
		// Sentry stores frames oldest-first, we want newest-first
		const frames = [...exception.stacktrace.frames].reverse();
		for (const frame of frames) {
			parts.push(formatStackFrame(frame));
		}
	}

	return parts.join("\n");
};

/**
 * Format multiple exceptions (e.g., chained exceptions).
 */
export const formatExceptions = (exceptions: readonly ExceptionValue[]): string => {
	if (exceptions.length === 0) return "No exception data available.";

	// Exceptions are typically stored innermost-first in Sentry
	// We reverse to show the root cause last (more natural reading)
	const formatted = [...exceptions].reverse().map((ex, i) => {
		const prefix = i === 0 ? "" : `\nCaused by:\n`;
		return prefix + formatException(ex);
	});

	return formatted.join("\n");
};

// =============================================================================
// Breadcrumbs
// =============================================================================

/**
 * Format a single breadcrumb.
 *
 * Example output:
 * ```
 * [14:32:01] http (info): GET /api/users -> 200
 * [14:32:02] ui.click (info): button#submit clicked
 * ```
 */
export const formatBreadcrumb = (breadcrumb: Breadcrumb): string => {
	// Extract time from ISO timestamp
	const time = breadcrumb.timestamp.includes("T")
		? breadcrumb.timestamp.split("T")[1]?.slice(0, 8) ?? breadcrumb.timestamp
		: breadcrumb.timestamp;

	const level = breadcrumb.level !== "info" ? ` (${breadcrumb.level})` : "";
	const category = breadcrumb.category || breadcrumb.type;

	let message = breadcrumb.message ?? "";

	// Enrich message with data for common types
	if (breadcrumb.data) {
		if (breadcrumb.type === "http" || breadcrumb.category === "http") {
			const method = breadcrumb.data.method ?? "";
			const url = breadcrumb.data.url ?? "";
			const statusCode = breadcrumb.data.status_code ?? breadcrumb.data.statusCode ?? "";
			if (method || url) {
				message = `${method} ${url}${statusCode ? ` -> ${statusCode}` : ""}`;
			}
		} else if (breadcrumb.category === "console") {
			// Console logs often have the message in data
			message = message || String(breadcrumb.data.message ?? breadcrumb.data.arguments ?? "");
		}
	}

	return `[${time}] ${category}${level}: ${message}`.trim();
};

/**
 * Format breadcrumbs as a timeline.
 * Shows most recent breadcrumbs (up to limit).
 */
export const formatBreadcrumbs = (
	breadcrumbs: readonly Breadcrumb[],
	options?: { limit?: number },
): string => {
	const { limit = 30 } = options ?? {};

	if (breadcrumbs.length === 0) return "No breadcrumbs available.";

	// Take most recent breadcrumbs
	const recent = breadcrumbs.slice(-limit);
	const omitted = breadcrumbs.length - recent.length;

	const lines: string[] = [];
	if (omitted > 0) {
		lines.push(`... ${omitted} earlier breadcrumbs omitted ...`);
	}

	for (const crumb of recent) {
		lines.push(formatBreadcrumb(crumb));
	}

	return lines.join("\n");
};

// =============================================================================
// Request Info
// =============================================================================

/**
 * Format HTTP request information.
 */
export const formatRequest = (request: RequestInfo): string => {
	const parts: string[] = [];

	parts.push(`${request.method ?? "GET"} ${request.url}`);

	if (request.query && request.query.length > 0) {
		parts.push("\nQuery Parameters:");
		for (const [key, value] of request.query) {
			parts.push(`  ${key}: ${value}`);
		}
	}

	if (request.headers && request.headers.length > 0) {
		parts.push("\nHeaders:");
		for (const [key, value] of request.headers) {
			// Skip potentially sensitive headers
			if (key.toLowerCase().includes("auth") || key.toLowerCase().includes("cookie")) {
				parts.push(`  ${key}: [redacted]`);
			} else {
				parts.push(`  ${key}: ${value}`);
			}
		}
	}

	if (request.data) {
		parts.push("\nBody:");
		const body = typeof request.data === "string" ? request.data : JSON.stringify(request.data, null, 2);
		// Truncate very long bodies
		const truncated = body.length > 500 ? `${body.slice(0, 500)}...\n[truncated]` : body;
		parts.push(truncated);
	}

	return parts.join("\n");
};

// =============================================================================
// User & Context Info
// =============================================================================

/**
 * Format user information.
 */
export const formatUser = (user: UserInfo): string => {
	const parts: string[] = [];

	if (user.id) parts.push(`ID: ${user.id}`);
	if (user.email) parts.push(`Email: ${user.email}`);
	if (user.username) parts.push(`Username: ${user.username}`);
	if (user.ipAddress) parts.push(`IP: ${user.ipAddress}`);
	if (user.geo) {
		const geo = [user.geo.city, user.geo.region, user.geo.countryCode].filter(Boolean).join(", ");
		if (geo) parts.push(`Location: ${geo}`);
	}

	return parts.length > 0 ? parts.join("\n") : "No user information available.";
};

/**
 * Format runtime context information.
 */
export const formatContexts = (contexts: ContextInfo): string => {
	const parts: string[] = [];

	if (contexts.browser) {
		const browser = [contexts.browser.name, contexts.browser.version].filter(Boolean).join(" ");
		if (browser) parts.push(`Browser: ${browser}`);
	}

	if (contexts.os) {
		const os = [contexts.os.name, contexts.os.version].filter(Boolean).join(" ");
		if (os) parts.push(`OS: ${os}`);
	}

	if (contexts.device) {
		const device = [contexts.device.brand, contexts.device.model, contexts.device.family]
			.filter(Boolean)
			.join(" ");
		if (device) parts.push(`Device: ${device}`);
	}

	if (contexts.runtime) {
		const runtime = [contexts.runtime.name, contexts.runtime.version].filter(Boolean).join(" ");
		if (runtime) parts.push(`Runtime: ${runtime}`);
	}

	return parts.length > 0 ? parts.join("\n") : "";
};

// =============================================================================
// Tags
// =============================================================================

/**
 * Format tags as a simple list.
 */
export const formatTags = (tags: Readonly<Record<string, string>>): string => {
	const entries = Object.entries(tags);
	if (entries.length === 0) return "";

	// Sort by key for consistent ordering
	entries.sort(([a], [b]) => a.localeCompare(b));

	return entries.map(([key, value]) => `${key}: ${value}`).join("\n");
};
