/**
 * @fileoverview Tests for issue endpoint handlers.
 * 
 * Tests the refresh logic by verifying database state after handler execution.
 */

import { BunContext } from "@effect/platform-bun";
import { describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { expect } from "vitest";
import { DatabaseTestLive, SentryIssueRepository, ConversationRepository } from "../../../src/db/index.js";
import { IssueSource } from "../../../src/domain/issue.js";
import {
	SentryService,
	type SentryServiceImpl,
	SentryError,
} from "../../../src/services/sentry/index.js";
import {
	AgentService,
	type AgentServiceInterface,
	EventBufferService,
	EventBufferServiceLive,
} from "../../../src/services/agent/index.js";
import { AgentError } from "../../../src/services/agent/errors.js";
import type { AgentSessionHandle } from "../../../src/services/agent/types.js";
import { refreshIssuesHandler, analyzeIssueHandler } from "../../../src/api/handlers/issues.js";
import { HttpServerRequest } from "@effect/platform";

// =============================================================================
// Test Fixtures
// =============================================================================

const makeSentrySource = (id: string, title: string) =>
	IssueSource.Sentry({
		project: "test-project",
		data: {
			sentryId: id,
			title,
			shortId: `TEST-${id}`,
			culprit: "src/app.ts",
			firstSeen: new Date("2024-01-01T00:00:00Z"),
			lastSeen: new Date("2024-01-02T00:00:00Z"),
			count: 10,
			userCount: 5,
			metadata: {
				type: "TypeError",
				value: "Cannot read property",
			},
		},
	});

// =============================================================================
// Mock SentryService
// =============================================================================

const createMockSentryService = (
	issues: readonly ReturnType<typeof makeSentrySource>[],
): SentryServiceImpl => ({
	listIssues: () => Effect.succeed(issues),
	getIssue: () => Effect.fail(SentryError.NotFoundError({ resource: "issue", id: "unknown" })),
	getLatestEvent: () =>
		Effect.fail(SentryError.NotFoundError({ resource: "event", id: "unknown" })),
});

const createFailingSentryService = (error: SentryError): SentryServiceImpl => ({
	listIssues: () => Effect.fail(error),
	getIssue: () => Effect.fail(error),
	getLatestEvent: () => Effect.fail(error),
});

// =============================================================================
// Mock AgentService
// =============================================================================

const createMockAgentService = (options?: {
	failOnCreate?: boolean;
	sessionId?: string;
}): AgentServiceInterface => {
	const sessionId = options?.sessionId ?? "test-session-123";

	const mockHandle: AgentSessionHandle = {
		sessionId,
		session: {} as AgentSessionHandle["session"],
		type: "analysis",
		prompt: () => Effect.void,
		subscribe: () => () => {},
		abort: () => Effect.void,
	};

	return {
		createAnalysisSession: () =>
			options?.failOnCreate
				? Effect.fail(new AgentError({ operation: "createSession", message: "Mock error" }))
				: Effect.succeed(mockHandle),
		createFixSession: () => Effect.succeed(mockHandle),
		getSession: () => Effect.succeed(null),
		disposeSession: () => Effect.void,
		disposeAll: () => Effect.void,
	};
};

// =============================================================================
// Mock HttpServerRequest
// =============================================================================

const createMockRequest = (path: string) =>
	Layer.succeed(HttpServerRequest.HttpServerRequest, {
		url: `http://localhost${path}`,
		method: "POST",
		headers: new Headers(),
		remoteAddress: Option.none(),
		// Stub remaining required properties
		source: null as unknown,
		originalUrl: `http://localhost${path}`,
		cookies: Effect.succeed({}),
		multipart: Effect.die("not implemented"),
		upgrade: Effect.die("not implemented"),
		modify: () => null as unknown,
		arrayBuffer: Effect.die("not implemented"),
		formData: Effect.die("not implemented"),
		json: Effect.die("not implemented"),
		stream: null as unknown,
		text: Effect.die("not implemented"),
		urlParamsBody: Effect.die("not implemented"),
	} as unknown as HttpServerRequest.HttpServerRequest);

// =============================================================================
// Test Layer Helpers
// =============================================================================

const createTestLayer = (sentryImpl: SentryServiceImpl) =>
	Layer.mergeAll(
		DatabaseTestLive.pipe(Layer.provide(BunContext.layer)),
		Layer.succeed(SentryService, sentryImpl),
	);

const createAnalyzeTestLayer = (agentImpl: AgentServiceInterface) =>
	Layer.mergeAll(
		DatabaseTestLive.pipe(Layer.provide(BunContext.layer)),
		Layer.succeed(AgentService, agentImpl),
		EventBufferServiceLive,
	);

// =============================================================================
// Tests
// =============================================================================

describe("refreshIssuesHandler", () => {
	it.effect("returns issues in list format", () =>
		Effect.gen(function* () {
			const response = yield* refreshIssuesHandler;

			// Body is Uint8Array - need to decode it
			const rawBody = (response.body as { body: Uint8Array }).body;
			const jsonString = new TextDecoder().decode(rawBody);
			const body = JSON.parse(jsonString) as {
				issues: Array<{ id: string; title: string; status: string }>;
				total: number;
				limit: number;
				offset: number;
			};

			expect(body.total).toBe(2);
			expect(body.limit).toBe(50);
			expect(body.offset).toBe(0);
			expect(body.issues).toHaveLength(2);
			expect(body.issues.map((i) => i.id).sort()).toEqual(["1", "2"]);
			expect(body.issues[0]?.status).toBe("pending");
			expect(body.issues[0]?.title).toBeDefined();
		}).pipe(
			Effect.provide(
				createTestLayer(
					createMockSentryService([
						makeSentrySource("1", "Issue One"),
						makeSentrySource("2", "Issue Two"),
					]),
				),
			),
		),
	);

	it.effect("stores no issues when Sentry returns empty list", () =>
		Effect.gen(function* () {
			yield* refreshIssuesHandler;

			const repo = yield* SentryIssueRepository;
			const stored = yield* repo.listAll();
			expect(stored.length).toBe(0);
		}).pipe(Effect.provide(createTestLayer(createMockSentryService([])))),
	);

	it.effect("creates new issues from Sentry", () =>
		Effect.gen(function* () {
			yield* refreshIssuesHandler;

			const repo = yield* SentryIssueRepository;
			const stored = yield* repo.listAll();
			
			expect(stored.length).toBe(2);
			expect(stored.map(i => i.id).sort()).toEqual(["1", "2"]);
		}).pipe(
			Effect.provide(
				createTestLayer(
					createMockSentryService([
						makeSentrySource("1", "Issue One"),
						makeSentrySource("2", "Issue Two"),
					]),
				),
			),
		),
	);

	it.effect("updates existing issues with new data", () =>
		Effect.gen(function* () {
			const repo = yield* SentryIssueRepository;

			// Pre-populate an issue
			yield* repo.upsert({
				id: "existing",
				project: "test-project",
				data: {
					sentryId: "existing",
					title: "Old Title",
					shortId: "TEST-existing",
					culprit: "src/old.ts",
					firstSeen: new Date("2024-01-01T00:00:00Z"),
					lastSeen: new Date("2024-01-01T00:00:00Z"),
					count: 1,
					userCount: 1,
					metadata: {},
				},
			});

			// Run refresh with updated data for the same issue
			yield* refreshIssuesHandler.pipe(
				Effect.provide(
					Layer.succeed(
						SentryService,
						createMockSentryService([makeSentrySource("existing", "Updated Title")]),
					),
				),
			);

			// Verify issue was updated
			const updated = yield* repo.getById("existing");
			expect(Option.isSome(updated)).toBe(true);
			if (Option.isSome(updated) && updated.value.source._tag === "Sentry") {
				expect(updated.value.source.data.title).toBe("Updated Title");
			}
		}).pipe(Effect.provide(createTestLayer(createMockSentryService([])))),
	);

	it.effect("preserves issue state when updating", () =>
		Effect.gen(function* () {
			const repo = yield* SentryIssueRepository;
			const { IssueState } = yield* Effect.promise(() => import("../../../src/domain/issue.js"));

			// Pre-populate an issue and set it to Analyzing state
			yield* repo.upsert({
				id: "stateful",
				project: "test-project",
				data: {
					sentryId: "stateful",
					title: "Original",
					shortId: "TEST-stateful",
					culprit: "src/app.ts",
					firstSeen: new Date("2024-01-01T00:00:00Z"),
					lastSeen: new Date("2024-01-01T00:00:00Z"),
					count: 1,
					userCount: 1,
					metadata: {},
				},
			});
			yield* repo.updateState("stateful", IssueState.Analyzing({ sessionId: "session-123" }));

			// Run refresh
			yield* refreshIssuesHandler.pipe(
				Effect.provide(
					Layer.succeed(
						SentryService,
						createMockSentryService([makeSentrySource("stateful", "Updated")]),
					),
				),
			);

			// Verify state was preserved
			const updated = yield* repo.getById("stateful");
			expect(Option.isSome(updated)).toBe(true);
			if (Option.isSome(updated)) {
				expect(updated.value.state._tag).toBe("Analyzing");
				if (updated.value.state._tag === "Analyzing") {
					expect(updated.value.state.sessionId).toBe("session-123");
				}
			}
		}).pipe(Effect.provide(createTestLayer(createMockSentryService([])))),
	);

	it.effect("returns error response on Sentry API failure", () =>
		Effect.gen(function* () {
			const response = yield* refreshIssuesHandler;
			
			// Should return 502 status
			expect(response.status).toBe(502);
		}).pipe(
			Effect.provide(
				createTestLayer(
					createFailingSentryService(
						SentryError.RateLimitError({
							resetAt: new Date(),
							limit: 100,
							remaining: 0,
						}),
					),
				),
			),
		),
	);

	it.effect("returns error response on Sentry auth failure", () =>
		Effect.gen(function* () {
			const response = yield* refreshIssuesHandler;
			
			expect(response.status).toBe(502);
		}).pipe(
			Effect.provide(
				createTestLayer(
					createFailingSentryService(
						SentryError.AuthError({
							status: 401,
							message: "Invalid token",
						}),
					),
				),
			),
		),
	);
});

// =============================================================================
// analyzeIssueHandler Tests
// =============================================================================

describe("analyzeIssueHandler", () => {
	it.effect("starts analysis for pending issue", () =>
		Effect.gen(function* () {
			const repo = yield* SentryIssueRepository;

			// Create a pending issue
			yield* repo.upsert({
				id: "analyze-1",
				project: "test-project",
				data: {
					sentryId: "analyze-1",
					title: "Test Issue",
					shortId: "TEST-1",
					culprit: "src/app.ts",
					firstSeen: new Date("2024-01-01T00:00:00Z"),
					lastSeen: new Date("2024-01-02T00:00:00Z"),
					count: 10,
					userCount: 5,
					metadata: { type: "TypeError", value: "Test error" },
				},
			});

			const response = yield* analyzeIssueHandler.pipe(
				Effect.provide(createMockRequest("/api/v1/issues/analyze-1/analyze")),
			);

			// Should return 200 with session info
			expect(response.status).toBe(200);

			const rawBody = (response.body as { body: Uint8Array }).body;
			const body = JSON.parse(new TextDecoder().decode(rawBody)) as {
				status: string;
				sessionId: string;
			};

			expect(body.status).toBe("analyzing");
			expect(body.sessionId).toBe("test-session-123");

			// Verify issue state was updated
			const updated = yield* repo.getById("analyze-1");
			expect(Option.isSome(updated)).toBe(true);
			if (Option.isSome(updated)) {
				expect(updated.value.state._tag).toBe("Analyzing");
			}
		}).pipe(Effect.provide(createAnalyzeTestLayer(createMockAgentService()))),
	);

	it.effect("returns 404 for non-existent issue", () =>
		Effect.gen(function* () {
			const response = yield* analyzeIssueHandler.pipe(
				Effect.provide(createMockRequest("/api/v1/issues/nonexistent/analyze")),
			);

			expect(response.status).toBe(404);

			const rawBody = (response.body as { body: Uint8Array }).body;
			const body = JSON.parse(new TextDecoder().decode(rawBody)) as {
				error: { code: string; message: string };
			};

			expect(body.error.code).toBe("NOT_FOUND");
		}).pipe(Effect.provide(createAnalyzeTestLayer(createMockAgentService()))),
	);

	it.effect("returns 409 for issue in wrong state", () =>
		Effect.gen(function* () {
			const repo = yield* SentryIssueRepository;
			const { IssueState } = yield* Effect.promise(() => import("../../../src/domain/issue.js"));

			// Create an issue and set it to Analyzing state
			yield* repo.upsert({
				id: "already-analyzing",
				project: "test-project",
				data: {
					sentryId: "already-analyzing",
					title: "Already Analyzing",
					shortId: "TEST-2",
					culprit: "src/app.ts",
					firstSeen: new Date("2024-01-01T00:00:00Z"),
					lastSeen: new Date("2024-01-02T00:00:00Z"),
					count: 10,
					userCount: 5,
					metadata: {},
				},
			});
			yield* repo.updateState(
				"already-analyzing",
				IssueState.Analyzing({ sessionId: "existing-session" }),
			);

			const response = yield* analyzeIssueHandler.pipe(
				Effect.provide(createMockRequest("/api/v1/issues/already-analyzing/analyze")),
			);

			expect(response.status).toBe(409);

			const rawBody = (response.body as { body: Uint8Array }).body;
			const body = JSON.parse(new TextDecoder().decode(rawBody)) as {
				error: { code: string; message: string };
			};

			expect(body.error.code).toBe("INVALID_STATE");
		}).pipe(Effect.provide(createAnalyzeTestLayer(createMockAgentService()))),
	);

	it.effect("allows analysis from error state", () =>
		Effect.gen(function* () {
			const repo = yield* SentryIssueRepository;
			const { IssueState } = yield* Effect.promise(() => import("../../../src/domain/issue.js"));

			// Create an issue in Error state
			yield* repo.upsert({
				id: "errored",
				project: "test-project",
				data: {
					sentryId: "errored",
					title: "Previously Failed",
					shortId: "TEST-3",
					culprit: "src/app.ts",
					firstSeen: new Date("2024-01-01T00:00:00Z"),
					lastSeen: new Date("2024-01-02T00:00:00Z"),
					count: 10,
					userCount: 5,
					metadata: {},
				},
			});
			yield* repo.updateState(
				"errored",
				IssueState.Error({
					previousState: "analyzing",
					sessionId: "old-session",
					error: "Previous error",
				}),
			);

			const response = yield* analyzeIssueHandler.pipe(
				Effect.provide(createMockRequest("/api/v1/issues/errored/analyze")),
			);

			expect(response.status).toBe(200);

			// Verify state was updated to Analyzing
			const updated = yield* repo.getById("errored");
			expect(Option.isSome(updated)).toBe(true);
			if (Option.isSome(updated)) {
				expect(updated.value.state._tag).toBe("Analyzing");
			}
		}).pipe(Effect.provide(createAnalyzeTestLayer(createMockAgentService()))),
	);

	it.effect("returns 500 when agent service fails", () =>
		Effect.gen(function* () {
			const repo = yield* SentryIssueRepository;

			// Create a pending issue
			yield* repo.upsert({
				id: "agent-fail",
				project: "test-project",
				data: {
					sentryId: "agent-fail",
					title: "Agent Will Fail",
					shortId: "TEST-4",
					culprit: "src/app.ts",
					firstSeen: new Date("2024-01-01T00:00:00Z"),
					lastSeen: new Date("2024-01-02T00:00:00Z"),
					count: 10,
					userCount: 5,
					metadata: {},
				},
			});

			const response = yield* analyzeIssueHandler.pipe(
				Effect.provide(createMockRequest("/api/v1/issues/agent-fail/analyze")),
			);

			expect(response.status).toBe(500);

			const rawBody = (response.body as { body: Uint8Array }).body;
			const body = JSON.parse(new TextDecoder().decode(rawBody)) as {
				error: { code: string; message: string };
			};

			expect(body.error.code).toBe("AGENT_ERROR");
		}).pipe(
			Effect.provide(createAnalyzeTestLayer(createMockAgentService({ failOnCreate: true }))),
		),
	);
});
