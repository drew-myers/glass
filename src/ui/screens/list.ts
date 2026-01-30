/**
 * @fileoverview Issue list screen component.
 *
 * Displays a scrollable list of issues with status indicators, event counts,
 * and relative timestamps. Supports keyboard navigation with a sliding window
 * approach for handling lists longer than the visible area.
 */

import { Box, Text, fg, t } from "@opentui/core";
import type { VNode } from "@opentui/core";
import type { Issue } from "../../domain/issue.js";
import { getSourceCommon } from "../../domain/issue.js";
import { formatRelativeTime } from "../../lib/time.js";
import { colors, getStatusColor, getStatusIcon, semanticColors } from "../theme.js";

// =============================================================================
// Constants
// =============================================================================

/** Fixed column widths for consistent layout */
const COLUMN_WIDTHS = {
	/** Status icon column */
	status: 3,
	/** Event count column */
	events: 8,
	/** Last seen timestamp column */
	lastSeen: 10,
} as const;

/** Spinner frames for loading animation */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

// =============================================================================
// Props
// =============================================================================

/**
 * Props for the IssueList component.
 */
export interface IssueListProps {
	/** Array of issues to display */
	readonly issues: readonly Issue[];
	/** Currently selected issue index */
	readonly selectedIndex: number;
	/** First visible issue index (for windowing) */
	readonly windowStart: number;
	/** Number of issues visible in the window */
	readonly visibleCount: number;
	/** Whether data is currently loading */
	readonly isLoading: boolean;
	/** Current spinner frame index (0-9) */
	readonly spinnerFrame: number;
	/** Error message to display, if any */
	readonly error: string | null;
}

/**
 * Props for a single issue row.
 */
interface IssueRowProps {
	/** The issue to display */
	readonly issue: Issue;
	/** Whether this row is selected */
	readonly isSelected: boolean;
}

// =============================================================================
// Components
// =============================================================================

/**
 * Renders the column header row.
 */
function ListHeader(): VNode {
	return Box(
		{
			width: "100%",
			height: 1,
			flexDirection: "row",
			paddingLeft: 1,
			paddingRight: 1,
		},
		// Status column header
		Text({
			content: t`${fg(colors.fgDim)("STS")}`,
			width: COLUMN_WIDTHS.status,
		}),
		// Issue title column header (flex to fill remaining space)
		Box(
			{ flexGrow: 1, paddingLeft: 1 },
			Text({
				content: t`${fg(colors.fgDim)("ISSUE")}`,
			}),
		),
		// Events column header
		Text({
			content: t`${fg(colors.fgDim)("EVENTS")}`,
			width: COLUMN_WIDTHS.events,
		}),
		// Last seen column header
		Text({
			content: t`${fg(colors.fgDim)("LAST SEEN")}`,
			width: COLUMN_WIDTHS.lastSeen,
		}),
	);
}

/**
 * Renders a single issue row.
 */
function IssueRow({ issue, isSelected }: IssueRowProps): VNode {
	const common = getSourceCommon(issue.source);
	const stateTag = issue.state._tag;
	const statusIcon = getStatusIcon(stateTag);
	const statusColor = getStatusColor(stateTag);

	// Format event count with K suffix for thousands
	const formatCount = (count: number | undefined): string => {
		if (count === undefined) return "-";
		if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return String(count);
	};

	// Build row options based on selection
	// Explicit height: 1 ensures each row is exactly one line
	const rowOptions = isSelected
		? {
				width: "100%" as const,
				height: 1 as const,
				flexDirection: "row" as const,
				backgroundColor: colors.bgHighlight,
				paddingLeft: 1,
				paddingRight: 1,
			}
		: {
				width: "100%" as const,
				height: 1 as const,
				flexDirection: "row" as const,
				paddingLeft: 1,
				paddingRight: 1,
			};

	return Box(
		rowOptions,
		// Status icon
		Text({
			content: t`${fg(statusColor)(statusIcon)}`,
			width: COLUMN_WIDTHS.status,
		}),
		// Issue title (truncated to fit)
		Box(
			{ flexGrow: 1, paddingLeft: 1 },
			Text({
				content: t`${fg(isSelected ? colors.fg : colors.fgDim)(common.title)}`,
			}),
		),
		// Event count
		Text({
			content: t`${fg(colors.fgDim)(formatCount(common.count).padStart(COLUMN_WIDTHS.events - 1))}`,
			width: COLUMN_WIDTHS.events,
		}),
		// Last seen
		Text({
			content: t`${fg(colors.fgDim)(formatRelativeTime(common.lastSeen).padStart(COLUMN_WIDTHS.lastSeen - 1))}`,
			width: COLUMN_WIDTHS.lastSeen,
		}),
	);
}

