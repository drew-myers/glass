/**
 * @fileoverview Theme constants for the Glass TUI.
 *
 * Defines colors, icons, and styling constants matching the opencode/lazygit aesthetic.
 * Uses a dark terminal theme with color-coded status indicators.
 */

// ----------------------------------------------------------------------------
// Color Palette
// ----------------------------------------------------------------------------

/**
 * Base colors for the UI.
 */
export const colors = {
	/** Primary background color - dark terminal */
	bg: "#1a1b26",
	/** Secondary background for panels */
	bgPanel: "#24283b",
	/** Tertiary background for highlighted items */
	bgHighlight: "#414868",

	/** Primary foreground text */
	fg: "#c0caf5",
	/** Secondary/dimmed text */
	fgDim: "#565f89",
	/** Muted text for less important info */
	fgMuted: "#3b4261",

	/** Border color for panels */
	border: "#414868",
	/** Border color when focused */
	borderFocus: "#7aa2f7",

	/** Accent color for highlights */
	accent: "#7aa2f7",
	/** Secondary accent */
	accentSecondary: "#bb9af7",
} as const;

/**
 * Status-specific colors matching the state machine states.
 */
export const statusColors = {
	/** Pending - not started (dim/gray) */
	pending: "#565f89",
	/** Analyzing - agent working (yellow) */
	analyzing: "#e0af68",
	/** Pending Approval - awaiting user decision (cyan) */
	pendingApproval: "#7dcfff",
	/** In Progress - agent implementing (blue) */
	inProgress: "#7aa2f7",
	/** Pending Review - complete, awaiting review (green) */
	pendingReview: "#9ece6a",
	/** Error - something went wrong (red) */
	error: "#f7768e",
} as const;

/**
 * Semantic colors for common UI elements.
 */
export const semanticColors = {
	/** Success actions/messages */
	success: "#9ece6a",
	/** Warning messages */
	warning: "#e0af68",
	/** Error messages */
	error: "#f7768e",
	/** Informational messages */
	info: "#7dcfff",
} as const;

// ----------------------------------------------------------------------------
// Status Icons
// ----------------------------------------------------------------------------

/**
 * Unicode icons for issue status indicators.
 * These match the DESIGN.md specification.
 */
export const statusIcons = {
	/** Pending - empty circle */
	pending: "\u25CB", // ○
	/** Analyzing - half-filled circle */
	analyzing: "\u25D0", // ◐
	/** Pending Approval - filled circle with dot */
	pendingApproval: "\u25C9", // ◉
	/** In Progress - half-filled circle */
	inProgress: "\u25D0", // ◐
	/** Pending Review - filled circle */
	pendingReview: "\u25CF", // ●
	/** Error - X mark */
	error: "\u2717", // ✗
} as const;

/**
 * Maps IssueState _tag to status icon.
 */
export const getStatusIcon = (stateTag: string): string => {
	switch (stateTag) {
		case "Pending":
			return statusIcons.pending;
		case "Analyzing":
			return statusIcons.analyzing;
		case "PendingApproval":
			return statusIcons.pendingApproval;
		case "InProgress":
			return statusIcons.inProgress;
		case "PendingReview":
			return statusIcons.pendingReview;
		case "Error":
			return statusIcons.error;
		default:
			return statusIcons.pending;
	}
};

/**
 * Maps IssueState _tag to status color.
 */
export const getStatusColor = (stateTag: string): string => {
	switch (stateTag) {
		case "Pending":
			return statusColors.pending;
		case "Analyzing":
			return statusColors.analyzing;
		case "PendingApproval":
			return statusColors.pendingApproval;
		case "InProgress":
			return statusColors.inProgress;
		case "PendingReview":
			return statusColors.pendingReview;
		case "Error":
			return statusColors.error;
		default:
			return statusColors.pending;
	}
};

// ----------------------------------------------------------------------------
// Layout Constants
// ----------------------------------------------------------------------------

/**
 * Standard spacing and sizing values.
 */
export const spacing = {
	/** Padding inside panels */
	panelPadding: 1,
	/** Gap between items in a list */
	itemGap: 0,
	/** Standard margin */
	margin: 1,
} as const;

/**
 * Standard heights for UI elements.
 */
export const heights = {
	/** Status bar at the top */
	statusBar: 1,
	/** Action bar at the bottom */
	actionBar: 1,
} as const;

// ----------------------------------------------------------------------------
// Text Styling
// ----------------------------------------------------------------------------

/**
 * Common text style configurations.
 */
export const textStyles = {
	/** Header/title text */
	header: {
		fg: colors.fg,
	},
	/** Normal body text */
	body: {
		fg: colors.fg,
	},
	/** Dimmed/secondary text */
	dim: {
		fg: colors.fgDim,
	},
	/** Muted/tertiary text */
	muted: {
		fg: colors.fgMuted,
	},
	/** Keybind hints in action bar */
	keybind: {
		fg: colors.accent,
	},
	/** Keybind description text */
	keybindLabel: {
		fg: colors.fgDim,
	},
} as const;

// ----------------------------------------------------------------------------
// Border Styles
// ----------------------------------------------------------------------------

/**
 * Border style configurations for panels.
 */
export const borderStyles = {
	/** Standard panel border */
	panel: "rounded" as const,
	/** Focused panel border */
	focused: "rounded" as const,
} as const;
