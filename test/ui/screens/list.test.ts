/**
 * @fileoverview Tests for the IssueList component.
 */

import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import type { Issue } from "../../../src/domain/issue.js";
import { IssueSource, IssueState, type SentrySourceData } from "../../../src/domain/issue.js";
import { IssueList, SPINNER_FRAMES, calculateWindowStart } from "../../../src/ui/screens/list.js";
import { colors, statusIcons } from "../../../src/ui/theme.js";
import { findAll, findAllText, getTextContent, getVNodeView } from "../test-utils.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a mock Sentry issue for testing.
 */
const makeIssue = (
	id: string,
	overrides?: Partial<{ state: IssueState; title: string; count: number; lastSeen: Date }>,
): Issue => {
	const data: SentrySourceData = {
		title: overrides?.title ?? `Test Issue ${id}`,
		shortId: `PROJ-${id}`,
		culprit: "src/app.ts",
		firstSeen: new Date("2024-01-01T00:00:00Z"),
		lastSeen: overrides?.lastSeen ?? new Date("2024-01-02T12:00:00Z"),
		count: overrides?.count ?? 100,
		userCount: 10,
		metadata: {
			type: "TypeError",
			value: "Test error",
		},
	};

	return {
		id: `sentry:${id}`,
		source: IssueSource.Sentry({ project: "test-project", data }),
		state: overrides?.state ?? IssueState.Pending(),
		createdAt: new Date("2024-01-01T00:00:00Z"),
		updatedAt: new Date("2024-01-02T00:00:00Z"),
	};
};

/**
 * Creates an array of mock issues.
 */
const makeIssues = (count: number): Issue[] => {
	return Array.from({ length: count }, (_, i) => makeIssue(String(i + 1)));
};

/**
 * Default props for IssueList.
 */
const defaultProps = {
	issues: [],
	selectedIndex: 0,
	windowStart: 0,
	visibleCount: 10,
	isLoading: false,
	spinnerFrame: 0,
	error: null,
};

// =============================================================================
// Tests
// =============================================================================

describe("IssueList", () => {
	describe("empty state", () => {
		it("renders empty state message when no issues", () => {
			const vnode = IssueList({ ...defaultProps, issues: [] });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			expect(textContents).toContain("No issues loaded");
			expect(textContents).toContain("Press 'r' to refresh");
		});
	});

	describe("loading state", () => {
		it("shows loading spinner when loading with no issues", () => {
			const vnode = IssueList({ ...defaultProps, issues: [], isLoading: true });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			// Should contain spinner character and loading text
			const loadingText = textContents.find((t) => t.includes("Loading issues"));
			expect(loadingText).toBeDefined();
		});

		it("shows refreshing indicator when loading with existing issues", () => {
			const issues = makeIssues(3);
			const vnode = IssueList({ ...defaultProps, issues, isLoading: true });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			// Should still show issues plus a refreshing indicator
			const refreshingText = textContents.find((t) => t.includes("Refreshing"));
			expect(refreshingText).toBeDefined();
		});

		it("cycles through spinner frames", () => {
			const spinnerChars = SPINNER_FRAMES;

			for (let frame = 0; frame < spinnerChars.length; frame++) {
				const vnode = IssueList({
					...defaultProps,
					issues: [],
					isLoading: true,
					spinnerFrame: frame,
				});
				const view = getVNodeView(vnode);
				const textNodes = findAllText(view);
				const textContents = textNodes.map((n) => getTextContent(n.props.content));

				const loadingText = textContents.find((t) => t.includes("Loading"));
				expect(loadingText).toContain(spinnerChars[frame]);
			}
		});
	});

	describe("error state", () => {
		it("shows error banner when error is set", () => {
			const vnode = IssueList({ ...defaultProps, error: "Failed to fetch issues" });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			const errorText = textContents.find((t) => t.includes("Error:"));
			expect(errorText).toBeDefined();
			expect(errorText).toContain("Failed to fetch issues");
		});

		it("shows error banner alongside stale data", () => {
			const issues = makeIssues(3);
			const vnode = IssueList({ ...defaultProps, issues, error: "Network error" });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			// Should have both error and issue data
			const errorText = textContents.find((t) => t.includes("Error:"));
			expect(errorText).toBeDefined();

			// Should still show issue titles
			const issueText = textContents.find((t) => t.includes("Test Issue"));
			expect(issueText).toBeDefined();
		});
	});

	describe("issue list rendering", () => {
		it("renders column headers", () => {
			const issues = makeIssues(3);
			const vnode = IssueList({ ...defaultProps, issues });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			expect(textContents).toContain("STS");
			expect(textContents).toContain("ISSUE");
			expect(textContents).toContain("EVENTS");
			expect(textContents).toContain("LAST SEEN");
		});

		it("renders issue titles", () => {
			const issues = [
				makeIssue("1", { title: "TypeError in auth module" }),
				makeIssue("2", { title: "ReferenceError in api handler" }),
			];
			const vnode = IssueList({ ...defaultProps, issues, visibleCount: 10 });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			expect(textContents).toContain("TypeError in auth module");
			expect(textContents).toContain("ReferenceError in api handler");
		});

		it("renders status icons based on issue state", () => {
			const issues = [
				makeIssue("1", { state: IssueState.Pending() }),
				makeIssue("2", { state: IssueState.Analyzing({ sessionId: "s1" }) }),
				makeIssue("3", { state: IssueState.PendingApproval({ sessionId: "s2", proposal: "fix" }) }),
			];
			const vnode = IssueList({ ...defaultProps, issues, visibleCount: 10 });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			expect(textContents).toContain(statusIcons.pending);
			expect(textContents).toContain(statusIcons.analyzing);
			expect(textContents).toContain(statusIcons.pendingApproval);
		});

		it("renders event counts", () => {
			const issues = [makeIssue("1", { count: 42 }), makeIssue("2", { count: 1500 })];
			const vnode = IssueList({ ...defaultProps, issues, visibleCount: 10 });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			// 42 should be displayed as is
			expect(textContents.some((t) => t.includes("42"))).toBe(true);
			// 1500 should be displayed as 1.5K
			expect(textContents.some((t) => t.includes("1.5K"))).toBe(true);
		});
	});

	describe("selection highlighting", () => {
		it("highlights selected row with different background", () => {
			const issues = makeIssues(3);
			const vnode = IssueList({ ...defaultProps, issues, selectedIndex: 1, visibleCount: 10 });
			const view = getVNodeView(vnode);

			// Find all boxes that could be rows (direct children of the list container)
			const boxes = findAll(view, (v) => v.typeName === "BoxRenderable");

			// Look for a box with the highlight background color
			const highlightedBoxes = boxes.filter((b) => b.props.backgroundColor === colors.bgHighlight);

			expect(highlightedBoxes.length).toBeGreaterThan(0);
		});
	});

	describe("windowing", () => {
		it("only renders visibleCount issues", () => {
			const issues = makeIssues(20);
			const vnode = IssueList({ ...defaultProps, issues, visibleCount: 5, windowStart: 0 });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			// Should only see first 5 issue titles
			expect(textContents).toContain("Test Issue 1");
			expect(textContents).toContain("Test Issue 5");
			expect(textContents).not.toContain("Test Issue 6");
		});

		it("renders from windowStart offset", () => {
			const issues = makeIssues(20);
			const vnode = IssueList({ ...defaultProps, issues, visibleCount: 5, windowStart: 10 });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);
			const textContents = textNodes.map((n) => getTextContent(n.props.content));

			// Should see issues 11-15
			expect(textContents).not.toContain("Test Issue 10");
			expect(textContents).toContain("Test Issue 11");
			expect(textContents).toContain("Test Issue 15");
			expect(textContents).not.toContain("Test Issue 16");
		});
	});
});

