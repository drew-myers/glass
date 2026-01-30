/**
 * @fileoverview Main Glass TUI application component.
 *
 * Provides the root app layout with screen routing, global keybind handling,
 * issue list management, and proper Effect integration for lifecycle management.
 */

import { Box, type CliRenderer, type KeyEvent } from "@opentui/core";
import { Data, Effect, Match, Ref, type Scope } from "effect";
import type { Issue } from "../domain/issue.js";
import { Renderer } from "../lib/effect-opentui.js";
import { ActionBar } from "./components/action-bar.js";
import { StatusBar, type StatusBarProps } from "./components/status-bar.js";
import {
	detailScreenKeybinds,
	getNavigationDirection,
	globalKeybinds,
	isQuitKey,
	listScreenKeybinds,
	matchesCtrl,
	matchesKey,
} from "./keybinds.js";
import { IssueList, calculateWindowStart } from "./screens/list.js";
import { colors, heights } from "./theme.js";

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
// App State
// ----------------------------------------------------------------------------

/**
 * The complete application UI state.
 */
export interface AppState {
	/** Current screen being displayed */
	readonly screen: ScreenState;
	/** Whether the app should quit */
	readonly shouldQuit: boolean;
	/** Array of issues to display */
	readonly issues: readonly Issue[];
	/** Currently selected issue index */
	readonly selectedIndex: number;
	/** First visible issue index (for windowing) */
	readonly windowStart: number;
	/** Whether data is currently loading */
	readonly isLoading: boolean;
	/** Current spinner frame index (0-9) */
	readonly spinnerFrame: number;
	/** Error message to display, if any */
	readonly error: string | null;
}

/**
 * Creates the initial app state.
 */
export const initialAppState: AppState = {
	screen: ScreenState.List(),
	shouldQuit: false,
	issues: [],
	selectedIndex: 0,
	windowStart: 0,
	isLoading: false,
	spinnerFrame: 0,
	error: null,
};

// ----------------------------------------------------------------------------
// App Actions
// ----------------------------------------------------------------------------

/**
 * Actions that can modify the app state.
 */
export type AppAction = Data.TaggedEnum<{
	/** Navigate to a screen */
	Navigate: { screen: ScreenState };
	/** Request app quit */
	Quit: {};
	/** Set the issues array */
	SetIssues: { issues: readonly Issue[] };
	/** Set loading state */
	SetLoading: { isLoading: boolean };
	/** Set error message */
	SetError: { error: string | null };
	/** Move selection up or down */
	MoveSelection: { direction: "up" | "down" };
	/** Jump to top or bottom of list */
	JumpSelection: { position: "top" | "bottom" };
	/** Move selection by half a page (vi-style Ctrl+D/Ctrl+U) */
	PageMove: { direction: "up" | "down" };
	/** Open the currently selected issue */
	OpenSelected: {};
	/** Increment spinner frame (for animation) */
	TickSpinner: {};
}>;

/**
 * App action constructors.
 */
export const AppAction = Data.taggedEnum<AppAction>();

/**
 * Default visible count for the issue list.
 * This is calculated dynamically based on terminal height in buildLayout,
 * but we need a default for state calculations.
 */
const DEFAULT_VISIBLE_COUNT = 20;

/**
 * Reduces an app action to produce a new state.
 *
 * @param state - Current app state
 * @param action - Action to apply
 * @param visibleCount - Number of visible items (for windowing calculations)
 * @returns New app state
 */
