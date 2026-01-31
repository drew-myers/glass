/**
 * @fileoverview Solid.js state management for Glass TUI.
 *
 * Uses fine-grained signals for reactive UI updates. Each piece of state
 * is an independent signal, allowing Solid to optimize re-renders.
 */

import { Data } from "effect";
import { type Accessor, type Setter, createSignal } from "solid-js";
import type { Issue } from "../domain/issue.js";

// ----------------------------------------------------------------------------
// Detail Screen Types
// ----------------------------------------------------------------------------

/**
 * Which pane is focused on the detail screen.
 */
export type FocusedPane = "left" | "agent";

// ----------------------------------------------------------------------------
// Screen State
// ----------------------------------------------------------------------------

/**
 * Represents the current screen state of the application.
 */
export type ScreenState = Data.TaggedEnum<{
	/** Issue list screen */
	List: {};
	/** Issue detail screen */
	Detail: { issueId: string };
}>;

/**
 * Screen state constructors.
 */
export const ScreenState = Data.taggedEnum<ScreenState>();

// ----------------------------------------------------------------------------
// App State Store
// ----------------------------------------------------------------------------

/**
 * The return type of createAppState - provides access to all signals and actions.
 */
export interface AppState {
	// ---- Signal accessors (getters) ----
	/** Current screen being displayed */
	readonly screen: Accessor<ScreenState>;
	/** Array of issues to display */
	readonly issues: Accessor<readonly Issue[]>;
	/** Currently selected issue index */
	readonly selectedIndex: Accessor<number>;
	/** Whether data is currently loading */
	readonly isLoading: Accessor<boolean>;
	/** Current spinner frame index (0-9) */
	readonly spinnerFrame: Accessor<number>;
	/** Error message to display, if any */
	readonly error: Accessor<string | null>;
	/** Whether the app should quit */
	readonly shouldQuit: Accessor<boolean>;

	// ---- Direct setters (for simple state updates) ----
	readonly setIsLoading: Setter<boolean>;
	readonly setError: Setter<string | null>;

	// ---- Actions (encapsulate complex state logic) ----
	/**
	 * Navigate to a different screen.
	 */
	readonly navigateTo: (screen: ScreenState) => void;

	/**
	 * Set the issues array, clamping selection if needed.
	 */
	readonly setIssues: (issues: readonly Issue[]) => void;

	/**
	 * Move selection up or down by one.
	 * @param direction - "up" or "down"
	 */
	readonly moveSelection: (direction: "up" | "down") => void;

	/**
	 * Jump selection to top or bottom of list.
	 * @param position - "top" or "bottom"
	 */
	readonly jumpSelection: (position: "top" | "bottom") => void;

	/**
	 * Move selection by a specified amount (for page up/down).
	 * @param direction - "up" or "down"
	 * @param amount - Number of items to move
	 */
	readonly pageMove: (direction: "up" | "down", amount: number) => void;

	/**
	 * Open the currently selected issue (navigate to detail screen).
	 */
	readonly openSelected: () => void;

	/**
	 * Increment spinner frame (for animation).
	 */
	readonly tickSpinner: () => void;

	/**
	 * Signal that the app should quit.
	 */
	readonly quit: () => void;

	// ---- Detail screen state ----
	/** Which pane is focused on the detail screen */
	readonly focusedPane: Accessor<FocusedPane>;
	/** Scroll offset for the left pane content */
	readonly leftPaneScrollOffset: Accessor<number>;
	/** Whether detail event data is being fetched */
	readonly isDetailLoading: Accessor<boolean>;
	/** Setter for detail loading state */
	readonly setIsDetailLoading: Setter<boolean>;

	// ---- Detail screen actions ----
	/**
	 * Switch focus between left and agent panes.
	 */
	readonly switchPane: () => void;

	/**
	 * Scroll the left pane content.
	 * @param direction - "up" or "down"
	 * @param amount - Number of lines to scroll (default 1)
	 * @param maxOffset - Maximum scroll offset (content height - visible height)
	 */
	readonly scrollLeftPane: (direction: "up" | "down", amount: number, maxOffset: number) => void;

	/**
	 * Reset detail screen state (called when navigating to detail).
	 */
	readonly resetDetailState: () => void;
}

