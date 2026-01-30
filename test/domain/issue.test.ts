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
const proposed = (sessionId = "session-1", proposal = "Fix the bug") =>
	IssueState.Proposed({ sessionId, proposal });
const fixing = (opts?: Partial<Parameters<typeof IssueState.Fixing>[0]>) =>
	IssueState.Fixing({
		analysisSessionId: "session-1",
		fixSessionId: "fix-session-1",
		worktreePath: "/worktrees/issue-123",
		worktreeBranch: "fix/issue-123",
		...opts,
	});
const fixed = (opts?: Partial<Parameters<typeof IssueState.Fixed>[0]>) =>
	IssueState.Fixed({
		analysisSessionId: "session-1",
		fixSessionId: "fix-session-1",
		worktreePath: "/worktrees/issue-123",
		worktreeBranch: "fix/issue-123",
		...opts,
	});
const error = (previousState: "analyzing" | "fixing", sessionId = "session-1") =>
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
					fixSessionId: "fs",
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
	it.effect("CompleteAnalysis -> Proposed", () =>
		Effect.gen(function* () {
			const result = yield* transition(
				analyzing("session-1"),
				IssueAction.CompleteAnalysis({ proposal: "Add null check" }),
			);

			expect(result._tag).toBe("Proposed");
			if (result._tag === "Proposed") {
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
					fixSessionId: "fs",
				}),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Valid Transitions: Proposed
// ----------------------------------------------------------------------------

describe("transition from Proposed", () => {
	it.effect("Approve -> Fixing", () =>
		Effect.gen(function* () {
			const result = yield* transition(
				proposed("session-1", "The fix"),
				IssueAction.Approve({
					worktreePath: "/worktrees/fix-123",
					worktreeBranch: "fix/issue-123",
					fixSessionId: "fix-session-1",
				}),
			);

			expect(result._tag).toBe("Fixing");
			if (result._tag === "Fixing") {
				expect(result.analysisSessionId).toBe("session-1");
				expect(result.fixSessionId).toBe("fix-session-1");
				expect(result.worktreePath).toBe("/worktrees/fix-123");
				expect(result.worktreeBranch).toBe("fix/issue-123");
			}
		}),
	);

	it.effect("Reject -> Pending", () =>
		Effect.gen(function* () {
			const result = yield* transition(proposed(), IssueAction.Reject());

			expect(result._tag).toBe("Pending");
		}),
	);

	it.effect("RequestChanges -> Analyzing (same session)", () =>
		Effect.gen(function* () {
			const result = yield* transition(
				proposed("session-1", "Original proposal"),
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
				proposed(),
				IssueAction.StartAnalysis({ sessionId: "new" }),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects CompleteFix", () =>
		Effect.gen(function* () {
			const exit = yield* transition(proposed(), IssueAction.CompleteFix()).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Valid Transitions: Fixing
// ----------------------------------------------------------------------------

describe("transition from Fixing", () => {
	it.effect("CompleteFix -> Fixed", () =>
		Effect.gen(function* () {
			const fixingState = fixing({
				analysisSessionId: "a-1",
				fixSessionId: "f-1",
				worktreePath: "/wt/123",
				worktreeBranch: "fix/123",
			});

			const result = yield* transition(fixingState, IssueAction.CompleteFix());

			expect(result._tag).toBe("Fixed");
			if (result._tag === "Fixed") {
				expect(result.analysisSessionId).toBe("a-1");
				expect(result.fixSessionId).toBe("f-1");
				expect(result.worktreePath).toBe("/wt/123");
				expect(result.worktreeBranch).toBe("fix/123");
			}
		}),
	);

	it.effect("Fail -> Error", () =>
		Effect.gen(function* () {
			const fixingState = fixing({ fixSessionId: "fix-session-1" });
			const result = yield* transition(fixingState, IssueAction.Fail({ error: "Build failed" }));

			expect(result._tag).toBe("Error");
			if (result._tag === "Error") {
				expect(result.previousState).toBe("fixing");
				expect(result.sessionId).toBe("fix-session-1");
				expect(result.error).toBe("Build failed");
			}
		}),
	);

	it.effect("rejects Approve", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				fixing(),
				IssueAction.Approve({
					worktreePath: "/wt",
					worktreeBranch: "fix",
					fixSessionId: "fs",
				}),
			).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects Cleanup", () =>
		Effect.gen(function* () {
			const exit = yield* transition(fixing(), IssueAction.Cleanup()).pipe(Effect.exit);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);
});

// ----------------------------------------------------------------------------
// Valid Transitions: Fixed
// ----------------------------------------------------------------------------

describe("transition from Fixed", () => {
	it.effect("Cleanup -> Pending", () =>
		Effect.gen(function* () {
			const result = yield* transition(fixed(), IssueAction.Cleanup());

			expect(result._tag).toBe("Pending");
		}),
	);

	it.effect("rejects StartAnalysis", () =>
		Effect.gen(function* () {
			const exit = yield* transition(fixed(), IssueAction.StartAnalysis({ sessionId: "new" })).pipe(
				Effect.exit,
			);

			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("rejects Approve", () =>
		Effect.gen(function* () {
			const exit = yield* transition(
				fixed(),
				IssueAction.Approve({
					worktreePath: "/wt",
					worktreeBranch: "fix",
					fixSessionId: "fs",
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
			const result = yield* transition(error("fixing"), IssueAction.Reject());

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

	it.effect("rejects CompleteFix", () =>
		Effect.gen(function* () {
			const exit = yield* transition(error("fixing"), IssueAction.CompleteFix()).pipe(Effect.exit);

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
					fixSessionId: "fs",
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
			IssueState.Proposed({ sessionId: "s", proposal: "p" }),
			IssueState.Fixing({
				analysisSessionId: "a",
				fixSessionId: "f",
				worktreePath: "/p",
				worktreeBranch: "b",
			}),
			IssueState.Fixed({
				analysisSessionId: "a",
				fixSessionId: "f",
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
		expect(tags).toContain("Proposed");
		expect(tags).toContain("Fixing");
		expect(tags).toContain("Fixed");
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
				fixSessionId: "f",
			}),
			IssueAction.Reject(),
			IssueAction.RequestChanges({ feedback: "f" }),
			IssueAction.CompleteFix(),
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
		expect(tags).toContain("CompleteFix");
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
