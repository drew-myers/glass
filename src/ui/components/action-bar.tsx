/**
 * @fileoverview Action bar component for the Glass TUI.
 *
 * Displays context-sensitive keybind hints at the bottom of the screen.
 */

import { For, type JSX } from "solid-js";
import type { KeybindGroup } from "../keybinds.js";
import { colors, heights, textStyles } from "../theme.js";

// ----------------------------------------------------------------------------
// Action Bar Props
// ----------------------------------------------------------------------------

/**
 * Props for the ActionBar component.
 */
export interface ActionBarProps {
	/** Keybinds to display in the action bar */
	readonly keybinds: KeybindGroup;
}

// ----------------------------------------------------------------------------
// Action Bar Component
// ----------------------------------------------------------------------------

/**
 * Creates the action bar component that displays at the bottom of the screen.
 *
 * Shows available keybinds with their labels.
 *
 * @param props - Action bar configuration
 * @returns JSX element for the action bar
 */
export const ActionBar = (props: ActionBarProps): JSX.Element => {
	// Filter out disabled keybinds
	const activeKeybinds = () => props.keybinds.filter((kb) => kb.enabled !== false);

	return (
		<box
			width="100%"
			height={heights.actionBar}
			backgroundColor={colors.bgPanel}
			flexDirection="row"
			alignItems="center"
			paddingLeft={1}
			paddingRight={1}
			gap={2}
		>
			<For each={activeKeybinds()}>
				{(kb) => (
					<box flexDirection="row">
						<text fg={textStyles.keybind.fg}>[{kb.key}]</text>
						<text fg={textStyles.keybindLabel.fg}> {kb.label}</text>
					</box>
				)}
			</For>
		</box>
	);
};

// ----------------------------------------------------------------------------
// Pre-built Action Bars
// ----------------------------------------------------------------------------

/**
 * Creates a simple action bar with quit keybind.
 * Used as the default/minimal action bar.
 *
 * @returns JSX element for a minimal action bar
 */
export const MinimalActionBar = (): JSX.Element => {
	return (
		<ActionBar
			keybinds={[
				{ key: "q", label: "quit" },
				{ key: "?", label: "help" },
			]}
		/>
	);
};
