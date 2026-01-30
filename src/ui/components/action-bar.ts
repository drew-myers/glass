/**
 * @fileoverview Action bar component for the Glass TUI.
 *
 * Displays context-sensitive keybind hints at the bottom of the screen.
 */

import { Box, Text, fg, t } from "@opentui/core";
import type { VNode } from "@opentui/core";
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
 * @returns VNode for the action bar
 */
export function ActionBar(props: ActionBarProps): VNode {
	const { keybinds } = props;

	// Filter out disabled keybinds
	const activeKeybinds = keybinds.filter((kb) => kb.enabled !== false);

	return Box(
		{
			width: "100%",
			height: heights.actionBar,
			backgroundColor: colors.bgPanel,
			flexDirection: "row",
			alignItems: "center",
			paddingLeft: 1,
			paddingRight: 1,
			gap: 2,
		},
		...activeKeybinds.map((kb) =>
			Text({
				content: t`${fg(textStyles.keybind.fg)(`[${kb.key}]`)} ${fg(textStyles.keybindLabel.fg)(kb.label)}`,
			}),
		),
	);
}

// ----------------------------------------------------------------------------
// Pre-built Action Bars
// ----------------------------------------------------------------------------

/**
 * Creates a simple action bar with quit keybind.
 * Used as the default/minimal action bar.
 *
 * @returns VNode for a minimal action bar
 */
export function MinimalActionBar(): VNode {
	return ActionBar({
		keybinds: [
			{ key: "q", label: "quit" },
			{ key: "?", label: "help" },
		],
	});
}
