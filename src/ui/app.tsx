/**
 * @fileoverview Main Glass TUI application component.
 *
 * Provides the root app layout with screen routing, global keybind handling,
 * issue list management, and proper Solid.js reactive updates.
 */

import { useKeyboard, useRenderer } from "@opentui/solid";
import { type JSX, Match, Show, Switch, onCleanup, onMount } from "solid-js";
import { ActionBar } from "./components/action-bar.js";
import { StatusBar, type StatusBarProps } from "./components/status-bar.js";
import {
	detailScreenKeybinds,
	errorStateKeybinds,
	getNavigationDirection,
	globalKeybinds,
	listScreenKeybinds,
	matchesCtrl,
	matchesKey,
	pendingApprovalKeybinds,
	pendingReviewKeybinds,
	pendingStateKeybinds,
} from "./keybinds.js";
import { DetailScreen } from "./screens/detail.js";
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
	/** Callback when user opens issue detail (triggers event data fetch) */
	readonly onOpenDetail?: (issueId: string) => void;
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

	// Calculate visible height for detail screen panes
	// Accounts for status bar, action bar, detail header, and panel borders
	const detailVisibleHeight = (): number => {
		const overhead = heights.statusBar + heights.actionBar + 1 + 2; // +1 header, +2 borders
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
				state.moveSelection(direction);
				return;
			}

			// Jump to top (g)
			if (matchesKey(event, "g") && !event.shift) {
				state.jumpSelection("top");
				return;
			}

			// Jump to bottom (G / shift+g)
			if (matchesKey(event, "g") && event.shift) {
				state.jumpSelection("bottom");
				return;
			}

			// Page down (Ctrl+D) - move by 10 items
			if (matchesCtrl(event, "d")) {
				state.pageMove("down", 10);
				return;
			}

			// Page up (Ctrl+U) - move by 10 items
			if (matchesCtrl(event, "u")) {
				state.pageMove("up", 10);
				return;
			}

			// Open selected issue (Enter)
			if (matchesKey(event, "return")) {
				const issues = state.issues();
				const issue = issues[state.selectedIndex()];
				if (issue) {
					state.openSelected();
					// Trigger event data fetch
					props.onOpenDetail?.(issue.id);
				}
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
			// Back to list (Escape or q)
			if (matchesKey(event, "escape") || matchesKey(event, "q")) {
				state.navigateTo(ScreenState.List());
				return;
			}

			// Switch pane focus (Tab)
			if (matchesKey(event, "tab")) {
				state.switchPane();
				return;
			}

			// Switch pane focus (h/l or left/right arrows)
			const direction = getNavigationDirection(event);
			if (direction === "left" || direction === "right") {
				state.switchPane();
				return;
			}

			// Note: j/k scrolling for left pane is handled directly in DetailScreen
			// via scrollbox ref for smoother native scroll behavior
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

	// Derive current keybinds from screen and issue state
	const currentKeybinds = () => {
		const screen = state.screen();
		if (screen._tag === "List") {
			return [...listScreenKeybinds, ...globalKeybinds];
		}

		// Detail screen - add state-specific keybinds
		const baseKeybinds = [...detailScreenKeybinds];

		// Find the current issue to get its state
		if (screen._tag === "Detail") {
			const issue = state.issues().find((i) => i.id === screen.issueId);
			if (issue) {
				switch (issue.state._tag) {
					case "Pending":
						baseKeybinds.push(...pendingStateKeybinds);
						break;
					case "PendingApproval":
						baseKeybinds.push(...pendingApprovalKeybinds);
						break;
					case "PendingReview":
						baseKeybinds.push(...pendingReviewKeybinds);
						break;
					case "Error":
						baseKeybinds.push(...errorStateKeybinds);
						break;
				}
			}
		}

		return [...baseKeybinds, ...globalKeybinds];
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
				isLoading={state.isLoading()}
				detailLoading={state.isDetailLoading()}
				spinnerFrame={state.spinnerFrame()}
			/>

			{/* Main content area (flex-grow to fill space) */}
			<box id="content-area" flexGrow={1} flexDirection="column">
				<Switch>
					<Match when={state.screen()._tag === "List"}>
						<IssueList
							issues={state.issues()}
							selectedIndex={state.selectedIndex()}
							error={state.error()}
						/>
					</Match>
					<Match when={state.screen()._tag === "Detail"}>
						{(() => {
							const screen = state.screen();
							if (screen._tag !== "Detail") return null;
							const issue = state.issues().find((i) => i.id === screen.issueId);
							if (!issue) {
								return (
									<box
										width="100%"
										flexGrow={1}
										flexDirection="column"
										justifyContent="center"
										alignItems="center"
									>
										<text fg={colors.fgDim}>Issue not found</text>
									</box>
								);
							}
							return (
								<DetailScreen
									issue={issue}
									focusedPane={state.focusedPane()}
									scrollOffset={state.leftPaneScrollOffset()}
									visibleHeight={detailVisibleHeight()}
								/>
							);
						})()}
					</Match>
				</Switch>
			</box>

			{/* Action bar at bottom */}
			<ActionBar keybinds={currentKeybinds()} />
		</box>
	);
};
