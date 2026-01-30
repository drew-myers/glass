/**
 * @fileoverview Main Glass TUI application component.
 *
 * Provides the root app layout with screen routing, global keybind handling,
 * and proper Effect integration for lifecycle management.
 */

import { Box, type CliRenderer, type KeyEvent, Text, fg, t } from "@opentui/core";
import { Data, Effect, Match, Ref } from "effect";
import { Renderer } from "../lib/effect-opentui.js";
import { ActionBar } from "./components/action-bar.js";
import { StatusBar } from "./components/status-bar.js";
import { globalKeybinds, isQuitKey, listScreenKeybinds } from "./keybinds.js";
import { colors } from "./theme.js";

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
}

/**
 * Creates the initial app state.
 */
export const initialAppState: AppState = {
	screen: ScreenState.List(),
	shouldQuit: false,
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
}>;

/**
 * App action constructors.
 */
export const AppAction = Data.taggedEnum<AppAction>();

/**
 * Reduces an app action to produce a new state.
 *
 * @param state - Current app state
 * @param action - Action to apply
 * @returns New app state
 */
export const reduceAppState = (state: AppState, action: AppAction): AppState =>
	Match.value(action).pipe(
		Match.tag("Navigate", ({ screen }) => ({ ...state, screen })),
		Match.tag("Quit", () => ({ ...state, shouldQuit: true })),
		Match.exhaustive,
	);

// ----------------------------------------------------------------------------
// App Layout
// ----------------------------------------------------------------------------

/**
 * Builds the main app layout with status bar, content area, and action bar.
 *
 * @param renderer - The CLI renderer
 * @param state - Current app state
 */
const buildLayout = (renderer: CliRenderer, state: AppState): void => {
	// Get current keybinds based on screen
	const screenKeybinds = Match.value(state.screen).pipe(
		Match.tag("List", () => [...listScreenKeybinds, ...globalKeybinds]),
		Match.tag("Detail", () => [...globalKeybinds]),
		Match.exhaustive,
	);

	// Build the main layout - add to root (replaces any existing children on first render)
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
			StatusBar(),

			// Main content area (flex-grow to fill space)
			Box(
				{
					id: "content-area",
					flexGrow: 1,
					flexDirection: "column",
					justifyContent: "center",
					alignItems: "center",
					padding: 2,
				},
				// Placeholder content for the empty shell
				Text({
					id: "placeholder-text",
					content: t`${fg(colors.fgDim)("No issues loaded")}`,
				}),
				Text({
					id: "placeholder-hint",
					content: t`${fg(colors.fgMuted)("Press 'r' to refresh or 'q' to quit")}`,
				}),
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
 * Sets up global keybind handling for the app.
 *
 * @param renderer - The CLI renderer
 * @param stateRef - Reference to the app state
 * @returns Cleanup function
 */
const setupKeybinds = (renderer: CliRenderer, stateRef: Ref.Ref<AppState>): (() => void) => {
	const handler = (event: KeyEvent) => {
		// Handle quit
		if (isQuitKey(event)) {
			Effect.runSync(Ref.update(stateRef, (state) => reduceAppState(state, AppAction.Quit())));
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
 * The main application effect.
 *
 * Sets up the UI, handles keybinds, and runs until quit is requested.
 * Properly manages cleanup via Effect Scope.
 */
export const runApp: Effect.Effect<void, never, Renderer> = Effect.gen(function* () {
	const renderer = yield* Renderer;

	// Create state ref
	const stateRef = yield* Ref.make(initialAppState);

	// Setup keybind handling
	const cleanupKeybinds = setupKeybinds(renderer, stateRef);

	// Build initial layout
	const state = yield* Ref.get(stateRef);
	buildLayout(renderer, state);

	// Run until quit is requested
	yield* Effect.async<void>((resume) => {
		let interval: ReturnType<typeof setInterval> | null = null;

		const cleanup = () => {
			if (interval) {
				clearInterval(interval);
				interval = null;
			}
			renderer.keyInput.off("keypress", keypressHandler);
			cleanupKeybinds();
		};

		const checkQuit = () => {
			const currentState = Effect.runSync(Ref.get(stateRef));
			if (currentState.shouldQuit) {
				cleanup();
				resume(Effect.void);
			}
		};

		const keypressHandler = () => checkQuit();

		// Poll for quit state (simple approach for MVP)
		// In a more sophisticated implementation, we'd use Effect streams
		interval = setInterval(checkQuit, 50);

		// Also check on keypress for faster response
		renderer.keyInput.on("keypress", keypressHandler);

		// Return cleanup for interruption
		return Effect.sync(cleanup);
	});
});
