/**
 * @fileoverview Main Glass TUI application component.
 *
 * Provides the root app layout with screen routing, global keybind handling,
 * issue list management, and proper Solid.js reactive updates.
 */

import { useKeyboard, useRenderer } from "@opentui/solid";
import { type JSX, Match, Switch, onCleanup, onMount } from "solid-js";
import { ActionBar } from "./components/action-bar.js";
import { StatusBar, type StatusBarProps } from "./components/status-bar.js";
import {
	detailScreenKeybinds,
	getNavigationDirection,
	globalKeybinds,
	listScreenKeybinds,
	matchesCtrl,
	matchesKey,
} from "./keybinds.js";
import { IssueList } from "./screens/list.js";
import { type AppState, ScreenState, createAppState } from "./state.js";
import { colors, heights } from "./theme.js";

// Re-export state types and factory for external use
export { createAppState, ScreenState, type AppState };

// ----------------------------------------------------------------------------
// App Props
// ----------------------------------------------------------------------------

/**
 * Props for the App component.
 */
export interface AppProps {
	/** Pre-created app state (allows external access to state) */
	readonly state: AppState;
	/** Props for the status bar (org/project/team) */
	readonly statusBarProps?: StatusBarProps | undefined;
	/** Callback to trigger refresh */
	readonly onRefresh?: () => void;
}

// ----------------------------------------------------------------------------
// App Component
// ----------------------------------------------------------------------------

/**
 * Main Glass TUI application component.
 *
 * Handles:
 * - Screen routing (List / Detail)
 * - Global keybind handling
 * - Spinner animation
 * - Layout with StatusBar, content area, and ActionBar
 */
export const App = (props: AppProps): JSX.Element => {
	const renderer = useRenderer();
	const state = props.state;

	// Calculate visible count from terminal dimensions
	const visibleCount = (): number => {
		const overhead = heights.statusBar + heights.actionBar + 1;
		return Math.max(1, renderer.height - overhead);
	};

	// Keyboard handling
	useKeyboard((event) => {
		const currentScreen = state.screen();

		// Handle quit (Ctrl+C always quits)
		if (matchesCtrl(event, "c")) {
			state.quit();
			return;
		}

		// Screen-specific keybinds
		if (currentScreen._tag === "List") {
			// Navigation (j/k or arrow keys)
			const direction = getNavigationDirection(event);
			if (direction === "up" || direction === "down") {
				state.moveSelection(direction, visibleCount());
				return;
			}

			// Jump to top (g)
			if (matchesKey(event, "g") && !event.shift) {
				state.jumpSelection("top", visibleCount());
				return;
			}

			// Jump to bottom (G / shift+g)
			if (matchesKey(event, "g") && event.shift) {
				state.jumpSelection("bottom", visibleCount());
				return;
			}

			// Page down (Ctrl+D)
			if (matchesCtrl(event, "d")) {
				state.pageMove("down", visibleCount());
				return;
			}

			// Page up (Ctrl+U)
			if (matchesCtrl(event, "u")) {
				state.pageMove("up", visibleCount());
				return;
			}

			// Open selected issue (Enter)
			if (matchesKey(event, "return")) {
				state.openSelected();
				return;
			}

			// Refresh (r)
			if (matchesKey(event, "r")) {
				props.onRefresh?.();
				return;
			}

			// Quit (q)
			if (matchesKey(event, "q")) {
				state.quit();
				return;
			}
		} else if (currentScreen._tag === "Detail") {
			// Back to list (q)
			if (matchesKey(event, "q")) {
				state.navigateTo(ScreenState.List());
				return;
			}
		}
	});

	// Spinner animation interval
	let spinnerInterval: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		spinnerInterval = setInterval(() => {
			if (state.isLoading()) {
				state.tickSpinner();
			}
		}, 80); // ~12fps spinner
	});

	onCleanup(() => {
		if (spinnerInterval) {
			clearInterval(spinnerInterval);
		}
	});

	// Derive current keybinds from screen
	const currentKeybinds = () => {
		const screen = state.screen();
		return screen._tag === "List"
			? [...listScreenKeybinds, ...globalKeybinds]
			: [...detailScreenKeybinds, ...globalKeybinds];
	};

	return (
		<box
			id="app-root"
			width="100%"
			height="100%"
			flexDirection="column"
			backgroundColor={colors.bg}
		>
			{/* Status bar at top */}
			<StatusBar
				organization={props.statusBarProps?.organization}
				project={props.statusBarProps?.project}
				team={props.statusBarProps?.team}
			/>

			{/* Main content area (flex-grow to fill space) */}
			<box id="content-area" flexGrow={1} flexDirection="column">
				<Switch>
					<Match when={state.screen()._tag === "List"}>
						<IssueList
							issues={state.issues()}
							selectedIndex={state.selectedIndex()}
							windowStart={state.windowStart()}
							visibleCount={visibleCount()}
							isLoading={state.isLoading()}
							spinnerFrame={state.spinnerFrame()}
							error={state.error()}
						/>
					</Match>
					<Match when={state.screen()._tag === "Detail"}>
						{/* Placeholder for detail screen - will be implemented in a later ticket */}
						<box
							width="100%"
							flexGrow={1}
							flexDirection="column"
							justifyContent="center"
							alignItems="center"
						>
							<text fg={colors.fgDim}>Detail view coming soon...</text>
						</box>
					</Match>
				</Switch>
			</box>

			{/* Action bar at bottom */}
			<ActionBar keybinds={currentKeybinds()} />
		</box>
	);
};
