/**
 * Issue domain model and state machine.
 * Defines the core types for tracking issues through the Glass workflow.
 *
 * @module
 */

import { Data, Effect, Match } from "effect";
import { InvalidTransitionError } from "./errors.js";

// =============================================================================
// Issue Source Abstraction
// =============================================================================

/**
 * Common fields all issue sources must provide.
 * Used for list display and basic identification.
 */
export interface IssueSourceCommon {
	/** Human-readable title/summary */
	readonly title: string;
	/** Short identifier for display (e.g., "PROJ-123", "gh#456") */
	readonly shortId: string;
	/** When the issue was first seen/created */
	readonly firstSeen: Date;
	/** When the issue was last seen/updated */
	readonly lastSeen: Date;
	/** Event/occurrence count (if applicable) */
	readonly count?: number;
	/** Affected user count (if applicable) */
	readonly userCount?: number;
}

/**
 * Sentry-specific issue data.
 * Will be expanded with full Sentry API response fields in gla-jw8k.
 */
export interface SentrySourceData extends IssueSourceCommon {
	readonly culprit: string;
	readonly metadata: {
		readonly type?: string;
		readonly value?: string;
		readonly filename?: string;
		readonly function?: string;
	};
	// Future: stacktrace, breadcrumbs, environment, release, tags
}

/**
 * GitHub issue data (placeholder for future implementation).
 */
export interface GitHubSourceData extends IssueSourceCommon {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly labels: readonly string[];
	readonly assignees: readonly string[];
	readonly body: string;
	readonly url: string;
}

/**
 * Local ticket data (placeholder for future implementation).
 */
export interface TicketSourceData extends IssueSourceCommon {
	readonly ticketId: string;
	readonly description: string;
	readonly acceptance?: string;
	readonly design?: string;
	readonly tags: readonly string[];
	readonly priority: number;
}

/**
 * Tagged union of all issue sources.
 * Use Match.tag for exhaustive handling in UI components and prompt builders.
 */
export type IssueSource = Data.TaggedEnum<{
	Sentry: { readonly project: string; readonly data: SentrySourceData };
	GitHub: { readonly data: GitHubSourceData };
	Ticket: { readonly data: TicketSourceData };
}>;

export const IssueSource = Data.taggedEnum<IssueSource>();

/**
 * Extract common display fields from any issue source.
 * Useful for list views that don't need source-specific details.
 */
export const getSourceCommon = (source: IssueSource): IssueSourceCommon =>
	Match.value(source).pipe(
		Match.tag("Sentry", ({ data }) => data),
		Match.tag("GitHub", ({ data }) => data),
		Match.tag("Ticket", ({ data }) => data),
		Match.exhaustive,
	);

/**
 * Get the source type string from an IssueSource.
 * Used for composite ID generation and database storage.
 */
export const getSourceType = (source: IssueSource): "sentry" | "github" | "ticket" =>
	Match.value(source).pipe(
		Match.tag("Sentry", () => "sentry" as const),
		Match.tag("GitHub", () => "github" as const),
		Match.tag("Ticket", () => "ticket" as const),
		Match.exhaustive,
	);

// =============================================================================
// Issue State
// =============================================================================

/**
 * Represents the current state of an issue in the Glass workflow.
 *
 * State machine:
 * - Pending: Issue is new, no analysis started
 * - Analyzing: Agent is analyzing the issue
 * - Proposed: Agent has proposed a fix, awaiting review
 * - Fixing: Fix has been approved, agent is implementing
 * - Fixed: Fix is complete, worktree ready for review
 * - Error: An error occurred during analysis or fixing
 */
export type IssueState = Data.TaggedEnum<{
	Pending: {};
	Analyzing: { readonly sessionId: string };
	Proposed: { readonly sessionId: string; readonly proposal: string };
	Fixing: {
		readonly analysisSessionId: string;
		readonly fixSessionId: string;
		readonly worktreePath: string;
		readonly worktreeBranch: string;
	};
	Fixed: {
		readonly analysisSessionId: string;
		readonly fixSessionId: string;
		readonly worktreePath: string;
		readonly worktreeBranch: string;
	};
	Error: {
		readonly previousState: "analyzing" | "fixing";
		readonly sessionId: string;
		readonly error: string;
	};
}>;

