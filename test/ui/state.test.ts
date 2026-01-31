import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import type { Issue, SentrySourceData } from "../../src/domain/issue.js";
import { IssueSource, IssueState } from "../../src/domain/issue.js";
import { ScreenState, calculateWindowStart, createAppState } from "../../src/ui/state.js";

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

// ----------------------------------------------------------------------------
// ScreenState Tests
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
// calculateWindowStart Tests
// ----------------------------------------------------------------------------

describe("calculateWindowStart", () => {
	it("returns 0 for empty list", () => {
		expect(calculateWindowStart(0, 0, 10, 0)).toBe(0);
	});

	it("keeps current window when selection is visible", () => {
		expect(calculateWindowStart(5, 0, 10, 20)).toBe(0);
	});

	it("scrolls up when selection is above window", () => {
		expect(calculateWindowStart(2, 5, 10, 20)).toBe(2);
	});

	it("scrolls down when selection is below window", () => {
		expect(calculateWindowStart(15, 0, 10, 20)).toBe(6);
	});

	it("clamps window to not extend past end when visible within window", () => {
		// 20 items, window at 15 (showing 15-24 but only 15-19 exist), selected 17
		// maxWindowStart = max(0, 20 - 10) = 10
		// selection 17 is within window 15-24, so window stays but clamps to 10
		expect(calculateWindowStart(17, 15, 10, 20)).toBe(10);
	});
});

// ----------------------------------------------------------------------------
// createAppState Tests
// ----------------------------------------------------------------------------

describe("createAppState", () => {
	describe("initial state", () => {
		it("starts on List screen", () => {
			const state = createAppState();
			expect(state.screen()._tag).toBe("List");
		});

		it("starts with empty issues", () => {
			const state = createAppState();
			expect(state.issues()).toEqual([]);
		});

		it("starts with selectedIndex 0", () => {
			const state = createAppState();
			expect(state.selectedIndex()).toBe(0);
		});

		it("starts with isLoading false", () => {
			const state = createAppState();
			expect(state.isLoading()).toBe(false);
		});

		it("starts with shouldQuit false", () => {
			const state = createAppState();
			expect(state.shouldQuit()).toBe(false);
		});

		it("starts with no error", () => {
			const state = createAppState();
			expect(state.error()).toBeNull();
		});
	});

	describe("navigateTo", () => {
		it("navigates from List to Detail", () => {
			const state = createAppState();
			state.navigateTo(ScreenState.Detail({ issueId: "sentry:123" }));

			expect(state.screen()._tag).toBe("Detail");
			const screen = state.screen();
			if (screen._tag === "Detail") {
				expect(screen.issueId).toBe("sentry:123");
			}
		});

		it("navigates from Detail to List", () => {
			const state = createAppState();
			state.navigateTo(ScreenState.Detail({ issueId: "sentry:123" }));
			state.navigateTo(ScreenState.List());

			expect(state.screen()._tag).toBe("List");
		});
	});

	describe("setIssues", () => {
		it("sets the issues array", () => {
			const state = createAppState();
			const issues = [makeIssue("1"), makeIssue("2"), makeIssue("3")];

			state.setIssues(issues);

			expect(state.issues()).toEqual(issues);
		});

		it("clamps selectedIndex when issues shrink", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);
			state.moveSelection("down", 10);
			state.moveSelection("down", 10);
			expect(state.selectedIndex()).toBe(2);

			state.setIssues([makeIssue("1")]);

			expect(state.selectedIndex()).toBe(0);
		});

		it("keeps selectedIndex when issues grow", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1")]);
			expect(state.selectedIndex()).toBe(0);

			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);

			expect(state.selectedIndex()).toBe(0);
		});
	});

	describe("setIsLoading", () => {
		it("sets isLoading to true", () => {
			const state = createAppState();

			state.setIsLoading(true);

			expect(state.isLoading()).toBe(true);
		});

		it("sets isLoading to false", () => {
			const state = createAppState();
			state.setIsLoading(true);

			state.setIsLoading(false);

			expect(state.isLoading()).toBe(false);
		});
	});

	describe("setError", () => {
		it("sets error message", () => {
			const state = createAppState();

			state.setError("Network failed");

			expect(state.error()).toBe("Network failed");
		});

		it("clears error message", () => {
			const state = createAppState();
			state.setError("Old error");

			state.setError(null);

			expect(state.error()).toBeNull();
		});
	});

	describe("moveSelection", () => {
		it("moves selection down", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);

			state.moveSelection("down", 10);

			expect(state.selectedIndex()).toBe(1);
		});

		it("moves selection up", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);
			state.moveSelection("down", 10);
			state.moveSelection("down", 10);

			state.moveSelection("up", 10);

			expect(state.selectedIndex()).toBe(1);
		});

		it("clamps at bottom", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);
			state.moveSelection("down", 10);
			state.moveSelection("down", 10);

			state.moveSelection("down", 10);

			expect(state.selectedIndex()).toBe(2);
		});

		it("clamps at top", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);

			state.moveSelection("up", 10);

			expect(state.selectedIndex()).toBe(0);
		});
	});

	describe("jumpSelection", () => {
		it("jumps to top", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);
			state.moveSelection("down", 10);
			state.moveSelection("down", 10);

			state.jumpSelection("top", 10);

			expect(state.selectedIndex()).toBe(0);
		});

		it("jumps to bottom", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);

			state.jumpSelection("bottom", 10);

			expect(state.selectedIndex()).toBe(2);
		});
	});

	describe("pageMove", () => {
		it("moves down by half page", () => {
			const state = createAppState();
			const issues = Array.from({ length: 20 }, (_, i) => makeIssue(String(i + 1)));
			state.setIssues(issues);

			state.pageMove("down", 10); // half page = 5

			expect(state.selectedIndex()).toBe(5);
		});

		it("moves up by half page", () => {
			const state = createAppState();
			const issues = Array.from({ length: 20 }, (_, i) => makeIssue(String(i + 1)));
			state.setIssues(issues);
			state.jumpSelection("bottom", 10);

			state.pageMove("up", 10); // half page = 5

			expect(state.selectedIndex()).toBe(14);
		});
	});

	describe("openSelected", () => {
		it("navigates to detail screen for selected issue", () => {
			const state = createAppState();
			state.setIssues([makeIssue("1"), makeIssue("2"), makeIssue("3")]);
			state.moveSelection("down", 10);

			state.openSelected();

			expect(state.screen()._tag).toBe("Detail");
			const screen = state.screen();
			if (screen._tag === "Detail") {
				expect(screen.issueId).toBe("sentry:2");
			}
		});

		it("does nothing when no issues", () => {
			const state = createAppState();

			state.openSelected();

			expect(state.screen()._tag).toBe("List");
		});
	});

	describe("tickSpinner", () => {
		it("increments spinner frame", () => {
			const state = createAppState();

			state.tickSpinner();

			expect(state.spinnerFrame()).toBe(1);
		});

		it("wraps spinner frame at 10", () => {
			const state = createAppState();
			for (let i = 0; i < 9; i++) {
				state.tickSpinner();
			}
			expect(state.spinnerFrame()).toBe(9);

			state.tickSpinner();

			expect(state.spinnerFrame()).toBe(0);
		});
	});

	describe("quit", () => {
		it("sets shouldQuit to true", () => {
			const state = createAppState();

			state.quit();

			expect(state.shouldQuit()).toBe(true);
		});
	});
});
