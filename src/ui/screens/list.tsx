/**
 * @fileoverview Issue list screen component.
 *
 * Displays a scrollable list of issues with status indicators, event counts,
 * and relative timestamps. Supports keyboard navigation with a sliding window
 * approach for handling lists longer than the visible area.
 */

import { type Accessor, For, type JSX, Show } from "solid-js";
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
// Helper Functions
// =============================================================================

/**
 * Format event count with K suffix for thousands.
 */
const formatCount = (count: number | undefined): string => {
	if (count === undefined) return "-";
	if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K`;
	}
	return String(count);
};

// =============================================================================
// Components
// =============================================================================

/**
 * Renders the column header row.
 */
const ListHeader = (): JSX.Element => {
	return (
		<box width="100%" height={1} flexDirection="row" paddingLeft={1} paddingRight={1}>
			{/* Status column header */}
			<text width={COLUMN_WIDTHS.status} fg={colors.fgDim}>
				STS
			</text>
			{/* Issue title column header (flex to fill remaining space) */}
			<box flexGrow={1} paddingLeft={1}>
				<text fg={colors.fgDim}>ISSUE</text>
			</box>
			{/* Events column header */}
			<text width={COLUMN_WIDTHS.events} fg={colors.fgDim}>
				EVENTS
			</text>
			{/* Last seen column header */}
			<text width={COLUMN_WIDTHS.lastSeen} fg={colors.fgDim}>
				LAST SEEN
			</text>
		</box>
	);
};

/**
 * Renders a single issue row.
 */
const IssueRow = (props: IssueRowProps): JSX.Element => {
	const common = () => getSourceCommon(props.issue.source);
	const stateTag = () => props.issue.state._tag;
	const statusIcon = () => getStatusIcon(stateTag());
	const statusColor = () => getStatusColor(stateTag());

	// Use Show to conditionally apply backgroundColor
	return (
		<Show
			when={props.isSelected}
			fallback={
				<box width="100%" height={1} flexDirection="row" paddingLeft={1} paddingRight={1}>
					<text width={COLUMN_WIDTHS.status} fg={statusColor()}>
						{statusIcon()}
					</text>
					<box flexGrow={1} paddingLeft={1}>
						<text fg={colors.fgDim}>{common().title}</text>
					</box>
					<text width={COLUMN_WIDTHS.events} fg={colors.fgDim}>
						{formatCount(common().count).padStart(COLUMN_WIDTHS.events - 1)}
					</text>
					<text width={COLUMN_WIDTHS.lastSeen} fg={colors.fgDim}>
						{formatRelativeTime(common().lastSeen).padStart(COLUMN_WIDTHS.lastSeen - 1)}
					</text>
				</box>
			}
		>
			<box
				width="100%"
				height={1}
				flexDirection="row"
				backgroundColor={colors.bgHighlight}
				paddingLeft={1}
				paddingRight={1}
			>
				<text width={COLUMN_WIDTHS.status} fg={statusColor()}>
					{statusIcon()}
				</text>
				<box flexGrow={1} paddingLeft={1}>
					<text fg={colors.fg}>{common().title}</text>
				</box>
				<text width={COLUMN_WIDTHS.events} fg={colors.fgDim}>
					{formatCount(common().count).padStart(COLUMN_WIDTHS.events - 1)}
				</text>
				<text width={COLUMN_WIDTHS.lastSeen} fg={colors.fgDim}>
					{formatRelativeTime(common().lastSeen).padStart(COLUMN_WIDTHS.lastSeen - 1)}
				</text>
			</box>
		</Show>
	);
};

/**
 * Renders the empty state when no issues are loaded.
 */
const EmptyState = (): JSX.Element => {
	return (
		<box
			width="100%"
			flexGrow={1}
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
		>
			<text fg={colors.fgDim}>No issues loaded</text>
			<text fg={colors.fgMuted}>Press 'r' to refresh</text>
		</box>
	);
};

/**
 * Renders an error banner.
 */
const ErrorBanner = (props: { message: string }): JSX.Element => {
	return (
		<box
			width="100%"
			backgroundColor={colors.bgPanel}
			paddingLeft={1}
			paddingRight={1}
			flexDirection="row"
		>
			<text fg={semanticColors.error}>Error:</text>
			<text fg={colors.fgDim}> {props.message}</text>
		</box>
	);
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * Main issue list component.
 *
 * Displays a windowed view of issues with:
 * - Column headers
 * - Selectable issue rows with status indicators
 * - Error banner when fetch fails
 * - Empty state when no issues
 */
export const IssueList = (props: IssueListProps): JSX.Element => {
	// Calculate visible window of issues
	const visibleIssues = () =>
		props.issues.slice(props.windowStart, props.windowStart + props.visibleCount);

	return (
		<box width="100%" height="100%" flexDirection="column">
			{/* Error banner at top if there's an error */}
			<Show when={props.error}>
				{(error: Accessor<string>) => <ErrorBanner message={error()} />}
			</Show>

			{/* Main content area */}
			<Show when={props.issues.length > 0} fallback={<EmptyState />}>
				<box width="100%" flexGrow={1} flexDirection="column">
					<ListHeader />
					<For each={visibleIssues()}>
						{(issue, i) => (
							<IssueRow
								issue={issue}
								isSelected={props.windowStart + i() === props.selectedIndex}
							/>
						)}
					</For>
				</box>
			</Show>
		</box>
	);
};
