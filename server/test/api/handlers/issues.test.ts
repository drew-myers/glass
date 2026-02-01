/**
 * @fileoverview Tests for issue endpoint handlers.
 * 
 * Tests the refresh logic by verifying database state after handler execution.
 */

import { BunContext } from "@effect/platform-bun";
import { describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { expect } from "vitest";
import { DatabaseTestLive, SentryIssueRepository } from "../../../src/db/index.js";
import { IssueSource } from "../../../src/domain/issue.js";
import {
	SentryService,
	type SentryServiceImpl,
	SentryError,
} from "../../../src/services/sentry/index.js";
import { refreshIssuesHandler } from "../../../src/api/handlers/issues.js";

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
// Test Layer Helpers
// =============================================================================

const createTestLayer = (sentryImpl: SentryServiceImpl) =>
	Layer.mergeAll(
		DatabaseTestLive.pipe(Layer.provide(BunContext.layer)),
		Layer.succeed(SentryService, sentryImpl),
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
