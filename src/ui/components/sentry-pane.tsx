/**
 * @fileoverview Sentry-specific detail pane component.
 *
 * Displays Sentry issue data including error details, stacktrace,
 * breadcrumbs, metadata, and stats. Uses simple text-per-line layout
 * to avoid rendering issues with nested boxes.
 */

import { For, type JSX, Show } from "solid-js";
import type {
	Breadcrumb,
	ExceptionValue,
	SentrySourceData,
	StackFrame,
} from "../../domain/issue.js";
import { formatRelativeTime } from "../../lib/time.js";
import { colors, semanticColors } from "../theme.js";

// =============================================================================
// Props
// =============================================================================

export interface SentryPaneProps {
	readonly data: SentrySourceData;
}

// =============================================================================
// Helpers
// =============================================================================

const truncate = (str: string, maxLen: number): string => {
	if (str.length <= maxLen) return str;
	return `${str.slice(0, maxLen - 1)}…`;
};

const formatTime = (timestamp: string): string => {
	try {
		const date = new Date(timestamp);
		return date.toLocaleTimeString("en-US", {
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	} catch {
		return timestamp.slice(11, 19);
	}
};

// =============================================================================
// Line Generators
// =============================================================================

interface Line {
	text: string;
	color: string;
	wrap?: boolean; // If true, use word wrap instead of truncate
}

/**
 * Generate lines for the error section.
 */
const generateErrorLines = (data: SentrySourceData): Line[] => {
	const lines: Line[] = [];

	lines.push({ text: "--- SENTRY ---", color: colors.fgDim });

	if (data.metadata.type) {
		lines.push({ text: `Type:    ${data.metadata.type}`, color: semanticColors.error });
	}
	if (data.metadata.value) {
		lines.push({ text: `Value:   ${truncate(data.metadata.value, 65)}`, color: colors.fg });
	}
	if (data.culprit) {
		lines.push({ text: `Culprit: ${truncate(data.culprit, 60)}`, color: colors.accent });
	}

	return lines;
};

/**
 * Generate lines for a stack frame.
 */
const generateFrameLines = (frame: StackFrame, isInApp: boolean): Line[] => {
	const lines: Line[] = [];

	// Location line - show last 2 path segments
	let filename = frame.filename || "<unknown>";
	if (filename.includes("/")) {
		filename = filename.split("/").slice(-2).join("/");
	}
	const lineNo = frame.lineNo !== null ? `:${frame.lineNo}` : "";
	const fn = frame.function || "<anonymous>";

	lines.push({
		text: `${filename}${lineNo} in ${fn}`,
		color: isInApp ? colors.accent : colors.fgDim,
	});

	// Context lines (only for in-app frames)
	if (isInApp && frame.context && frame.context.length > 0) {
		for (const [ctxLineNo, code] of frame.context) {
			const isCurrent = ctxLineNo === frame.lineNo;
			const prefix = isCurrent ? ">" : " ";
			const lineNum = String(ctxLineNo).padStart(4);
			lines.push({
				text: `  ${prefix} ${lineNum} | ${code}`,
				color: isCurrent ? colors.fg : colors.fgDim,
			});
		}
	}

	return lines;
};

/**
 * Generate lines for the stacktrace section.
 */
const generateStacktraceLines = (exceptions: readonly ExceptionValue[] | undefined): Line[] => {
	if (!exceptions || exceptions.length === 0) return [];

	const firstException = exceptions[0];
	if (!firstException?.stacktrace?.frames) return [];

	const allFrames = [...firstException.stacktrace.frames].reverse();
	const inAppFrames = allFrames.filter((f) => f.inApp);
	const libFrames = allFrames.filter((f) => !f.inApp);

	// Limit frames
	const frames = [...inAppFrames.slice(0, 10), ...libFrames.slice(0, 3)];

	const lines: Line[] = [];
	lines.push({ text: "", color: colors.fgDim }); // blank line
	lines.push({ text: "--- STACKTRACE ---", color: colors.fgDim });

	if (allFrames.length > frames.length) {
		lines.push({
			text: `  (${frames.length} of ${allFrames.length} frames, ${inAppFrames.length} in-app)`,
			color: colors.fgMuted,
		});
	}

	for (const frame of frames) {
		lines.push(...generateFrameLines(frame, frame.inApp));
	}

	return lines;
};

/**
 * Generate lines for the breadcrumbs section.
 */
const generateBreadcrumbLines = (breadcrumbs: readonly Breadcrumb[] | undefined): Line[] => {
	if (!breadcrumbs || breadcrumbs.length === 0) return [];

	const lines: Line[] = [];
	lines.push({ text: "", color: colors.fgDim }); // blank line
	lines.push({ text: "--- BREADCRUMBS ---", color: colors.fgDim });

	// Show last 15 breadcrumbs
	const limited = breadcrumbs.slice(-15);
	if (breadcrumbs.length > limited.length) {
		lines.push({
			text: `  (last ${limited.length} of ${breadcrumbs.length})`,
			color: colors.fgMuted,
		});
	}

	for (const bc of limited) {
		const time = formatTime(bc.timestamp);
		const cat = (bc.category || bc.type || "unknown").padEnd(12).slice(0, 12);
		const msg = bc.message || "";
		lines.push({
			text: `[${time}] ${cat} ${msg}`,
			color: colors.fgDim,
			wrap: true,
		});
	}

	return lines;
};

/**
 * Generate lines for the metadata section.
 */
const generateMetadataLines = (
	environment: string | undefined,
	release: string | undefined,
	tags: Readonly<Record<string, string>> | undefined,
): Line[] => {
	const lines: Line[] = [];

	const hasContent = environment || release || (tags && Object.keys(tags).length > 0);
	if (!hasContent) return [];

	lines.push({ text: "", color: colors.fgDim }); // blank line
	lines.push({ text: "--- METADATA ---", color: colors.fgDim });

	if (environment) {
		lines.push({ text: `environment    : ${truncate(environment, 50)}`, color: colors.fg });
	}
	if (release) {
		lines.push({ text: `release        : ${truncate(release, 50)}`, color: colors.fg });
	}

	if (tags) {
		const entries = Object.entries(tags).slice(0, 8);
		for (const [key, value] of entries) {
			// Use fixed width for key, replace dots with underscores for display
			const displayKey = key.replace(/\./g, "_");
			const k = displayKey.padEnd(15).slice(0, 15);
			lines.push({ text: `${k}: ${truncate(value, 50)}`, color: colors.fgDim });
		}
	}

	return lines;
};

/**
 * Generate lines for the stats section.
 */
const generateStatsLines = (data: SentrySourceData): Line[] => {
	const lines: Line[] = [];

	lines.push({ text: "", color: colors.fgDim }); // blank line
	lines.push({ text: "--- STATS ---", color: colors.fgDim });

	const events = String(data.count ?? 0);
	const users = String(data.userCount ?? 0);
	lines.push({
		text: `Events: ${events}   Users: ${users}`,
		color: colors.fg,
	});

	const first = formatRelativeTime(data.firstSeen);
	const last = formatRelativeTime(data.lastSeen);
	lines.push({
		text: `First:  ${first}   Last: ${last}`,
		color: colors.fgDim,
	});

	return lines;
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * Sentry detail pane - renders each line as individual text element.
 * Uses For loop for reactive updates and proper flexShrink for layout.
 *
 * Section order: Error > Stats > Metadata > Breadcrumbs > Stacktrace
 * (Short sections first, long stacktrace last)
 */
export const SentryPane = (props: SentryPaneProps): JSX.Element => {
	const allLines = () => [
		...generateErrorLines(props.data),
		...generateStatsLines(props.data),
		...generateMetadataLines(props.data.environment, props.data.release, props.data.tags),
		...generateBreadcrumbLines(props.data.breadcrumbs),
		...generateStacktraceLines(props.data.exceptions),
	];

	return (
		<box flexDirection="column" flexShrink={0}>
			<For each={allLines()}>
				{(line) => (
					<text fg={line.color} wrapMode={line.wrap ? "word" : "none"}>
						{line.text || " "}
					</text>
				)}
			</For>
		</box>
	);
};