export const reduceAppState = (
	state: AppState,
	action: AppAction,
	visibleCount: number = DEFAULT_VISIBLE_COUNT,
): AppState =>
	Match.value(action).pipe(
		Match.tag("Navigate", ({ screen }) => ({ ...state, screen })),
		Match.tag("Quit", () => ({ ...state, shouldQuit: true })),
		Match.tag("SetIssues", ({ issues }) => {
			// Reset selection if it's out of bounds
			const selectedIndex = Math.min(state.selectedIndex, Math.max(0, issues.length - 1));
			const windowStart = calculateWindowStart(
				selectedIndex,
				state.windowStart,
				visibleCount,
				issues.length,
			);
			return { ...state, issues, selectedIndex, windowStart };
		}),
		Match.tag("SetLoading", ({ isLoading }) => ({ ...state, isLoading })),
		Match.tag("SetError", ({ error }) => ({ ...state, error })),
		Match.tag("MoveSelection", ({ direction }) => {
			const delta = direction === "up" ? -1 : 1;
			const newIndex = Math.max(0, Math.min(state.selectedIndex + delta, state.issues.length - 1));
			const windowStart = calculateWindowStart(
				newIndex,
				state.windowStart,
				visibleCount,
				state.issues.length,
			);
			return { ...state, selectedIndex: newIndex, windowStart };
		}),
		Match.tag("JumpSelection", ({ position }) => {
			const newIndex = position === "top" ? 0 : Math.max(0, state.issues.length - 1);
			const windowStart = calculateWindowStart(
				newIndex,
				state.windowStart,
				visibleCount,
				state.issues.length,
			);
			return { ...state, selectedIndex: newIndex, windowStart };
		}),
		Match.tag("PageMove", ({ direction }) => {
			// Move by half a page (vi-style Ctrl+D/Ctrl+U)
			const halfPage = Math.max(1, Math.floor(visibleCount / 2));
			const delta = direction === "up" ? -halfPage : halfPage;
			const newIndex = Math.max(0, Math.min(state.selectedIndex + delta, state.issues.length - 1));
			const windowStart = calculateWindowStart(
				newIndex,
				state.windowStart,
				visibleCount,
				state.issues.length,
			);
			return { ...state, selectedIndex: newIndex, windowStart };
		}),
		Match.tag("OpenSelected", () => {
			const issue = state.issues[state.selectedIndex];
			if (!issue) return state;
			return { ...state, screen: ScreenState.Detail({ issueId: issue.id }) };
		}),
		Match.tag("TickSpinner", () => ({
			...state,
			spinnerFrame: (state.spinnerFrame + 1) % 10,
		})),
		Match.exhaustive,
	);

// ----------------------------------------------------------------------------
// App Layout
// ----------------------------------------------------------------------------

/**
 * Configuration for the app layout.
 */
export interface AppLayoutConfig {
	/** Props for the status bar */
	readonly statusBarProps?: StatusBarProps | undefined;
}

/**
 * Calculates the number of visible items based on terminal height.
 */
const calculateVisibleCount = (renderer: CliRenderer): number => {
	// Account for: status bar (1) + action bar (1) + list header (1) + some padding
	const overhead = heights.statusBar + heights.actionBar + 1;
	const availableHeight = renderer.height - overhead;
	return Math.max(1, availableHeight);
};

/**
 * Builds the main app layout with status bar, content area, and action bar.
 *
 * @param renderer - The CLI renderer
 * @param state - Current app state
 * @param config - Layout configuration
 */
const buildLayout = (
	renderer: CliRenderer,
	state: AppState,
	config: AppLayoutConfig = {},
): void => {
	const visibleCount = calculateVisibleCount(renderer);

	// Get current keybinds based on screen
	const screenKeybinds = Match.value(state.screen).pipe(
		Match.tag("List", () => [...listScreenKeybinds, ...globalKeybinds]),
		Match.tag("Detail", () => [...detailScreenKeybinds, ...globalKeybinds]),
		Match.exhaustive,
	);

	// Build content based on current screen
	const content = Match.value(state.screen).pipe(
		Match.tag("List", () =>
			IssueList({
				issues: state.issues,
				selectedIndex: state.selectedIndex,
				windowStart: state.windowStart,
				visibleCount,
				isLoading: state.isLoading,
				spinnerFrame: state.spinnerFrame,
				error: state.error,
			}),
		),
		Match.tag("Detail", ({ issueId }) =>
			// Placeholder for detail screen - will be implemented in a later ticket
			Box(
				{
					width: "100%",
					flexGrow: 1,
					flexDirection: "column",
					justifyContent: "center",
					alignItems: "center",
				},
				// We'll implement the detail screen in a separate ticket
			),
		),
		Match.exhaustive,
	);

	// Clear existing children before adding new layout
	// This prevents duplicate renders stacking up
	const existingChildren = renderer.root.getChildren();
	for (const child of existingChildren) {
		renderer.root.remove(child.id);
	}

	// Build the main layout
	renderer.root.add(
		Box(
			{
				id: "app-root",
				width: "100%",
				height: "100%",
				flexDirection: "column",
				backgroundColor: colors.bg,
			},
			// Status bar at top
			StatusBar(config.statusBarProps ?? {}),

			// Main content area (flex-grow to fill space)
			Box(
				{
					id: "content-area",
					flexGrow: 1,
					flexDirection: "column",
				},
				content,
			),

			// Action bar at bottom
			ActionBar({ keybinds: screenKeybinds }),
		),
	);
};