export const IssueState = Data.taggedEnum<IssueState>();

// =============================================================================
// Issue Action
// =============================================================================

/**
 * Actions that can be dispatched to transition an issue between states.
 */
export type IssueAction = Data.TaggedEnum<{
	StartAnalysis: { readonly sessionId: string };
	CompleteAnalysis: { readonly proposal: string };
	Approve: {
		readonly worktreePath: string;
		readonly worktreeBranch: string;
		readonly fixSessionId: string;
	};
	Reject: {};
	RequestChanges: { readonly feedback: string };
	CompleteFix: {};
	Fail: { readonly error: string };
	Retry: { readonly newSessionId: string };
	Cleanup: {};
}>;

export const IssueAction = Data.taggedEnum<IssueAction>();

// =============================================================================
// Issue Event
// =============================================================================

/**
 * Events published when issue state changes or agent activity occurs.
 * Used for pub/sub to update UI and other subscribers.
 */
export type IssueEvent = Data.TaggedEnum<{
	StateChanged: {
		readonly issueId: string;
		readonly oldState: IssueState;
		readonly newState: IssueState;
	};
	AgentMessage: {
		readonly issueId: string;
		readonly sessionId: string;
		readonly content: string;
	};
	AgentWaitingForInput: { readonly issueId: string };
	AgentComplete: { readonly issueId: string; readonly sessionId: string };
	AgentError: {
		readonly issueId: string;
		readonly sessionId: string;
		readonly error: string;
	};
}>;

export const IssueEvent = Data.taggedEnum<IssueEvent>();

// =============================================================================
// Issue Entity
// =============================================================================

/**
 * The full Issue entity combining source data with Glass workflow state.
 * The id is a composite: "{source_type}:{source_id}" (e.g., "sentry:12345")
 */
export interface Issue {
	/** Composite ID: "{source_type}:{source_id}" */
	readonly id: string;
	/** Source-specific data (Sentry, GitHub, Ticket, etc.) */
	readonly source: IssueSource;
	/** Current workflow state */
	readonly state: IssueState;
	/** When the issue was first imported into Glass */
	readonly createdAt: Date;
	/** When the issue was last updated in Glass */
	readonly updatedAt: Date;
}

// =============================================================================
// State Machine Transition
// =============================================================================

/**
 * Validates and performs state transitions based on the current state and action.
 *
 * Valid transitions:
 * | From State | Action           | To State                    |
 * |------------|------------------|-----------------------------|
 * | Pending    | StartAnalysis    | Analyzing                   |
 * | Analyzing  | CompleteAnalysis | Proposed                    |
 * | Analyzing  | Fail             | Error                       |
 * | Proposed   | Approve          | Fixing                      |
 * | Proposed   | Reject           | Pending                     |
 * | Proposed   | RequestChanges   | Analyzing (same session)    |
 * | Fixing     | CompleteFix      | Fixed                       |
 * | Fixing     | Fail             | Error                       |
 * | Fixed      | Cleanup          | Pending                     |
 * | Error      | Retry            | Analyzing (new session)     |
 * | Error      | Reject           | Pending                     |
 *
 * @param state - Current issue state
 * @param action - Action to apply
 * @returns Effect that succeeds with new state or fails with InvalidTransitionError
 */
export const transition = (
	state: IssueState,
	action: IssueAction,
): Effect.Effect<IssueState, InvalidTransitionError> =>
	Match.value(state).pipe(
		Match.tag("Pending", () => transitionFromPending(action)),
		Match.tag("Analyzing", (s) => transitionFromAnalyzing(s, action)),
		Match.tag("Proposed", (s) => transitionFromProposed(s, action)),
		Match.tag("Fixing", (s) => transitionFromFixing(s, action)),
		Match.tag("Fixed", () => transitionFromFixed(action)),
		Match.tag("Error", (s) => transitionFromError(s, action)),
		Match.exhaustive,
	);

