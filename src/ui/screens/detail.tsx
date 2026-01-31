/**
 * @fileoverview Issue detail screen component.
 *
 * Displays a split-pane layout with:
 * - Left pane (60%): Glass metadata + source-specific content (scrollable)
 * - Right pane (40%): Agent conversation (placeholder for now)
 *
 * Supports panel focus switching and scrolling via keyboard.
 */

import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/solid";
import { Match } from "effect";
import { type JSX, Show } from "solid-js";
import type { Issue, SentrySourceData } from "../../domain/issue.js";
import { getSourceCommon } from "../../domain/issue.js";
import { GlassSection } from "../components/glass-section.js";
import { SentryPane } from "../components/sentry-pane.js";
import { getNavigationDirection, matchesCtrl } from "../keybinds.js";
import type { FocusedPane } from "../state.js";
import { colors, getStatusColor, getStatusIcon } from "../theme.js";

// =============================================================================
// Props
// =============================================================================

/**
 * Props for the DetailScreen component.
 */
export interface DetailScreenProps {
	/** The issue to display */
	readonly issue: Issue;
	/** Which pane is currently focused */
	readonly focusedPane: FocusedPane;
	/** Scroll offset for the left pane */
	readonly scrollOffset: number;
	/** Height available for scrollable content */
	readonly visibleHeight: number;
	/** Whether event data is being fetched */
	readonly isLoading?: boolean;
}

// =============================================================================
// Header Component
// =============================================================================

/**
 * Header showing back arrow, issue title, and status badge.
 */
const DetailHeader = (props: { issue: Issue }): JSX.Element => {
	const common = () => getSourceCommon(props.issue.source);
	const stateTag = () => props.issue.state._tag;
	const statusIcon = () => getStatusIcon(stateTag());
	const statusColor = () => getStatusColor(stateTag());

	// Truncate title if needed
	const title = () => {
		const t = common().title;
		return t.length > 60 ? `${t.slice(0, 57)}...` : t;
	};

	return (
		<box
			width="100%"
			height={1}
			flexDirection="row"
			backgroundColor={colors.bgPanel}
			paddingLeft={1}
			paddingRight={1}
		>
			{/* Back arrow and title */}
			<box flexGrow={1} flexDirection="row">
				<text fg={colors.fgDim}>{"\u2190"} </text>
				<text fg={colors.fg}>{title()}</text>
			</box>

			{/* Status badge */}
			<box flexDirection="row">
				<text fg={statusColor()}>{statusIcon()} </text>
				<text fg={statusColor()}>{stateTag().toUpperCase()}</text>
			</box>
		</box>
	);
};

// =============================================================================
// Left Pane (Glass + Source Content)
// =============================================================================

/**
 * Source-specific content pane, matched on issue source type.
 */
const SourceContent = (props: { issue: Issue }): JSX.Element => {
	return (
		<>
			{Match.value(props.issue.source).pipe(
				Match.tag("Sentry", ({ data }) => <SentryPane data={data as SentrySourceData} />),
				Match.tag("GitHub", () => (
					<text fg={colors.fgDim}>GitHub issue details - coming soon</text>
				)),
				Match.tag("Ticket", () => <text fg={colors.fgDim}>Ticket details - coming soon</text>),
				Match.exhaustive,
			)}
		</>
	);
};

/**
 * Left pane showing Glass metadata and source-specific content.
 * Uses scrollbox for scrollable content following OpenCode patterns.
 */
const LeftPane = (props: {
	issue: Issue;
	isFocused: boolean;
	scrollOffset: number;
	isLoading: boolean | undefined;
	scrollRef: (ref: ScrollBoxRenderable) => void;
}): JSX.Element => {
	const borderColor = () => (props.isFocused ? colors.borderFocus : colors.border);
	return (
		<box
			width="60%"
			height="100%"
			flexDirection="column"
			borderStyle="rounded"
			borderColor={borderColor()}
			paddingLeft={1}
			paddingRight={1}
		>
			<scrollbox ref={props.scrollRef} flexGrow={1}>
				<box flexDirection="column" flexShrink={0}>
					<GlassSection issue={props.issue} />
					<Show when={props.isLoading}>
						<text fg={colors.fgDim}>Loading event details...</text>
					</Show>
					<SourceContent issue={props.issue} />
				</box>
			</scrollbox>
		</box>
	);
};

// =============================================================================
// Right Pane (Agent - Placeholder)
// =============================================================================

/**
 * Agent pane placeholder.
 * Will be implemented in gla-4ia3.
 */
const AgentPane = (props: { isFocused: boolean }): JSX.Element => {
	const borderColor = () => (props.isFocused ? colors.borderFocus : colors.border);

	return (
		<box
			width="40%"
			height="100%"
			flexDirection="column"
			borderStyle="rounded"
			borderColor={borderColor()}
			paddingLeft={1}
			paddingRight={1}
		>
			{/* Header */}
			<box width="100%" paddingBottom={1}>
				<text fg={colors.fgDim}>--- AGENT ---</text>
			</box>

			{/* Placeholder content */}
			<box
				width="100%"
				flexGrow={1}
				flexDirection="column"
				justifyContent="center"
				alignItems="center"
			>
				<text fg={colors.fgMuted}>Agent pane - coming soon</text>
				<box height={1} />
				<text fg={colors.fgMuted}>(gla-4ia3)</text>
			</box>
		</box>
	);
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * Issue detail screen with split-pane layout.
 *
 * Layout:
 * - Header: back arrow, title, status badge
 * - Split pane:
 *   - Left (60%): Glass metadata + source content (scrollable)
 *   - Right (40%): Agent conversation (placeholder)
 *
 * Focus is indicated by border color.
 * Keyboard scrolling (j/k) is handled locally via scrollbox ref.
 */
export const DetailScreen = (props: DetailScreenProps): JSX.Element => {
	let leftScrollRef: ScrollBoxRenderable | undefined;

	// Handle keyboard scrolling for left pane
	useKeyboard((event) => {
		if (props.focusedPane !== "left" || !leftScrollRef) return;

		const direction = getNavigationDirection(event);

		// Line scroll (j/k or up/down)
		if (direction === "up") {
			leftScrollRef.scrollBy(-1);
			return;
		}
		if (direction === "down") {
			leftScrollRef.scrollBy(1);
			return;
		}

		// Page scroll (Ctrl+D/U)
		if (matchesCtrl(event, "d")) {
			leftScrollRef.scrollBy(Math.floor(leftScrollRef.height / 2));
			return;
		}
		if (matchesCtrl(event, "u")) {
			leftScrollRef.scrollBy(-Math.floor(leftScrollRef.height / 2));
			return;
		}
	});

	return (
		<box width="100%" height="100%" flexDirection="column">
			{/* Header - fixed height */}
			<box flexShrink={0}>
				<DetailHeader issue={props.issue} />
			</box>

			{/* Split pane content */}
			<box width="100%" flexGrow={1} flexDirection="row">
				<LeftPane
					issue={props.issue}
					isFocused={props.focusedPane === "left"}
					scrollOffset={props.scrollOffset}
					isLoading={props.isLoading}
					scrollRef={(ref) => {
						leftScrollRef = ref;
					}}
				/>
				<AgentPane isFocused={props.focusedPane === "agent"} />
			</box>
		</box>
	);
};
