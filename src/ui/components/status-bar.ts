/**
 * @fileoverview Status bar component for the Glass TUI.
 *
 * Displays the app name and project context at the top of the screen.
 */

import { Box, Text, bold, fg, t } from "@opentui/core";
import type { VNode } from "@opentui/core";
import { colors, heights } from "../theme.js";

// ----------------------------------------------------------------------------
// Status Bar Props
// ----------------------------------------------------------------------------

/**
 * Props for the StatusBar component.
 */
export interface StatusBarProps {
	/** Optional organization name to display */
	readonly organization?: string;
	/** Optional project name to display */
	readonly project?: string;
	/** Optional team name to display */
	readonly team?: string;
}

// ----------------------------------------------------------------------------
// Status Bar Component
// ----------------------------------------------------------------------------

/**
 * Creates the status bar component that displays at the top of the screen.
 *
 * Shows the app name on the left and project context on the right.
 *
 * @param props - Status bar configuration
 * @returns VNode for the status bar
 */
export function StatusBar(props: StatusBarProps = {}): VNode {
	const { organization, project, team } = props;

	// Build the right side context string
	const contextParts: string[] = [];
	if (organization && project) {
		contextParts.push(`${organization}/${project}`);
	} else if (project) {
		contextParts.push(project);
	}
	if (team) {
		contextParts.push(`[${team}]`);
	}
	const contextString = contextParts.join(" ");

	return Box(
		{
			width: "100%",
			height: heights.statusBar,
			backgroundColor: colors.bgPanel,
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
			paddingLeft: 1,
			paddingRight: 1,
		},
		// Left side: App name
		Text({
			content: t`${bold(fg(colors.accent)("Glass"))}`,
		}),
		// Right side: Project context (if provided)
		contextString
			? Text({
					content: t`${fg(colors.fgDim)(contextString)}`,
				})
			: Text({ content: "" }),
	);
}
