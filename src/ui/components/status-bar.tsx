/**
 * @fileoverview Status bar component for the Glass TUI.
 *
 * Displays the app name and project context at the top of the screen.
 */

import type { JSX } from "solid-js";
import { colors, heights } from "../theme.js";

// ----------------------------------------------------------------------------
// Status Bar Props
// ----------------------------------------------------------------------------

/**
 * Props for the StatusBar component.
 */
export interface StatusBarProps {
	/** Optional organization name to display */
	readonly organization?: string | undefined;
	/** Optional project name to display */
	readonly project?: string | undefined;
	/** Optional team name to display */
	readonly team?: string | undefined;
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
 * @returns JSX element for the status bar
 */
export const StatusBar = (props: StatusBarProps): JSX.Element => {
	// Build the right side context string
	const contextString = (): string => {
		const parts: string[] = [];
		if (props.organization && props.project) {
			parts.push(`${props.organization}/${props.project}`);
		} else if (props.project) {
			parts.push(props.project);
		}
		if (props.team) {
			parts.push(`[${props.team}]`);
		}
		return parts.join(" ");
	};

	return (
		<box
			width="100%"
			height={heights.statusBar}
			backgroundColor={colors.bgPanel}
			flexDirection="row"
			justifyContent="space-between"
			alignItems="center"
			paddingLeft={1}
			paddingRight={1}
		>
			{/* Left side: App name */}
			<text fg={colors.accent}>
				<b>Glass</b>
			</text>
			{/* Right side: Project context (if provided) */}
			<text fg={colors.fgDim}>{contextString()}</text>
		</box>
	);
};
