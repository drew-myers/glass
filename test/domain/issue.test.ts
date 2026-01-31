import { describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { expect } from "vitest";
import {
	type InvalidTransitionError,
	IssueAction,
	IssueSource,
	IssueState,
	getSourceCommon,
	getSourceType,
	transition,
} from "../../src/domain/index.js";

// ----------------------------------------------------------------------------
// State Factory Helpers
// ----------------------------------------------------------------------------

const pending = () => IssueState.Pending();
const analyzing = (sessionId = "session-1") => IssueState.Analyzing({ sessionId });
const pendingApproval = (sessionId = "session-1", proposal = "The plan") =>
	IssueState.PendingApproval({ sessionId, proposal });
const inProgress = (opts?: Partial<Parameters<typeof IssueState.InProgress>[0]>) =>
	IssueState.InProgress({
		analysisSessionId: "session-1",
		implementationSessionId: "impl-session-1",
		worktreePath: "/worktrees/issue-123",
		worktreeBranch: "fix/issue-123",
		...opts,
	});
const pendingReview = (opts?: Partial<Parameters<typeof IssueState.PendingReview>[0]>) =>
	IssueState.PendingReview({
		analysisSessionId: "session-1",
		implementationSessionId: "impl-session-1",
		worktreePath: "/worktrees/issue-123",
		worktreeBranch: "fix/issue-123",
		...opts,
	});
const error = (previousState: "analyzing" | "in_progress", sessionId = "session-1") =>
	IssueState.Error({
		previousState,
		sessionId,
		error: "Something went wrong",
	});

// ----------------------------------------------------------------------------
// Valid Transitions: Pending
// ----------------------------------------------------------------------------

describe("transition from Pending", () => {
	it.effect("StartAnalysis -> Analyzing", () =>
		Effect.gen(function* () {
			const result = yield* transition(pending(), IssueAction.StartAnalysis({ sessionId: "s1" }));

			expect(result._tag).toBe("Analyzing");
			if (result._tag === "Analyzing") {
				expect(result.sessionId).toBe("s1");
			}
		}),
	);

	it.effect("rejects CompleteAnalysis", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				pending(),
				IssueAction.CompleteAnalysis({ proposal: "Fix it" }),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = exit.cause;
				expect(error._tag).toBe("Fail");
			}
		}),
	);

	it.effect("rejects Approve", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				pending(),
				IssueAction.Approve({
					worktreePath: "/wt",
					worktreeBranch: "fix",
					implementationSessionId: "fs",
				}),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects Reject", () =>
		Effect.gen(function* () {
			const exit = yield* transition(pending(), IssueAction.Reject()).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Valid Transitions: Analyzing
// ----------------------------------------------------------------------------

describe("transition from Analyzing", () => {
	it.effect("CompleteAnalysis -> PendingApproval", () =>
		Effect.gen(function* () {
			const result = yield* transition(
				analyzing("session-1"),
				IssueAction.CompleteAnalysis({ proposal: "Add null check" }),
			);

			expect(result._tag).toBe("PendingApproval");
			if (result._tag === "PendingApproval") {
				expect(result.sessionId).toBe("session-1");
				expect(result.proposal).toBe("Add null check");
			}
		}),
	);

	it.effect("Fail -> Error", () =>
		Effect.gen(function* () {
			const result = yield* transition(
				analyzing("session-1"),
				IssueAction.Fail({ error: "Network timeout" }),
			);

			expect(result._tag).toBe("Error");
			if (result._tag === "Error") {
				expect(result.previousState).toBe("analyzing");
				expect(result.sessionId).toBe("session-1");
				expect(result.error).toBe("Network timeout");
			}
		}),
	);

	it.effect("rejects StartAnalysis", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				analyzing(),
				IssueAction.StartAnalysis({ sessionId: "new" }),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects Approve", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				analyzing(),
				IssueAction.Approve({
					worktreePath: "/wt",
					worktreeBranch: "fix",
					implementationSessionId: "fs",
				}),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Valid Transitions: PendingApproval
// ----------------------------------------------------------------------------

describe("transition from PendingApproval", () => {
	it.effect("Approve -> InProgress", () =>
		Effect.gen(function* () {
			const result = yield* transition(
				pendingApproval("session-1", "The fix"),
				IssueAction.Approve({
					worktreePath: "/worktrees/fix-123",
					worktreeBranch: "fix/issue-123",
					implementationSessionId: "fix-session-1",
				}),
			);

			expect(result._tag).toBe("InProgress");
			if (result._tag === "InProgress") {
				expect(result.analysisSessionId).toBe("session-1");
				expect(result.implementationSessionId).toBe("fix-session-1");
				expect(result.worktreePath).toBe("/worktrees/fix-123");
				expect(result.worktreeBranch).toBe("fix/issue-123");
			}
		}),
	);

	it.effect("Reject -> Pending", () =>
		Effect.gen(function* () {
			const result = yield* transition(pendingApproval(), IssueAction.Reject());

			expect(result._tag).toBe("Pending");
		}),
	);

	it.effect("RequestChanges -> Analyzing (same session)", () =>
		Effect.gen(function* () {
			const result = yield* transition(
				pendingApproval("session-1", "Original proposal"),
				IssueAction.RequestChanges({ feedback: "Please also handle edge case" }),
			);

			expect(result._tag).toBe("Analyzing");
			if (result._tag === "Analyzing") {
				// Session ID should be preserved
				expect(result.sessionId).toBe("session-1");
			}
		}),
	);

	it.effect("rejects StartAnalysis", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				pendingApproval(),
				IssueAction.StartAnalysis({ sessionId: "new" }),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects Complete", () =>
		Effect.gen(function* () {
			const exit = yield* transition(pendingApproval(), IssueAction.Complete()).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Valid Transitions: InProgress
// ----------------------------------------------------------------------------

describe("transition from InProgress", () => {
	it.effect("Complete -> PendingReview", () =>
		Effect.gen(function* () {
			const inProgressState = inProgress({
				analysisSessionId: "a-1",
				implementationSessionId: "f-1",
				worktreePath: "/wt/123",
				worktreeBranch: "fix/123",
			});

			const result = yield* transition(inProgressState, IssueAction.Complete());

			expect(result._tag).toBe("PendingReview");
			if (result._tag === "PendingReview") {
				expect(result.analysisSessionId).toBe("a-1");
				expect(result.implementationSessionId).toBe("f-1");
				expect(result.worktreePath).toBe("/wt/123");
				expect(result.worktreeBranch).toBe("fix/123");
			}
		}),
	);

	it.effect("Fail -> Error", () =>
		Effect.gen(function* () {
			const inProgressState = inProgress({ implementationSessionId: "fix-session-1" });
			const result = yield* transition(
				inProgressState,
				IssueAction.Fail({ error: "Build failed" }),
			);

			expect(result._tag).toBe("Error");
			if (result._tag === "Error") {
				expect(result.previousState).toBe("in_progress");
				expect(result.sessionId).toBe("fix-session-1");
				expect(result.error).toBe("Build failed");
			}
		}),
	);

	it.effect("rejects Approve", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				inProgress(),
				IssueAction.Approve({
					worktreePath: "/wt",
					worktreeBranch: "fix",
					implementationSessionId: "fs",
				}),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects Cleanup", () =>
		Effect.gen(function* () {
			const exit = yield* transition(inProgress(), IssueAction.Cleanup()).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Valid Transitions: PendingReview
// ----------------------------------------------------------------------------

describe("transition from PendingReview", () => {
	it.effect("Cleanup -> Pending", () =>
		Effect.gen(function* () {
			const result = yield* transition(pendingReview(), IssueAction.Cleanup());

			expect(result._tag).toBe("Pending");
		}),
	);

	it.effect("rejects StartAnalysis", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				pendingReview(),
				IssueAction.StartAnalysis({ sessionId: "new" }),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects Approve", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				pendingReview(),
				IssueAction.Approve({
					worktreePath: "/wt",
					worktreeBranch: "fix",
					implementationSessionId: "fs",
				}),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Valid Transitions: Error
// ----------------------------------------------------------------------------

describe("transition from Error", () => {
	it.effect("Retry -> Analyzing (new session)", () =>
		Effect.gen(function* () {
			const result = yield* transition(
				error("analyzing", "old-session"),
				IssueAction.Retry({ newSessionId: "new-session" }),
			);

			expect(result._tag).toBe("Analyzing");
			if (result._tag === "Analyzing") {
				expect(result.sessionId).toBe("new-session");
			}
		}),
	);

	it.effect("Reject -> Pending", () =>
		Effect.gen(function* () {
			const result = yield* transition(error("in_progress"), IssueAction.Reject());

			expect(result._tag).toBe("Pending");
		}),
	);

	it.effect("rejects StartAnalysis", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				error("analyzing"),
				IssueAction.StartAnalysis({ sessionId: "new" }),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects Complete", () =>
		Effect.gen(function* () {
			const exit = yield* transition(error("in_progress"), IssueAction.Complete()).pipe(
				Effect.exit,
			);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Error Details
// ----------------------------------------------------------------------------

describe("InvalidTransitionError", () => {
	it.effect("contains descriptive error information", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				pending(),
				IssueAction.Approve({
					worktreePath: "/wt",
					worktreeBranch: "fix",
					implementationSessionId: "fs",
				}),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const cause = exit.cause;
				if (cause._tag === "Fail") {
					const err = cause.error as InvalidTransitionError;
					expect(err._tag).toBe("InvalidTransitionError");
					expect(err.currentState).toBe("Pending");
					expect(err.attemptedAction).toBe("Approve");
					expect(err.message).toContain("Cannot perform");
					expect(err.message).toContain("Approve");
					expect(err.message).toContain("Pending");
				}
			}
		}),
	);
});

// ----------------------------------------------------------------------------
// Type Exhaustiveness (compile-time check)
// ----------------------------------------------------------------------------

describe("IssueState", () => {
	it("has all expected state tags", () => {
		// This test ensures all state variants exist and are accessible
		const states: IssueState[] = [
			IssueState.Pending(),
			IssueState.Analyzing({ sessionId: "s" }),
			IssueState.PendingApproval({ sessionId: "s", proposal: "p" }),
			IssueState.InProgress({
				analysisSessionId: "a",
				implementationSessionId: "f",
				worktreePath: "/p",
				worktreeBranch: "b",
			}),
			IssueState.PendingReview({
				analysisSessionId: "a",
				implementationSessionId: "f",
				worktreePath: "/p",
				worktreeBranch: "b",
			}),
			IssueState.Error({
				previousState: "analyzing",
				sessionId: "s",
				error: "e",
			}),
		];

		const tags = states.map((s) => s._tag);
		expect(tags).toContain("Pending");
		expect(tags).toContain("Analyzing");
		expect(tags).toContain("PendingApproval");
		expect(tags).toContain("InProgress");
		expect(tags).toContain("PendingReview");
		expect(tags).toContain("Error");
	});
});

describe("IssueAction", () => {
	it("has all expected action tags", () => {
		const actions: IssueAction[] = [
			IssueAction.StartAnalysis({ sessionId: "s" }),
			IssueAction.CompleteAnalysis({ proposal: "p" }),
			IssueAction.Approve({
				worktreePath: "/p",
				worktreeBranch: "b",
				implementationSessionId: "f",
			}),
			IssueAction.Reject(),
			IssueAction.RequestChanges({ feedback: "f" }),
			IssueAction.Complete(),
			IssueAction.Fail({ error: "e" }),
			IssueAction.Retry({ newSessionId: "s" }),
			IssueAction.Cleanup(),
		];

		const tags = actions.map((a) => a._tag);
		expect(tags).toContain("StartAnalysis");
		expect(tags).toContain("CompleteAnalysis");
		expect(tags).toContain("Approve");
		expect(tags).toContain("Reject");
		expect(tags).toContain("RequestChanges");
		expect(tags).toContain("Complete");
		expect(tags).toContain("Fail");
		expect(tags).toContain("Retry");
		expect(tags).toContain("Cleanup");
	});
});

// ----------------------------------------------------------------------------
// IssueSource Tests
// ----------------------------------------------------------------------------

describe("IssueSource", () => {
	const now = new Date();

	const sentrySource = IssueSource.Sentry({
		project: "my-project",
		data: {
			sentryId: "12345678",
			title: "TypeError: Cannot read property 'id'",
			shortId: "PROJ-123",
			firstSeen: now,
			lastSeen: now,
			count: 42,
			userCount: 10,
			culprit: "app/utils.ts",
			metadata: { type: "TypeError", value: "Cannot read property 'id'" },
		},
	});

	const githubSource = IssueSource.GitHub({
		data: {
			title: "Bug: Login fails on mobile",
			shortId: "gh#456",
			firstSeen: now,
			lastSeen: now,
			owner: "my-org",
			repo: "my-repo",
			number: 456,
			labels: ["bug", "mobile"],
			assignees: ["alice"],
			body: "Login button does not respond on iOS",
			url: "https://github.com/my-org/my-repo/issues/456",
		},
	});

	const ticketSource = IssueSource.Ticket({
		data: {
			title: "Implement dark mode",
			shortId: "gla-htpw",
			firstSeen: now,
			lastSeen: now,
			ticketId: "gla-htpw",
			description: "Add dark mode support to the UI",
			tags: ["ui", "feature"],
			priority: 2,
		},
	});

	it("has all expected source tags", () => {
		const sources: IssueSource[] = [sentrySource, githubSource, ticketSource];
		const tags = sources.map((s) => s._tag);

		expect(tags).toContain("Sentry");
		expect(tags).toContain("GitHub");
		expect(tags).toContain("Ticket");
	});

	describe("getSourceCommon", () => {
		it("extracts common fields from Sentry source", () => {
			const common = getSourceCommon(sentrySource);

			expect(common.title).toBe("TypeError: Cannot read property 'id'");
			expect(common.shortId).toBe("PROJ-123");
			expect(common.count).toBe(42);
			expect(common.userCount).toBe(10);
		});

		it("extracts common fields from GitHub source", () => {
			const common = getSourceCommon(githubSource);

			expect(common.title).toBe("Bug: Login fails on mobile");
			expect(common.shortId).toBe("gh#456");
		});

		it("extracts common fields from Ticket source", () => {
			const common = getSourceCommon(ticketSource);

			expect(common.title).toBe("Implement dark mode");
			expect(common.shortId).toBe("gla-htpw");
		});
	});

	describe("getSourceType", () => {
		it("returns 'sentry' for Sentry source", () => {
			expect(getSourceType(sentrySource)).toBe("sentry");
		});

		it("returns 'github' for GitHub source", () => {
			expect(getSourceType(githubSource)).toBe("github");
		});

		it("returns 'ticket' for Ticket source", () => {
			expect(getSourceType(ticketSource)).toBe("ticket");
		});
	});
});
