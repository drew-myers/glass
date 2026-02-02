/**
 * @fileoverview Issue endpoint handlers.
 */

import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Option } from "effect";
import { ConversationRepository, SentryIssueRepository } from "../../db/index.js";
import type { Issue } from "../../domain/issue.js";
import { IssueState } from "../../domain/issue.js";
import { AgentService, EventBufferService, type AnalysisEvent } from "../../services/agent/index.js";
import { buildAnalysisPrompt } from "../../services/prompts/index.js";
import { SentryService } from "../../services/sentry/index.js";

// =============================================================================
// Response Mappers
// =============================================================================

/**
 * Maps an Issue to the list response format.
 */
const mapIssueToListItem = (issue: Issue) => {
	const common = issue.source._tag === "Sentry" ? issue.source.data : null;
	
	return {
		id: issue.id,
		sourceType: issue.source._tag.toLowerCase(),
		title: common?.title ?? "Unknown",
		shortId: common?.shortId ?? issue.id,
		status: issue.state._tag.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, ""),
		eventCount: common?.count ?? 0,
		userCount: common?.userCount ?? 0,
		firstSeen: common?.firstSeen?.toISOString() ?? issue.createdAt.toISOString(),
		lastSeen: common?.lastSeen?.toISOString() ?? issue.updatedAt.toISOString(),
		updatedAt: issue.updatedAt.toISOString(),
	};
};

/**
 * Maps IssueState to JSON response format.
 */
const mapStateToResponse = (state: Issue["state"]) => {
	switch (state._tag) {
		case "Pending":
			return { status: "pending" };
		case "Analyzing":
			return { status: "analyzing", analysisSessionId: state.sessionId };
		case "PendingApproval":
			return {
				status: "pending_approval",
				analysisSessionId: state.sessionId,
				proposal: state.proposal,
			};
		case "InProgress":
			return {
				status: "in_progress",
				analysisSessionId: state.analysisSessionId,
				implementationSessionId: state.implementationSessionId,
				worktreePath: state.worktreePath,
				worktreeBranch: state.worktreeBranch,
			};
		case "PendingReview":
			return {
				status: "pending_review",
				analysisSessionId: state.analysisSessionId,
				implementationSessionId: state.implementationSessionId,
				worktreePath: state.worktreePath,
				worktreeBranch: state.worktreeBranch,
			};
		case "Error":
			return {
				status: "error",
				previousStatus: state.previousState,
				sessionId: state.sessionId,
				error: state.error,
			};
	}
};

/**
 * Maps an Issue to the detail response format.
 */