// ----------------------------------------------------------------------------
// Keybind Handler
// ----------------------------------------------------------------------------

/**
 * Sets up keybind handling for the app.
 *
 * @param renderer - The CLI renderer
 * @param stateRef - Reference to the app state
 * @param onRefresh - Callback to trigger refresh
 * @returns Cleanup function
 */
const setupKeybinds = (
	renderer: CliRenderer,
	stateRef: Ref.Ref<AppState>,
	onRefresh: () => void,
): (() => void) => {
	const visibleCount = calculateVisibleCount(renderer);

	const handler = (event: KeyEvent) => {
		const state = Effect.runSync(Ref.get(stateRef));

		// Handle quit (q or Ctrl+C)
		if (isQuitKey(event)) {
			// On detail screen, q goes back to list
			if (state.screen._tag === "Detail") {
				Effect.runSync(
					Ref.update(stateRef, (s) =>
						reduceAppState(s, AppAction.Navigate({ screen: ScreenState.List() }), visibleCount),
					),
				);
				buildLayout(renderer, Effect.runSync(Ref.get(stateRef)));
				return;
			}
			// On list screen, q quits
			Effect.runSync(
				Ref.update(stateRef, (s) => reduceAppState(s, AppAction.Quit(), visibleCount)),
			);
			return;
		}

		// List screen keybinds
		if (state.screen._tag === "List") {
			// Navigation
			const direction = getNavigationDirection(event);
			if (direction === "up" || direction === "down") {
				Effect.runSync(
					Ref.update(stateRef, (s) =>
						reduceAppState(s, AppAction.MoveSelection({ direction }), visibleCount),
					),
				);
				buildLayout(renderer, Effect.runSync(Ref.get(stateRef)));
				return;
			}

			// Jump to top (g)
			if (matchesKey(event, "g")) {
				Effect.runSync(
					Ref.update(stateRef, (s) =>
						reduceAppState(s, AppAction.JumpSelection({ position: "top" }), visibleCount),
					),
				);
				buildLayout(renderer, Effect.runSync(Ref.get(stateRef)));
				return;
			}

			// Jump to bottom (G / shift+g)
			if (event.shift && matchesKey(event, "g")) {
				Effect.runSync(
					Ref.update(stateRef, (s) =>
						reduceAppState(s, AppAction.JumpSelection({ position: "bottom" }), visibleCount),
					),
				);
				buildLayout(renderer, Effect.runSync(Ref.get(stateRef)));
				return;
			}

			// Page down (Ctrl+D)
			if (matchesCtrl(event, "d")) {
				Effect.runSync(
					Ref.update(stateRef, (s) =>
						reduceAppState(s, AppAction.PageMove({ direction: "down" }), visibleCount),
					),
				);
				buildLayout(renderer, Effect.runSync(Ref.get(stateRef)));
				return;
			}

			// Page up (Ctrl+U)
			if (matchesCtrl(event, "u")) {
				Effect.runSync(
					Ref.update(stateRef, (s) =>
						reduceAppState(s, AppAction.PageMove({ direction: "up" }), visibleCount),
					),
				);
				buildLayout(renderer, Effect.runSync(Ref.get(stateRef)));
				return;
			}

			// Open selected issue (Enter)
			if (matchesKey(event, "return")) {
				Effect.runSync(
					Ref.update(stateRef, (s) => reduceAppState(s, AppAction.OpenSelected(), visibleCount)),
				);
				buildLayout(renderer, Effect.runSync(Ref.get(stateRef)));
				return;
			}

			// Refresh (r)
			if (matchesKey(event, "r")) {
				onRefresh();
				return;
			}
		}
	};

	renderer.keyInput.on("keypress", handler);

	return () => {
		renderer.keyInput.off("keypress", handler);
	};
};

// ----------------------------------------------------------------------------
// Main App Effect
// ----------------------------------------------------------------------------

/**
 * Context provided to the app for external operations.
 */