describe("calculateWindowStart", () => {
	describe("empty list", () => {
		it("returns 0 for empty list", () => {
			expect(calculateWindowStart(0, 0, 10, 0)).toBe(0);
		});
	});

	describe("selection within window", () => {
		it("keeps current window when selection is visible", () => {
			// 20 items, viewing 0-9, selected 5
			expect(calculateWindowStart(5, 0, 10, 20)).toBe(0);
		});

		it("keeps current window at non-zero start", () => {
			// 20 items, viewing 5-14, selected 10
			expect(calculateWindowStart(10, 5, 10, 20)).toBe(5);
		});
	});

	describe("selection above window", () => {
		it("scrolls up when selection moves above window", () => {
			// 20 items, viewing 5-14, selected 3
			expect(calculateWindowStart(3, 5, 10, 20)).toBe(3);
		});

		it("scrolls to top when selection is 0", () => {
			// 20 items, viewing 5-14, selected 0
			expect(calculateWindowStart(0, 5, 10, 20)).toBe(0);
		});
	});

	describe("selection below window", () => {
		it("scrolls down when selection moves below window", () => {
			// 20 items, viewing 0-9, selected 12
			expect(calculateWindowStart(12, 0, 10, 20)).toBe(3);
		});

		it("scrolls to show last item at bottom", () => {
			// 20 items, viewing 0-9, selected 19
			expect(calculateWindowStart(19, 0, 10, 20)).toBe(10);
		});
	});

	describe("edge cases", () => {
		it("clamps window to not extend past end", () => {
			// 15 items, viewing 10-19 (but only 15 items), should clamp to 5
			expect(calculateWindowStart(12, 10, 10, 15)).toBe(5);
		});

		it("handles list smaller than visible count", () => {
			// 5 items, 10 visible slots, selected 3
			expect(calculateWindowStart(3, 0, 10, 5)).toBe(0);
		});

		it("clamps selected index to valid range", () => {
			// 10 items, selected -1 (invalid)
			expect(calculateWindowStart(-1, 0, 5, 10)).toBe(0);
		});

		it("clamps selected index when above total", () => {
			// 10 items, selected 15 (invalid)
			expect(calculateWindowStart(15, 0, 5, 10)).toBe(5);
		});
	});
});