const mapIssueToDetail = (issue: Issue) => {
	const listItem = mapIssueToListItem(issue);
	
	// Build source-specific data
	let source: Record<string, unknown> = {};
	
	if (issue.source._tag === "Sentry") {
		const data = issue.source.data;
		
		// Sort tags by key for consistent ordering
		const sortedTags = data.tags
			? Object.fromEntries(Object.entries(data.tags).sort(([a], [b]) => a.localeCompare(b)))
			: undefined;
		
		source = {
			title: data.title,
			shortId: data.shortId,
			culprit: data.culprit,
			eventCount: data.count,
			userCount: data.userCount,
			firstSeen: data.firstSeen?.toISOString(),
			lastSeen: data.lastSeen?.toISOString(),
			metadata: data.metadata,
			exceptions: data.exceptions,
			breadcrumbs: data.breadcrumbs,
			environment: data.environment,
			release: data.release,
			tags: sortedTags,
			request: data.request,
			user: data.user,
			contexts: data.contexts,
		};
	}
	
	return {
		id: issue.id,
		sourceType: listItem.sourceType,
		status: listItem.status,
		source,
		state: mapStateToResponse(issue.state),
		createdAt: issue.createdAt.toISOString(),
		updatedAt: issue.updatedAt.toISOString(),
	};
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Enriches an issue with proposal content if in PendingApproval state.
 * The proposal is stored separately in the proposals table.
 */
const enrichWithProposal = (issue: Issue) =>
	Effect.gen(function* () {
		if (issue.state._tag !== "PendingApproval") {
			return issue;
		}

		const conversationRepo = yield* ConversationRepository;
		const maybeProposal = yield* conversationRepo.getProposal(issue.id).pipe(
			Effect.catchAll(() => Effect.succeed(Option.none())),
		);

		if (Option.isNone(maybeProposal)) {
			return issue;
		}

		return {
			...issue,
			state: IssueState.PendingApproval({
				sessionId: issue.state.sessionId,
				proposal: maybeProposal.value.content,
			}),
		};
	});

// =============================================================================
// Handlers
// =============================================================================

/**
 * GET /api/v1/issues
 */
export const listIssuesHandler = Effect.gen(function* () {
	const issueRepo = yield* SentryIssueRepository;
	
	// TODO: Parse query params for filtering
	const issues = yield* issueRepo.listAll().pipe(
		Effect.catchAll((error) => {
			return Effect.logError("Failed to list issues", { error }).pipe(
				Effect.map(() => [] as readonly Issue[]),
			);
		}),
	);
	
	const response = {
		issues: issues.map(mapIssueToListItem),
		total: issues.length,
		limit: 50,
		offset: 0,
	};
	
	return yield* HttpServerResponse.json(response);
});

/**
 * GET /api/v1/issues/:id
 */
export const getIssueHandler = Effect.gen(function* () {
	const issueRepo = yield* SentryIssueRepository;
	const request = yield* HttpServerRequest.HttpServerRequest;
	
	// Extract ID from path params
	const url = new URL(request.url, "http://localhost");
	const pathParts = url.pathname.split("/");
	const id = pathParts[pathParts.length - 1];
	
	if (!id) {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: "Issue ID is required",
				},
			},
			{ status: 400 },
		);
	}
	
	// Try to find issue - first as direct ID, then as sentry:{id}
	const maybeIssue = yield* issueRepo.getById(id).pipe(
		Effect.catchAll(() => Effect.succeed(Option.none<Issue>())),
	);
	
	let issue: Issue | null = Option.isSome(maybeIssue) ? maybeIssue.value : null;
	
	if (!issue) {
		const maybeIssue2 = yield* issueRepo.getById(`sentry:${id}`).pipe(
			Effect.catchAll(() => Effect.succeed(Option.none<Issue>())),
		);
		issue = Option.isSome(maybeIssue2) ? maybeIssue2.value : null;
	}
	
	if (!issue) {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "NOT_FOUND",
					message: `Issue not found: ${id}`,
				},
			},
			{ status: 404 },
		);
	}

	// Enrich with proposal if in PendingApproval state
	const enrichedIssue = yield* enrichWithProposal(issue);
	
	return yield* HttpServerResponse.json(mapIssueToDetail(enrichedIssue));
});

/**
 * POST /api/v1/issues/refresh
 *
 * Fetches issues from Sentry, upserts them into the local database,
 * and returns the full issue list (same format as GET /issues).
 */
export const refreshIssuesHandler = Effect.gen(function* () {
	const sentry = yield* SentryService;
	const issueRepo = yield* SentryIssueRepository;

	// Fetch issues from Sentry
	const sources = yield* sentry.listIssues().pipe(
		Effect.mapError((error) => ({
			_tag: "SentryError" as const,
			error,
		})),
	);

	// Upsert each issue
	for (const source of sources) {
		if (source._tag !== "Sentry") continue;

		const { project, data } = source;
		const id = data.sentryId;

		yield* issueRepo.upsert({ id, project, data }).pipe(
			Effect.catchAll((error) =>
				Effect.logWarning("Failed to upsert issue", { id, error }),
			),
		);
	}

	// Return the full issue list (same as GET /issues)
	const issues = yield* issueRepo.listAll().pipe(
		Effect.catchAll((error) => {
			return Effect.logError("Failed to list issues", { error }).pipe(
				Effect.map(() => [] as readonly Issue[]),
			);
		}),
	);

	const response = {
		issues: issues.map(mapIssueToListItem),
		total: issues.length,
		limit: 50,
		offset: 0,
	};

	return yield* HttpServerResponse.json(response);
}).pipe(
	Effect.catchTag("SentryError", (e) =>
		HttpServerResponse.json(
			{
				error: {
					code: "SENTRY_ERROR",
					message: `Failed to fetch issues from Sentry: ${e.error._tag}`,
				},
			},
			{ status: 502 },
		),
	),
);

/**
 * POST /api/v1/issues/:id/refresh
 *
 * Fetches fresh data for a single issue from Sentry, updates the local database,
 * and returns the updated issue detail (same format as GET /issues/:id).
 */
