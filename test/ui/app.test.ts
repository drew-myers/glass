import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import type { Issue } from "../../src/domain/issue.js";
import { IssueSource, IssueState, type SentrySourceData } from "../../src/domain/issue.js";
import {
	AppAction,
	type AppState,
	ScreenState,
	initialAppState,
	reduceAppState,
} from "../../src/ui/app.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a mock Sentry issue for testing.
 */
const makeIssue = (id: string): Issue => {
	const data: SentrySourceData = {
		title: `Test Issue ${id}`,
		shortId: `PROJ-${id}`,
		culprit: "src/app.ts",
		firstSeen: new Date("2024-01-01T00:00:00Z"),
		lastSeen: new Date("2024-01-02T12:00:00Z"),
		count: 100,
		userCount: 10,
		metadata: {
			type: "TypeError",
			value: "Test error",
		},
	};

	return {
		id: `sentry:${id}`,
		source: IssueSource.Sentry({ project: "test-project", data }),
		state: IssueState.Pending(),
		createdAt: new Date("2024-01-01T00:00:00Z"),
		updatedAt: new Date("2024-01-02T00:00:00Z"),
	};
};

/**
 * Creates a full AppState with defaults.
 */
const makeState = (overrides: Partial<AppState> = {}): AppState => ({
	screen: ScreenState.List(),
	shouldQuit: false,
	issues: [],
	selectedIndex: 0,
	windowStart: 0,
	isLoading: false,
	spinnerFrame: 0,
	error: null,
	...overrides,
});

// ----------------------------------------------------------------------------
// Initial State Tests
// ----------------------------------------------------------------------------

describe("initialAppState", () => {
	it("starts on List screen", () => {
		expect(initialAppState.screen._tag).toBe("List");
	});

	it("starts with shouldQuit false", () => {
		expect(initialAppState.shouldQuit).toBe(false);
	});

	it("starts with empty issues array", () => {
		expect(initialAppState.issues).toEqual([]);
	});

	it("starts with selectedIndex 0", () => {
		expect(initialAppState.selectedIndex).toBe(0);
	});

	it("starts with isLoading false", () => {
		expect(initialAppState.isLoading).toBe(false);
	});

	it("starts with no error", () => {
		expect(initialAppState.error).toBeNull();
	});
});

// ----------------------------------------------------------------------------
// Screen State Tests
// ----------------------------------------------------------------------------

describe("ScreenState", () => {
	it("creates List screen state", () => {
		const state = ScreenState.List();
		expect(state._tag).toBe("List");
	});

	it("creates Detail screen state with issueId", () => {
		const state = ScreenState.Detail({ issueId: "sentry:12345" });
		expect(state._tag).toBe("Detail");
		expect(state.issueId).toBe("sentry:12345");
	});
});

// ----------------------------------------------------------------------------
// App Action Tests
// ----------------------------------------------------------------------------

describe("AppAction", () => {
	it("creates Navigate action", () => {
		const action = AppAction.Navigate({ screen: ScreenState.List() });
		expect(action._tag).toBe("Navigate");
	});

	it("creates Quit action", () => {
		const action = AppAction.Quit();
		expect(action._tag).toBe("Quit");
	});

	it("creates SetIssues action", () => {
		const issues = [makeIssue("1"), makeIssue("2")];
		const action = AppAction.SetIssues({ issues });
		expect(action._tag).toBe("SetIssues");
	});

	it("creates MoveSelection action", () => {
		const action = AppAction.MoveSelection({ direction: "down" });
		expect(action._tag).toBe("MoveSelection");
	});
});

// ----------------------------------------------------------------------------
// Reducer Tests
// ----------------------------------------------------------------------------

