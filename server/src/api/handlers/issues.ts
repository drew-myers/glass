/**
 * @fileoverview Issue endpoint handlers.
 */

import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Option } from "effect";
import { SentryIssueRepository } from "../../db/index.js";
import type { Issue } from "../../domain/issue.js";

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