/**
 * Renders the empty state when no issues are loaded.
 */
function EmptyState(): VNode {
	return Box(
		{
			width: "100%",
			flexGrow: 1,
			flexDirection: "column",
			justifyContent: "center",
			alignItems: "center",
		},
		Text({
			content: t`${fg(colors.fgDim)("No issues loaded")}`,
		}),
		Text({
			content: t`${fg(colors.fgMuted)("Press 'r' to refresh")}`,
		}),
	);
}

/**
 * Gets the spinner character for a given frame.
 */
const getSpinnerChar = (frame: number): string => {
	const index = frame % SPINNER_FRAMES.length;
	return SPINNER_FRAMES[index] ?? SPINNER_FRAMES[0];
};

/**
 * Renders a loading indicator with spinner.
 */
function LoadingIndicator({ frame }: { frame: number }): VNode {
	const spinner = getSpinnerChar(frame);

	return Box(
		{
			width: "100%",
			flexDirection: "row",
			justifyContent: "center",
			paddingTop: 1,
		},
		Text({
			content: t`${fg(colors.accent)(spinner)} ${fg(colors.fgDim)("Loading issues...")}`,
		}),
	);
}

/**
 * Renders an error banner.
 */
function ErrorBanner({ message }: { message: string }): VNode {
	return Box(
		{
			width: "100%",
			backgroundColor: colors.bgPanel,
			paddingLeft: 1,
			paddingRight: 1,
		},
		Text({
			content: t`${fg(semanticColors.error)("Error:")} ${fg(colors.fgDim)(message)}`,
		}),
	);
}

/**
 * Main issue list component.
 *
 * Displays a windowed view of issues with:
 * - Column headers
 * - Selectable issue rows with status indicators
 * - Loading spinner when fetching
 * - Error banner when fetch fails
 * - Empty state when no issues
 */
export function IssueList(props: IssueListProps): VNode {
	const { issues, selectedIndex, windowStart, visibleCount, isLoading, spinnerFrame, error } =
		props;

	// Calculate visible window of issues
	const visibleIssues = issues.slice(windowStart, windowStart + visibleCount);

	// Build the list content
	const listContent: VNode[] = [];

	// Add header
	listContent.push(ListHeader());

	// Add visible issue rows
	for (let i = 0; i < visibleIssues.length; i++) {
		const issue = visibleIssues[i];
		if (issue) {
			const globalIndex = windowStart + i;
			listContent.push(IssueRow({ issue, isSelected: globalIndex === selectedIndex }));
		}
	}

	return Box(
		{
			width: "100%",
			height: "100%",
			flexDirection: "column",
		},
		// Error banner at top if there's an error
		...(error ? [ErrorBanner({ message: error })] : []),

		// Loading indicator or list content
		isLoading && issues.length === 0
			? LoadingIndicator({ frame: spinnerFrame })
			: issues.length === 0
				? EmptyState()
				: Box(
						{
							width: "100%",
							flexGrow: 1,
							flexDirection: "column",
						},
						...listContent,
					),

		// Loading indicator at bottom when refreshing existing list
		...(isLoading && issues.length > 0
			? [
					Box(
						{
							width: "100%",
							flexDirection: "row",
							paddingLeft: 1,
						},
						Text({
							content: t`${fg(colors.accent)(getSpinnerChar(spinnerFrame))} ${fg(colors.fgMuted)("Refreshing...")}`,
						}),
					),
				]
			: []),
	);
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Calculates the window start position to keep the selected item visible.
 *
 * @param selectedIndex - Currently selected index
 * @param currentWindowStart - Current window start position
 * @param visibleCount - Number of visible items
 * @param totalCount - Total number of items
 * @returns New window start position
 */
export const calculateWindowStart = (
	selectedIndex: number,
	currentWindowStart: number,
	visibleCount: number,
	totalCount: number,
): number => {
	// Handle empty list
	if (totalCount === 0) {
		return 0;
	}

	// Clamp selectedIndex to valid range
	const clampedIndex = Math.max(0, Math.min(selectedIndex, totalCount - 1));

	// If selection is above the window, scroll up
	if (clampedIndex < currentWindowStart) {
		return clampedIndex;
	}

	// If selection is below the window, scroll down
	if (clampedIndex >= currentWindowStart + visibleCount) {
		return clampedIndex - visibleCount + 1;
	}

	// Selection is visible, keep current window
	// But ensure window doesn't extend past the end
	const maxWindowStart = Math.max(0, totalCount - visibleCount);
	return Math.min(currentWindowStart, maxWindowStart);
};