// -----------------------------------------------------------------------------
// Transition Handlers
// -----------------------------------------------------------------------------

const transitionFromPending = (
	action: IssueAction,
): Effect.Effect<IssueState, InvalidTransitionError> =>
	Match.value(action).pipe(
		Match.tag("StartAnalysis", ({ sessionId }) =>
			Effect.succeed(IssueState.Analyzing({ sessionId })),
		),
		Match.orElse((a) => invalidTransition("Pending", a._tag)),
	);

const transitionFromAnalyzing = (
	state: Data.TaggedEnum.Value<IssueState, "Analyzing">,
	action: IssueAction,
): Effect.Effect<IssueState, InvalidTransitionError> =>
	Match.value(action).pipe(
		Match.tag("CompleteAnalysis", ({ proposal }) =>
			Effect.succeed(IssueState.Proposed({ sessionId: state.sessionId, proposal })),
		),
		Match.tag("Fail", ({ error }) =>
			Effect.succeed(
				IssueState.Error({
					previousState: "analyzing",
					sessionId: state.sessionId,
					error,
				}),
			),
		),
		Match.orElse((a) => invalidTransition("Analyzing", a._tag)),
	);

const transitionFromProposed = (
	state: Data.TaggedEnum.Value<IssueState, "Proposed">,
	action: IssueAction,
): Effect.Effect<IssueState, InvalidTransitionError> =>
	Match.value(action).pipe(
		Match.tag("Approve", ({ worktreePath, worktreeBranch, fixSessionId }) =>
			Effect.succeed(
				IssueState.Fixing({
					analysisSessionId: state.sessionId,
					fixSessionId,
					worktreePath,
					worktreeBranch,
				}),
			),
		),
		Match.tag("Reject", () => Effect.succeed(IssueState.Pending())),
		Match.tag("RequestChanges", () =>
			// Stay in Analyzing with same session - agent continues conversation
			Effect.succeed(IssueState.Analyzing({ sessionId: state.sessionId })),
		),
		Match.orElse((a) => invalidTransition("Proposed", a._tag)),
	);

const transitionFromFixing = (
	state: Data.TaggedEnum.Value<IssueState, "Fixing">,
	action: IssueAction,
): Effect.Effect<IssueState, InvalidTransitionError> =>
	Match.value(action).pipe(
		Match.tag("CompleteFix", () =>
			Effect.succeed(
				IssueState.Fixed({
					analysisSessionId: state.analysisSessionId,
					fixSessionId: state.fixSessionId,
					worktreePath: state.worktreePath,
					worktreeBranch: state.worktreeBranch,
				}),
			),
		),
		Match.tag("Fail", ({ error }) =>
			Effect.succeed(
				IssueState.Error({
					previousState: "fixing",
					sessionId: state.fixSessionId,
					error,
				}),
			),
		),
		Match.orElse((a) => invalidTransition("Fixing", a._tag)),
	);

const transitionFromFixed = (
	action: IssueAction,
): Effect.Effect<IssueState, InvalidTransitionError> =>
	Match.value(action).pipe(
		Match.tag("Cleanup", () => Effect.succeed(IssueState.Pending())),
		Match.orElse((a) => invalidTransition("Fixed", a._tag)),
	);

const transitionFromError = (
	state: Data.TaggedEnum.Value<IssueState, "Error">,
	action: IssueAction,
): Effect.Effect<IssueState, InvalidTransitionError> =>
	Match.value(action).pipe(
		Match.tag("Retry", ({ newSessionId }) =>
			Effect.succeed(IssueState.Analyzing({ sessionId: newSessionId })),
		),
		Match.tag("Reject", () => Effect.succeed(IssueState.Pending())),
		Match.orElse((a) => invalidTransition(`Error(${state.previousState})`, a._tag)),
	);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const invalidTransition = (
	currentState: string,
	attemptedAction: string,
): Effect.Effect<never, InvalidTransitionError> =>
	Effect.fail(
		new InvalidTransitionError({
			currentState,
			attemptedAction,
			message: `Cannot perform '${attemptedAction}' from '${currentState}' state`,
		}),
	);