/**
 * Creates a new app state store with independent signals.
 *
 * Each piece of state is a separate signal, enabling fine-grained reactivity.
 * Actions encapsulate state transition logic that was previously in the reducer.
 *
 * @returns AppState object with signals and actions
 */
export const createAppState = (): AppState => {
	// ---- Signals ----
	const [screen, setScreen] = createSignal<ScreenState>(ScreenState.List());
	const [issues, setIssuesSignal] = createSignal<readonly Issue[]>([]);
	const [selectedIndex, setSelectedIndex] = createSignal(0);
	const [isLoading, setIsLoading] = createSignal(false);
	const [spinnerFrame, setSpinnerFrame] = createSignal(0);
	const [error, setError] = createSignal<string | null>(null);
	const [shouldQuit, setShouldQuit] = createSignal(false);

	// ---- Actions ----

	const navigateTo = (newScreen: ScreenState): void => {
		setScreen(newScreen);
	};

	const setIssues = (newIssues: readonly Issue[]): void => {
		setIssuesSignal(newIssues);
		// Clamp selectedIndex if it's out of bounds
		setSelectedIndex((current) => Math.min(current, Math.max(0, newIssues.length - 1)));
	};

	const moveSelection = (direction: "up" | "down"): void => {
		const delta = direction === "up" ? -1 : 1;
		const currentIssues = issues();
		const maxIndex = Math.max(0, currentIssues.length - 1);

		setSelectedIndex((current) => Math.max(0, Math.min(current + delta, maxIndex)));
	};

	const jumpSelection = (position: "top" | "bottom"): void => {
		const currentIssues = issues();
		const newIndex = position === "top" ? 0 : Math.max(0, currentIssues.length - 1);
		setSelectedIndex(newIndex);
	};

	const pageMove = (direction: "up" | "down", amount: number): void => {
		const delta = direction === "up" ? -amount : amount;
		const currentIssues = issues();
		const maxIndex = Math.max(0, currentIssues.length - 1);

		setSelectedIndex((current) => Math.max(0, Math.min(current + delta, maxIndex)));
	};

	const openSelected = (): void => {
		const currentIssues = issues();
		const issue = currentIssues[selectedIndex()];
		if (issue) {
			// Reset detail state before navigating
			setFocusedPane("left");
			setLeftPaneScrollOffset(0);
			setScreen(ScreenState.Detail({ issueId: issue.id }));
		}
	};

	const tickSpinner = (): void => {
		setSpinnerFrame((current) => (current + 1) % 10);
	};

	const quit = (): void => {
		setShouldQuit(true);
	};

	// ---- Detail screen signals ----
	const [focusedPane, setFocusedPane] = createSignal<FocusedPane>("left");
	const [leftPaneScrollOffset, setLeftPaneScrollOffset] = createSignal(0);
	const [isDetailLoading, setIsDetailLoading] = createSignal(false);

	// ---- Detail screen actions ----

	const switchPane = (): void => {
		setFocusedPane((current) => (current === "left" ? "agent" : "left"));
	};

	const scrollLeftPane = (direction: "up" | "down", amount: number, maxOffset: number): void => {
		setLeftPaneScrollOffset((current) => {
			const delta = direction === "up" ? -amount : amount;
			const newOffset = current + delta;
			// Clamp to valid range [0, maxOffset]
			return Math.max(0, Math.min(newOffset, Math.max(0, maxOffset)));
		});
	};

	const resetDetailState = (): void => {
		setFocusedPane("left");
		setLeftPaneScrollOffset(0);
	};

	return {
		// Signals
		screen,
		issues,
		selectedIndex,
		isLoading,
		spinnerFrame,
		error,
		shouldQuit,

		// Direct setters
		setIsLoading,
		setError,

		// Actions
		navigateTo,
		setIssues,
		moveSelection,
		jumpSelection,
		pageMove,
		openSelected,
		tickSpinner,
		quit,

		// Detail screen signals
		focusedPane,
		leftPaneScrollOffset,
		isDetailLoading,
		setIsDetailLoading,

		// Detail screen actions
		switchPane,
		scrollLeftPane,
		resetDetailState,
	};
};
