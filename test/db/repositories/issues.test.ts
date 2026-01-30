/**
 * @fileoverview Tests for SentryIssueRepository.
 *
 * Uses in-memory SQLite for real database behavior without persistence.
 */

import { BunContext } from "@effect/platform-bun";
import { describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { expect } from "vitest";
import {
	DatabaseTestLive,
	SentryIssueRepository,
	getStatusFromState,
} from "../../../src/db/index.js";
import { IssueState } from "../../../src/domain/issue.js";

// Test layer with in-memory SQLite
const TestLayer = DatabaseTestLive.pipe(Layer.provide(BunContext.layer));

// Helper to create a sample Sentry issue
interface SentryIssueInput {
	id: string;
	project: string;
	data: {
		title: string;
		shortId: string;
		culprit: string;
		firstSeen: Date;
		lastSeen: Date;
		count?: number;
		userCount?: number;
		metadata: {
			type?: string;
			value?: string;
			filename?: string;
			function?: string;
		};
	};
}

const makeSentryIssue = (
	id: string,
	overrides?: { data?: Partial<SentryIssueInput["data"]> },
): SentryIssueInput => ({
	id,
	project: "my-project",
	data: {
		title: `Test Issue ${id}`,
		shortId: `PROJ-${id}`,
		culprit: "src/app.ts",
		firstSeen: new Date("2024-01-01T00:00:00Z"),
		lastSeen: new Date("2024-01-02T00:00:00Z"),
		count: 10,
		userCount: 5,
		metadata: {
			type: "TypeError",
			value: "Cannot read property 'id'",
		},
		...overrides?.data,
	},
});

describe("SentryIssueRepository", () => {
	describe("upsert", () => {
		it.effect("inserts a new issue with Pending state", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;
				const input = makeSentryIssue("123");

				const issue = yield* repo.upsert(input);

				expect(issue.id).toBe("123");
				expect(issue.state._tag).toBe("Pending");
				expect(issue.source._tag).toBe("Sentry");
				if (issue.source._tag === "Sentry") {
					expect(issue.source.project).toBe("my-project");
					expect(issue.source.data.title).toBe("Test Issue 123");
					expect(issue.source.data.count).toBe(10);
				}
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("updates existing issue without changing state", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;

				// Insert initial issue
				const initial = yield* repo.upsert(makeSentryIssue("456"));
				expect(initial.state._tag).toBe("Pending");

				// Update state to Analyzing
				yield* repo.updateState("456", IssueState.Analyzing({ sessionId: "sess-1" }));

				// Upsert with new data
				const updated = yield* repo.upsert(
					makeSentryIssue("456", {
						data: {
							title: "Updated Title",
							shortId: "PROJ-456",
							culprit: "src/updated.ts",
							firstSeen: new Date("2024-01-01T00:00:00Z"),
							lastSeen: new Date("2024-01-03T00:00:00Z"),
							count: 20,
							userCount: 10,
							metadata: { type: "Error" },
						},
					}),
				);

				// State should still be Analyzing
				expect(updated.state._tag).toBe("Analyzing");
				// Data should be updated
				if (updated.source._tag === "Sentry") {
					expect(updated.source.data.title).toBe("Updated Title");
					expect(updated.source.data.count).toBe(20);
				}
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("getById", () => {
		it.effect("returns None for non-existent issue", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;

				const result = yield* repo.getById("non-existent");

				expect(Option.isNone(result)).toBe(true);
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("returns Some for existing issue", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;
				yield* repo.upsert(makeSentryIssue("789"));

				const result = yield* repo.getById("789");

				expect(Option.isSome(result)).toBe(true);
				if (Option.isSome(result)) {
					expect(result.value.id).toBe("789");
				}
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("listAll", () => {
		it.effect("returns empty array when no issues exist", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;

				const issues = yield* repo.listAll();

				expect(issues).toEqual([]);
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("returns all issues ordered by updated_at DESC", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;

				// Insert issues
				yield* repo.upsert(makeSentryIssue("a"));
				yield* repo.upsert(makeSentryIssue("b"));
				yield* repo.upsert(makeSentryIssue("c"));

				// Update 'a' to make it most recently updated
				yield* repo.updateState("a", IssueState.Analyzing({ sessionId: "s" }));

				const issues = yield* repo.listAll();

				expect(issues.length).toBe(3);
				// Most recently updated should be first
				expect(issues[0]?.id).toBe("a");
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("respects limit and offset", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;

				yield* repo.upsert(makeSentryIssue("1"));
				yield* repo.upsert(makeSentryIssue("2"));
				yield* repo.upsert(makeSentryIssue("3"));

				const page1 = yield* repo.listAll({ limit: 2 });
				const page2 = yield* repo.listAll({ limit: 2, offset: 2 });

				expect(page1.length).toBe(2);
				expect(page2.length).toBe(1);
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("listByStatuses", () => {
		it.effect("returns empty array when no issues match", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;
				yield* repo.upsert(makeSentryIssue("x"));

				const issues = yield* repo.listByStatuses(["analyzing"]);

				expect(issues).toEqual([]);
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("filters issues by status", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;

				yield* repo.upsert(makeSentryIssue("pending-1"));
				yield* repo.upsert(makeSentryIssue("analyzing-1"));
				yield* repo.updateState("analyzing-1", IssueState.Analyzing({ sessionId: "s" }));
				yield* repo.upsert(makeSentryIssue("analyzing-2"));
				yield* repo.updateState("analyzing-2", IssueState.Analyzing({ sessionId: "s2" }));

				const analyzing = yield* repo.listByStatuses(["analyzing"]);
				const pending = yield* repo.listByStatuses(["pending"]);
				const both = yield* repo.listByStatuses(["pending", "analyzing"]);

				expect(analyzing.length).toBe(2);
				expect(pending.length).toBe(1);
				expect(both.length).toBe(3);
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("updateState", () => {
		it.effect("transitions from Pending to Analyzing", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;
				yield* repo.upsert(makeSentryIssue("state-1"));

				yield* repo.updateState("state-1", IssueState.Analyzing({ sessionId: "sess-abc" }));

				const issue = yield* repo.getById("state-1");
				expect(Option.isSome(issue)).toBe(true);
				if (Option.isSome(issue)) {
					expect(issue.value.state._tag).toBe("Analyzing");
					if (issue.value.state._tag === "Analyzing") {
						expect(issue.value.state.sessionId).toBe("sess-abc");
					}
				}
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("stores Fixing state with all fields", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;
				yield* repo.upsert(makeSentryIssue("state-2"));

				yield* repo.updateState(
					"state-2",
					IssueState.Fixing({
						analysisSessionId: "analysis-1",
						fixSessionId: "fix-1",
						worktreePath: "/worktrees/state-2",
						worktreeBranch: "fix/state-2",
					}),
				);

				const issue = yield* repo.getById("state-2");
				expect(Option.isSome(issue)).toBe(true);
				if (Option.isSome(issue) && issue.value.state._tag === "Fixing") {
					expect(issue.value.state.analysisSessionId).toBe("analysis-1");
					expect(issue.value.state.fixSessionId).toBe("fix-1");
					expect(issue.value.state.worktreePath).toBe("/worktrees/state-2");
					expect(issue.value.state.worktreeBranch).toBe("fix/state-2");
				}
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("stores Error state with previous state info", () =>
			Effect.gen(function* () {
				const repo = yield* SentryIssueRepository;
				yield* repo.upsert(makeSentryIssue("state-3"));

				yield* repo.updateState(
					"state-3",
					IssueState.Error({
						previousState: "analyzing",
						sessionId: "sess-err",
						error: "Something went wrong",
					}),
				);

				const issue = yield* repo.getById("state-3");
				expect(Option.isSome(issue)).toBe(true);
				if (Option.isSome(issue) && issue.value.state._tag === "Error") {
					expect(issue.value.state.previousState).toBe("analyzing");
					expect(issue.value.state.sessionId).toBe("sess-err");
					expect(issue.value.state.error).toBe("Something went wrong");
				}
			}).pipe(Effect.provide(TestLayer)),
		);
	});
});

describe("getStatusFromState", () => {
	it("returns correct status for each state type", () => {
		expect(getStatusFromState(IssueState.Pending())).toBe("pending");
		expect(getStatusFromState(IssueState.Analyzing({ sessionId: "s" }))).toBe("analyzing");
		expect(getStatusFromState(IssueState.Proposed({ sessionId: "s", proposal: "p" }))).toBe(
			"proposed",
		);
		expect(
			getStatusFromState(
				IssueState.Fixing({
					analysisSessionId: "a",
					fixSessionId: "f",
					worktreePath: "/p",
					worktreeBranch: "b",
				}),
			),
		).toBe("fixing");
		expect(
			getStatusFromState(
				IssueState.Fixed({
					analysisSessionId: "a",
					fixSessionId: "f",
					worktreePath: "/p",
					worktreeBranch: "b",
				}),
			),
		).toBe("fixed");
		expect(
			getStatusFromState(
				IssueState.Error({ previousState: "analyzing", sessionId: "s", error: "e" }),
			),
		).toBe("error");
	});
});