export interface AppContext {
	/** Callback to refresh issues from the source */
	readonly onRefresh: () => Effect.Effect<void, never, never>;
	/** Props for the status bar (org/project/team) */
	readonly statusBarProps?: StatusBarProps | undefined;
}

/**
 * Creates the main application effect.
 *
 * Sets up the UI, handles keybinds, and runs until quit is requested.
 * Properly manages cleanup via Effect Scope.
 *
 * @param context - App context with callbacks
 * @returns Effect that runs the app
 */
export const createApp = (
	context: AppContext,
): Effect.Effect<Ref.Ref<AppState>, never, Renderer | Scope.Scope> =>
	Effect.gen(function* () {
		const renderer = yield* Renderer;

		// Create state ref
		const stateRef = yield* Ref.make(initialAppState);

		// Wrapper for refresh callback that updates state
		const triggerRefresh = () => {
			Effect.runFork(context.onRefresh());
		};

		// Setup keybind handling
		const cleanupKeybinds = setupKeybinds(renderer, stateRef, triggerRefresh);

		// Build initial layout
		const state = yield* Ref.get(stateRef);
		buildLayout(renderer, state, { statusBarProps: context.statusBarProps });

		// Start spinner animation interval
		const spinnerInterval = setInterval(() => {
			const currentState = Effect.runSync(Ref.get(stateRef));
			if (currentState.isLoading) {
				Effect.runSync(Ref.update(stateRef, (s) => reduceAppState(s, AppAction.TickSpinner())));
				buildLayout(renderer, Effect.runSync(Ref.get(stateRef)), {
					statusBarProps: context.statusBarProps,
				});
			}
		}, 80); // ~12fps spinner

		// Setup cleanup
		yield* Effect.addFinalizer(() =>
			Effect.sync(() => {
				clearInterval(spinnerInterval);
				cleanupKeybinds();
			}),
		);

		return stateRef;
	});

/**
 * Runs the app until quit is requested.
 *
 * @param stateRef - State reference from createApp
 * @param statusBarProps - Optional status bar props for re-renders
 * @returns Effect that completes when app quits
 */
export const runAppLoop = (
	stateRef: Ref.Ref<AppState>,
	statusBarProps?: StatusBarProps,
): Effect.Effect<void, never, Renderer> =>
	Effect.gen(function* () {
		const renderer = yield* Renderer;

		yield* Effect.async<void>((resume) => {
			let interval: ReturnType<typeof setInterval> | null = null;

			const cleanup = () => {
				if (interval) {
					clearInterval(interval);
					interval = null;
				}
			};

			const checkQuit = () => {
				const currentState = Effect.runSync(Ref.get(stateRef));
				if (currentState.shouldQuit) {
					cleanup();
					resume(Effect.void);
				}
			};

			// Poll for quit state
			interval = setInterval(checkQuit, 50);

			// Also check on keypress for faster response
			const keypressHandler = () => checkQuit();
			renderer.keyInput.on("keypress", keypressHandler);

			// Return cleanup for interruption
			return Effect.sync(() => {
				cleanup();
				renderer.keyInput.off("keypress", keypressHandler);
			});
		});
	});

/**
 * Helper to dispatch an action and re-render.
 *
 * @param stateRef - State reference
 * @param renderer - CLI renderer
 * @param action - Action to dispatch
 * @param statusBarProps - Optional status bar props
 */
export const dispatch = (
	stateRef: Ref.Ref<AppState>,
	renderer: CliRenderer,
	action: AppAction,
	statusBarProps?: StatusBarProps,
): Effect.Effect<void> =>
	Effect.gen(function* () {
		const visibleCount = calculateVisibleCount(renderer);
		yield* Ref.update(stateRef, (state) => reduceAppState(state, action, visibleCount));
		const newState = yield* Ref.get(stateRef);
		buildLayout(renderer, newState, { statusBarProps });
	});

// ----------------------------------------------------------------------------
// Legacy API (for backwards compatibility with existing tests)
// ----------------------------------------------------------------------------

/**
 * The main application effect (legacy API).
 *
 * @deprecated Use createApp and runAppLoop instead
 */
export const runApp: Effect.Effect<void, never, Renderer | Scope.Scope> = Effect.gen(function* () {
	const stateRef = yield* createApp({
		onRefresh: () => Effect.void,
	});
	yield* runAppLoop(stateRef);
});
