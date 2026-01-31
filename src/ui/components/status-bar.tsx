/**
 * @fileoverview Status bar component for the Glass TUI.
 *
 * Displays the app name and project context at the top of the screen.
 */

import { type JSX, Show } from "solid-js";
import { colors, heights } from "../theme.js";

// ----------------------------------------------------------------------------
// Spinner
// ----------------------------------------------------------------------------

/** Spinner frames for loading animation */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/**
 * Gets the spinner character for a given frame.
 */
const getSpinnerChar = (frame: number): string => {
	const index = frame % SPINNER_FRAMES.length;
	return SPINNER_FRAMES[index] ?? SPINNER_FRAMES[0];
};

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
	/** Whether data is currently loading (sync) */
	readonly isLoading?: boolean | undefined;
	/** Whether detail event data is loading */
	readonly detailLoading?: boolean | undefined;
	/** Current spinner frame index (0-9) */
	readonly spinnerFrame?: number | undefined;
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
			{/* Left side: App name with optional loading spinner */}
			<box flexDirection="row">
				<text fg={colors.accent}>
					<b>Glass</b>
				</text>
				<Show when={props.isLoading}>
					<text fg={colors.fgDim}> {getSpinnerChar(props.spinnerFrame ?? 0)} syncing...</text>
				</Show>
				<Show when={!props.isLoading && props.detailLoading}>
					<text fg={colors.fgDim}> {getSpinnerChar(props.spinnerFrame ?? 0)} loading...</text>
				</Show>
			</box>
			{/* Right side: Project context (if provided) */}
			<text fg={colors.fgDim}>{contextString()}</text>
		</box>
	);
};
