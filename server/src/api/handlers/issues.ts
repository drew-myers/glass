/**
 * @fileoverview Issue endpoint handlers.
 */

import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Option } from "effect";
import { SentryIssueRepository } from "../../db/index.js";
import type { Issue } from "../../domain/issue.js";
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
		status: issue.state._tag.toLowerCase().replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, ""),
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
			tags: data.tags,
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
	
	return yield* HttpServerResponse.json(mapIssueToDetail(issue));
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

	return yield* HttpServerResponse.json(mapIssueToDetail(updatedIssue));
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