export const refreshIssueHandler = Effect.gen(function* () {
	const sentry = yield* SentryService;
	const issueRepo = yield* SentryIssueRepository;
	const request = yield* HttpServerRequest.HttpServerRequest;

	// Extract ID from path params (format: /api/v1/issues/:id/refresh)
	const url = new URL(request.url, "http://localhost");
	const pathParts = url.pathname.split("/");
	const id = pathParts[pathParts.length - 2]; // Second to last segment

	if (!id) {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: "Issue ID is required",
				},
			},
			{ status: 400 },
		);
	}

	// Look up the issue to get the Sentry ID
	const maybeIssue = yield* issueRepo.getById(id).pipe(
		Effect.catchAll(() => Effect.succeed(Option.none<Issue>())),
	);

	let issue: Issue | null = Option.isSome(maybeIssue) ? maybeIssue.value : null;

	if (!issue) {
		const maybeIssue2 = yield* issueRepo.getById(`sentry:${id}`).pipe(
			Effect.catchAll(() => Effect.succeed(Option.none<Issue>())),
		);
		issue = Option.isSome(maybeIssue2) ? maybeIssue2.value : null;
	}

	if (!issue || issue.source._tag !== "Sentry") {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "NOT_FOUND",
					message: `Issue not found: ${id}`,
				},
			},
			{ status: 404 },
		);
	}

	const sentryId = issue.source.data.sentryId;

	// Fetch fresh data from Sentry
	const [issueSource, eventData] = yield* Effect.all([
		sentry.getIssue(sentryId),
		sentry.getLatestEvent(sentryId),
	]).pipe(
		Effect.mapError((error) => ({
			_tag: "SentryError" as const,
			error,
		})),
	);

	if (issueSource._tag !== "Sentry") {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Unexpected issue source type",
				},
			},
			{ status: 500 },
		);
	}

	// Merge issue data with event data (only include defined optional fields)
	const mergedData = {
		...issueSource.data,
		...(eventData.exceptions && { exceptions: eventData.exceptions }),
		...(eventData.breadcrumbs && { breadcrumbs: eventData.breadcrumbs }),
		...(eventData.environment && { environment: eventData.environment }),
		...(eventData.release && { release: eventData.release }),
		...(eventData.tags && { tags: eventData.tags }),
		...(eventData.request && { request: eventData.request }),
		...(eventData.user && { user: eventData.user }),
		...(eventData.contexts && { contexts: eventData.contexts }),
	};

	// Upsert the updated issue
	const updatedIssue = yield* issueRepo.upsert({
		id: sentryId,
		project: issueSource.project,
		data: mergedData,
	}).pipe(
		Effect.mapError((error) => ({
			_tag: "DbError" as const,
			error,
		})),
	);

	// Enrich with proposal if in PendingApproval state
	const enrichedIssue = yield* enrichWithProposal(updatedIssue);

	return yield* HttpServerResponse.json(mapIssueToDetail(enrichedIssue));
}).pipe(
	Effect.catchTag("SentryError", (e) =>
		HttpServerResponse.json(
			{
				error: {
					code: "SENTRY_ERROR",
					message: `Failed to fetch issue from Sentry: ${e.error._tag}`,
				},
			},
			{ status: 502 },
		),
	),
	Effect.catchTag("DbError", () =>
		HttpServerResponse.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Failed to update issue in database",
				},
			},
			{ status: 500 },
		),
	),
);

/**
 * POST /api/v1/issues/:id/analyze
 *
 * Starts a headless Pi analysis session for the issue.
 * The analysis runs in background; this returns immediately with session info.
 *
 * Valid only when issue is in `pending` or `error` state.
 */
