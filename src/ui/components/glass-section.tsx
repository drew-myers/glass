/**
 * @fileoverview Glass metadata section component.
 *
 * Displays common Glass issue metadata that appears at the top of the
 * detail screen's left pane. This section is source-agnostic and shows
 * the issue's Glass workflow state.
 */

import type { JSX } from "solid-js";
import type { Issue, IssueState } from "../../domain/issue.js";
import { formatRelativeTime } from "../../lib/time.js";
import { colors, getStatusColor, getStatusIcon } from "../theme.js";

// =============================================================================
// Props
// =============================================================================

/**
 * Props for the GlassSection component.
 */
export interface GlassSectionProps {
	/** The issue to display metadata for */
	readonly issue: Issue;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get human-readable status label from state tag.
 */
const getStatusLabel = (state: IssueState): string => {
	switch (state._tag) {
		case "Pending":
			return "Pending";
		case "Analyzing":
			return "Analyzing";
		case "PendingApproval":
			return "Pending Approval";
		case "InProgress":
			return "In Progress";
		case "PendingReview":
			return "Pending Review";
		case "Error":
			return "Error";
		default:
			return "Unknown";
	}
};

// =============================================================================
// Component
// =============================================================================

/**
 * Glass metadata section showing issue workflow state.
 *
 * Displays:
 * - Issue ID (composite format)
 * - Current workflow status with icon and color
 * - Created and updated timestamps
 */
export const GlassSection = (props: GlassSectionProps): JSX.Element => {
	const stateTag = () => props.issue.state._tag;
	const statusIcon = () => getStatusIcon(stateTag());
	const statusLabel = () => getStatusLabel(props.issue.state);
	const statusColor = () => getStatusColor(stateTag());

	return (
		<box flexDirection="column" flexShrink={0} paddingBottom={1}>
			<text fg={colors.fgDim}>--- GLASS ---</text>
			<text fg={colors.fg}>ID: {props.issue.id}</text>
			<text>
				<span style={{ fg: colors.fg }}>Status: </span>
				<span style={{ fg: statusColor() }}>
					{statusIcon()} {statusLabel()}
				</span>
			</text>
			<text fg={colors.fgDim}>
				Created: {formatRelativeTime(props.issue.createdAt)} Updated:{" "}
				{formatRelativeTime(props.issue.updatedAt)}
			</text>
		</box>
	);
};