describe("reduceAppState", () => {
	describe("Navigate action", () => {
		it("navigates from List to Detail", () => {
			const state = makeState({ screen: ScreenState.List() });

			const action = AppAction.Navigate({
				screen: ScreenState.Detail({ issueId: "sentry:123" }),
			});

			const newState = reduceAppState(state, action);

			expect(newState.screen._tag).toBe("Detail");
			if (newState.screen._tag === "Detail") {
				expect(newState.screen.issueId).toBe("sentry:123");
			}
			expect(newState.shouldQuit).toBe(false);
		});

		it("navigates from Detail to List", () => {
			const state = makeState({
				screen: ScreenState.Detail({ issueId: "sentry:123" }),
			});

			const action = AppAction.Navigate({ screen: ScreenState.List() });

			const newState = reduceAppState(state, action);

			expect(newState.screen._tag).toBe("List");
			expect(newState.shouldQuit).toBe(false);
		});

		it("preserves other state when navigating", () => {
			const issues = [makeIssue("1"), makeIssue("2")];
			const state = makeState({
				screen: ScreenState.List(),
				issues,
				selectedIndex: 1,
			});

			const action = AppAction.Navigate({
				screen: ScreenState.Detail({ issueId: "sentry:1" }),
			});

			const newState = reduceAppState(state, action);

			expect(newState.issues).toBe(issues);
			expect(newState.selectedIndex).toBe(1);
		});
	});

	describe("Quit action", () => {
		it("sets shouldQuit to true", () => {
			const state = makeState({ shouldQuit: false });

			const action = AppAction.Quit();

			const newState = reduceAppState(state, action);

			expect(newState.shouldQuit).toBe(true);
		});

		it("preserves screen when quitting", () => {
			const state = makeState({
				screen: ScreenState.Detail({ issueId: "test" }),
			});

			const action = AppAction.Quit();

			const newState = reduceAppState(state, action);

			expect(newState.screen._tag).toBe("Detail");
			if (newState.screen._tag === "Detail") {
				expect(newState.screen.issueId).toBe("test");
			}
		});
	});

	describe("SetIssues action", () => {
		it("sets the issues array", () => {
			const state = makeState({ issues: [] });
			const issues = [makeIssue("1"), makeIssue("2"), makeIssue("3")];

			const action = AppAction.SetIssues({ issues });
			const newState = reduceAppState(state, action);

			expect(newState.issues).toEqual(issues);
		});

		it("clamps selectedIndex when issues shrink", () => {
			const state = makeState({
				issues: [makeIssue("1"), makeIssue("2"), makeIssue("3")],
				selectedIndex: 2,
			});
			const newIssues = [makeIssue("1")];

			const action = AppAction.SetIssues({ issues: newIssues });
			const newState = reduceAppState(state, action);

			expect(newState.selectedIndex).toBe(0);
		});

		it("keeps selectedIndex when issues grow", () => {
			const state = makeState({
				issues: [makeIssue("1")],
				selectedIndex: 0,
			});
			const newIssues = [makeIssue("1"), makeIssue("2"), makeIssue("3")];

			const action = AppAction.SetIssues({ issues: newIssues });
			const newState = reduceAppState(state, action);

			expect(newState.selectedIndex).toBe(0);
		});
	});

	describe("SetLoading action", () => {
		it("sets isLoading to true", () => {
			const state = makeState({ isLoading: false });

			const action = AppAction.SetLoading({ isLoading: true });
			const newState = reduceAppState(state, action);

			expect(newState.isLoading).toBe(true);
		});

		it("sets isLoading to false", () => {
			const state = makeState({ isLoading: true });

			const action = AppAction.SetLoading({ isLoading: false });
			const newState = reduceAppState(state, action);

			expect(newState.isLoading).toBe(false);
		});
	});

	describe("SetError action", () => {
		it("sets error message", () => {
			const state = makeState({ error: null });

			const action = AppAction.SetError({ error: "Network failed" });
			const newState = reduceAppState(state, action);

			expect(newState.error).toBe("Network failed");
		});

		it("clears error message", () => {
			const state = makeState({ error: "Old error" });

			const action = AppAction.SetError({ error: null });
			const newState = reduceAppState(state, action);

			expect(newState.error).toBeNull();
		});
	});

	describe("MoveSelection action", () => {
		it("moves selection down", () => {
			const state = makeState({
				issues: [makeIssue("1"), makeIssue("2"), makeIssue("3")],
				selectedIndex: 0,
			});

			const action = AppAction.MoveSelection({ direction: "down" });
			const newState = reduceAppState(state, action);

			expect(newState.selectedIndex).toBe(1);
		});

		it("moves selection up", () => {
			const state = makeState({
				issues: [makeIssue("1"), makeIssue("2"), makeIssue("3")],
				selectedIndex: 2,
			});

			const action = AppAction.MoveSelection({ direction: "up" });
			const newState = reduceAppState(state, action);

			expect(newState.selectedIndex).toBe(1);
		});

		it("clamps at bottom", () => {
			const state = makeState({
				issues: [makeIssue("1"), makeIssue("2"), makeIssue("3")],
				selectedIndex: 2,
			});

			const action = AppAction.MoveSelection({ direction: "down" });
			const newState = reduceAppState(state, action);

			expect(newState.selectedIndex).toBe(2);
		});

		it("clamps at top", () => {
			const state = makeState({
				issues: [makeIssue("1"), makeIssue("2"), makeIssue("3")],
				selectedIndex: 0,
			});

			const action = AppAction.MoveSelection({ direction: "up" });
			const newState = reduceAppState(state, action);

			expect(newState.selectedIndex).toBe(0);
		});
	});

	describe("JumpSelection action", () => {
		it("jumps to top", () => {
			const state = makeState({
				issues: [makeIssue("1"), makeIssue("2"), makeIssue("3")],
				selectedIndex: 2,
			});

			const action = AppAction.JumpSelection({ position: "top" });
			const newState = reduceAppState(state, action);

			expect(newState.selectedIndex).toBe(0);
		});

		it("jumps to bottom", () => {
			const state = makeState({
				issues: [makeIssue("1"), makeIssue("2"), makeIssue("3")],
				selectedIndex: 0,
			});

			const action = AppAction.JumpSelection({ position: "bottom" });
			const newState = reduceAppState(state, action);

			expect(newState.selectedIndex).toBe(2);
		});
	});

	describe("OpenSelected action", () => {
		it("navigates to detail screen for selected issue", () => {
			const issues = [makeIssue("1"), makeIssue("2"), makeIssue("3")];
			const state = makeState({
				issues,
				selectedIndex: 1,
			});

			const action = AppAction.OpenSelected();
			const newState = reduceAppState(state, action);

			expect(newState.screen._tag).toBe("Detail");
			if (newState.screen._tag === "Detail") {
				expect(newState.screen.issueId).toBe("sentry:2");
			}
		});

		it("does nothing when no issues", () => {
			const state = makeState({
				issues: [],
				selectedIndex: 0,
			});

			const action = AppAction.OpenSelected();
			const newState = reduceAppState(state, action);

			expect(newState.screen._tag).toBe("List");
		});
	});

	describe("TickSpinner action", () => {
		it("increments spinner frame", () => {
			const state = makeState({ spinnerFrame: 0 });

			const action = AppAction.TickSpinner();
			const newState = reduceAppState(state, action);

			expect(newState.spinnerFrame).toBe(1);
		});

		it("wraps spinner frame at 10", () => {
			const state = makeState({ spinnerFrame: 9 });

			const action = AppAction.TickSpinner();
			const newState = reduceAppState(state, action);

			expect(newState.spinnerFrame).toBe(0);
		});
	});
});