export const analyzeIssueHandler = Effect.gen(function* () {
	const agentService = yield* AgentService;
	const eventBuffer = yield* EventBufferService;
	const issueRepo = yield* SentryIssueRepository;
	const conversationRepo = yield* ConversationRepository;
	const request = yield* HttpServerRequest.HttpServerRequest;

	// Extract ID from path params (format: /api/v1/issues/:id/analyze)
	const url = new URL(request.url, "http://localhost");
	const pathParts = url.pathname.split("/");
	const id = pathParts[pathParts.length - 2]; // Second to last segment

	if (!id) {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: "Issue ID is required",
				},
			},
			{ status: 400 },
		);
	}

	// Look up the issue
	const maybeIssue = yield* issueRepo.getById(id).pipe(
		Effect.catchAll(() => Effect.succeed(Option.none<Issue>())),
	);

	let issue: Issue | null = Option.isSome(maybeIssue) ? maybeIssue.value : null;

	// Also try with sentry: prefix
	if (!issue) {
		const maybeIssue2 = yield* issueRepo.getById(`sentry:${id}`).pipe(
			Effect.catchAll(() => Effect.succeed(Option.none<Issue>())),
		);
		issue = Option.isSome(maybeIssue2) ? maybeIssue2.value : null;
	}

	if (!issue) {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "NOT_FOUND",
					message: `Issue not found: ${id}`,
				},
			},
			{ status: 404 },
		);
	}

	// Allow analysis from: Pending, Error, Analyzing (restart), PendingApproval (re-analyze)
	const allowedStates = ["Pending", "Error", "Analyzing", "PendingApproval"];
	if (!allowedStates.includes(issue.state._tag)) {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "INVALID_STATE",
					message: `Cannot analyze issue in '${issue.state._tag}' state. Allowed: ${allowedStates.join(", ")}.`,
				},
			},
			{ status: 409 },
		);
	}

	// Create analysis session
	const sessionHandle = yield* agentService.createAnalysisSession().pipe(
		Effect.mapError((error) => ({
			_tag: "AgentError" as const,
			error,
		})),
	);

	// Create event buffer for this session (keyed by issue ID for client access)
	yield* eventBuffer.createBuffer(issue.id);

	// Update issue state to Analyzing
	yield* issueRepo.updateState(issue.id, IssueState.Analyzing({ sessionId: sessionHandle.sessionId })).pipe(
		Effect.mapError((error) => ({
			_tag: "DbError" as const,
			error,
		})),
	);

	// Build the analysis prompt
	const prompt = buildAnalysisPrompt(issue);

	// Capture variables for the background task
	const issueId = issue.id;

	// Helper to append event to buffer
	const appendEvent = (event: AnalysisEvent) => {
		Effect.runSync(eventBuffer.appendEvent(issueId, event));
	};

	// Start analysis in background
	// Subscribe to events to capture the proposal and stream to clients
	Effect.runFork(
		Effect.async<void, never>((resume) => {
			let proposalText = "";
			let isThinking = false;

			// Subscribe to agent events
			const unsubscribe = sessionHandle.subscribe((event) => {
				switch (event.type) {
					case "message_update": {
						const assistantEvent = event.assistantMessageEvent;
						if (assistantEvent.type === "text_delta") {
							proposalText += assistantEvent.delta;
							appendEvent({ type: "text_delta", delta: assistantEvent.delta });
						} else if (assistantEvent.type === "thinking_delta") {
							// Signal thinking state (only send once per thinking block)
							if (!isThinking) {
								isThinking = true;
								appendEvent({ type: "thinking" });
							}
						}
						break;
					}

					case "message_end":
						// Reset thinking state for next message
						isThinking = false;
						break;

					case "tool_execution_start":
						appendEvent({
							type: "tool_start",
							tool: event.toolName,
							args: event.args as Record<string, unknown>,
						});
						break;

					case "tool_execution_update":
						// Stream tool output (partialResult contains streaming output)
						if (event.partialResult) {
							const output = typeof event.partialResult === "string"
								? event.partialResult
								: JSON.stringify(event.partialResult);
							appendEvent({ type: "tool_output", output });
						}
						break;

					case "tool_execution_end":
						appendEvent({
							type: "tool_end",
							tool: event.toolName,
							isError: event.isError,
						});
						break;

					case "agent_end":
						// Agent finished - save proposal and update state
						unsubscribe();
						Effect.runPromise(
							Effect.gen(function* () {
								// Save the proposal to the database
								yield* conversationRepo.saveProposal(issueId, proposalText).pipe(
									Effect.catchAll(() => Effect.void),
								);
								// Update issue state
								yield* issueRepo.updateState(
									issueId,
									IssueState.PendingApproval({
										sessionId: sessionHandle.sessionId,
										proposal: proposalText,
									}),
								);
								// Send completion event with proposal
								appendEvent({ type: "complete", proposal: proposalText });
							}).pipe(Effect.catchAll(() => Effect.void)),
						).then(() => resume(Effect.void));
						break;
				}
			});

			// Send the prompt
			sessionHandle.prompt(prompt).pipe(
				Effect.tapError((error) =>
					Effect.gen(function* () {
						unsubscribe();
						// Send error event
						appendEvent({ type: "error", message: error.message });
						// Update issue state to Error
						yield* issueRepo.updateState(
							issueId,
							IssueState.Error({
								previousState: "analyzing",
								sessionId: sessionHandle.sessionId,
								error: error.message,
							}),
						).pipe(Effect.catchAll(() => Effect.void));
					}),
				),
				Effect.catchAll(() => Effect.void),
				Effect.runPromise,
			);
		}),
	);

	return yield* HttpServerResponse.json({
		status: "analyzing",
		sessionId: sessionHandle.sessionId,
	});
}).pipe(
	Effect.catchTag("AgentError", (e) =>
		HttpServerResponse.json(
			{
				error: {
					code: "AGENT_ERROR",
					message: `Failed to create analysis session: ${e.error.message}`,
				},
			},
			{ status: 500 },
		),
	),
	Effect.catchTag("DbError", () =>
		HttpServerResponse.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Failed to update issue state",
				},
			},
			{ status: 500 },
		),
	),
);

