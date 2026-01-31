/**
 * @fileoverview Keybind type definitions and utilities for the Glass TUI.
 *
 * Defines keybind structures for displaying in the action bar and handling key events.
 * Each component can define its own keybinds based on context/state.
 */

import type { KeyEvent } from "@opentui/core";

// ----------------------------------------------------------------------------
// Keybind Types
// ----------------------------------------------------------------------------

/**
 * Represents a single keybind for display and handling.
 */
export interface Keybind {
	/** The key or key combination (e.g., "q", "Enter", "Ctrl+c") */
	readonly key: string;
	/** Short label describing the action (e.g., "quit", "open") */
	readonly label: string;
	/** Optional: whether this keybind is currently active/available */
	readonly enabled?: boolean;
}

/**
 * A group of keybinds, typically shown together in the action bar.
 */
export type KeybindGroup = readonly Keybind[];

// ----------------------------------------------------------------------------
// Global Keybinds
// ----------------------------------------------------------------------------

/**
 * Keybinds that are always available regardless of screen/state.
 */
export const globalKeybinds: KeybindGroup = [
	{ key: "q", label: "quit" },
	{ key: "?", label: "help" },
] as const;

// ----------------------------------------------------------------------------
// List Screen Keybinds
// ----------------------------------------------------------------------------

/**
 * Keybinds available on the issue list screen.
 */
export const listScreenKeybinds: KeybindGroup = [
	{ key: "\u2191\u2193", label: "navigate" }, // ↑↓
	{ key: "C-d/u", label: "page" },
	{ key: "Enter", label: "open" },
	{ key: "r", label: "refresh" },
] as const;

// ----------------------------------------------------------------------------
// Detail Screen Keybinds
// ----------------------------------------------------------------------------

/**
 * Keybinds available on the issue detail screen.
 */
export const detailScreenKeybinds: KeybindGroup = [
	{ key: "Esc", label: "back" },
	{ key: "Tab", label: "switch pane" },
	{ key: "j/k", label: "scroll" },
] as const;

// ----------------------------------------------------------------------------
// State-Specific Keybinds
// ----------------------------------------------------------------------------

/**
 * Keybinds for pending approval state.
 */
export const pendingApprovalKeybinds: KeybindGroup = [
	{ key: "a", label: "approve" },
	{ key: "x", label: "reject" },
	{ key: "c", label: "changes" },
] as const;

/**
 * Keybinds for pending review state.
 */
export const pendingReviewKeybinds: KeybindGroup = [{ key: "d", label: "cleanup" }] as const;

/**
 * Keybinds for error state.
 */
export const errorStateKeybinds: KeybindGroup = [
	{ key: "R", label: "retry" },
	{ key: "x", label: "dismiss" },
] as const;

/**
 * Keybinds for pending state (issue not started).
 */
export const pendingStateKeybinds: KeybindGroup = [{ key: "s", label: "start analysis" }] as const;

// ----------------------------------------------------------------------------
// Key Matching Utilities
// ----------------------------------------------------------------------------

/**
 * Checks if a key event matches a specific key name.
 *
 * @param event - The key event from OpenTUI
 * @param key - The key name to match (e.g., "q", "escape", "return")
 * @returns True if the event matches the key
 */
export const matchesKey = (event: KeyEvent, key: string): boolean => {
	return event.name === key;
};

/**
 * Checks if a key event matches a key with Ctrl modifier.
 *
 * @param event - The key event from OpenTUI
 * @param key - The key name to match
 * @returns True if the event matches Ctrl+key
 */
export const matchesCtrl = (event: KeyEvent, key: string): boolean => {
	return event.ctrl && event.name === key;
};

/**
 * Checks if the key event is a quit command (q or Ctrl+c).
 *
 * @param event - The key event from OpenTUI
 * @returns True if this is a quit command
 */
export const isQuitKey = (event: KeyEvent): boolean => {
	return matchesKey(event, "q") || matchesCtrl(event, "c");
};

/**
 * Checks if the key event is a navigation key.
 *
 * @param event - The key event from OpenTUI
 * @returns The navigation direction or null
 */
export const getNavigationDirection = (
	event: KeyEvent,
): "up" | "down" | "left" | "right" | null => {
	switch (event.name) {
		case "up":
		case "k":
			return "up";
		case "down":
		case "j":
			return "down";
		case "left":
		case "h":
			return "left";
		case "right":
		case "l":
			return "right";
		default:
			return null;
	}
};

// ----------------------------------------------------------------------------
// Keybind Formatting
// ----------------------------------------------------------------------------

/**
 * Formats a keybind group for display in the action bar.
 *
 * @param keybinds - The keybinds to format
 * @returns Formatted string like "[q] quit  [Enter] open"
 */
export const formatKeybinds = (keybinds: KeybindGroup): string => {
	return keybinds
		.filter((kb) => kb.enabled !== false)
		.map((kb) => `[${kb.key}] ${kb.label}`)
		.join("  ");
};