/**
 * GET /api/v1/issues/:id/events
 *
 * Server-Sent Events endpoint for streaming analysis progress.
 * First message is a backfill of all events so far, then live events follow.
 *
 * Returns 404 if no active analysis session exists for this issue.
 */
export const eventsHandler = Effect.gen(function* () {
	const eventBuffer = yield* EventBufferService;
	const request = yield* HttpServerRequest.HttpServerRequest;

	// Extract ID from path params (format: /api/v1/issues/:id/events)
	const url = new URL(request.url, "http://localhost");
	const pathParts = url.pathname.split("/");
	const id = pathParts[pathParts.length - 2]; // Second to last segment

	if (!id) {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: "Issue ID is required",
				},
			},
			{ status: 400 },
		);
	}

	// Try to subscribe to the event buffer
	// Need to handle both direct ID and sentry: prefixed ID
	let subscription = yield* eventBuffer.subscribe(id, () => {});
	if (!subscription) {
		subscription = yield* eventBuffer.subscribe(`sentry:${id}`, () => {});
	}

	if (!subscription) {
		return yield* HttpServerResponse.json(
			{
				error: {
					code: "NOT_FOUND",
					message: `No active analysis session for issue: ${id}`,
				},
			},
			{ status: 404 },
		);
	}

	// Unsubscribe from the test subscription
	subscription.unsubscribe();

	// Create SSE stream
	const issueId = id.startsWith("sentry:") ? id : `sentry:${id}`;
	const stream = new ReadableStream({
		start: async (controller) => {
			const encoder = new TextEncoder();
			let unsubscribeFn: (() => void) | null = null;

			const sendEvent = (data: unknown) => {
				const json = JSON.stringify(data);
				controller.enqueue(encoder.encode(`data: ${json}\n\n`));
			};

			const closeStream = () => {
				if (unsubscribeFn) {
					unsubscribeFn();
					unsubscribeFn = null;
				}
				controller.close();
			};

			// Subscribe and get backfill
			const result = await Effect.runPromise(
				eventBuffer.subscribe(issueId, (event) => {
					sendEvent(event);
					// Close stream on terminal events
					if (event.type === "complete" || event.type === "error") {
						closeStream();
					}
				}).pipe(
					Effect.catchAll(() => Effect.succeed(null)),
				),
			);

			// Also try without prefix if not found
			const finalResult = result ?? await Effect.runPromise(
				eventBuffer.subscribe(id, (event) => {
					sendEvent(event);
					// Close stream on terminal events
					if (event.type === "complete" || event.type === "error") {
						closeStream();
					}
				}).pipe(
					Effect.catchAll(() => Effect.succeed(null)),
				),
			);

			if (!finalResult) {
				// Session ended between check and subscribe
				sendEvent({ type: "error", message: "Session ended" });
				controller.close();
				return;
			}

			unsubscribeFn = finalResult.unsubscribe;

			// Send backfill as first message
			sendEvent({ type: "backfill", events: finalResult.backfill });

			// Check if already completed (backfill contains complete or error)
			const isCompleted = finalResult.backfill.some(
				(e) => e.type === "complete" || e.type === "error",
			);

			if (isCompleted) {
				closeStream();
			}

			// Live events will be sent via the subscription callback
			// The stream stays open until the client disconnects or we get complete/error
		},
	});

	return yield* HttpServerResponse.raw(stream, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
});
