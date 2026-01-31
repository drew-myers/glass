/**
 * @fileoverview Tests for GlassSection component helpers.
 *
 * Tests the helper functions used by the GlassSection component.
 * Component rendering tests would require Solid.js test setup.
 */

import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import { IssueState } from "../../../src/domain/issue.js";

// =============================================================================
// Helper Function Tests
// =============================================================================

import type { IssueState as IssueStateType } from "../../../src/domain/issue.js";

/**
 * Get human-readable status label from state tag.
 * Copied from component for testing.
 */
const getStatusLabel = (state: IssueStateType): string => {
	switch (state._tag) {
		case "Pending":
			return "Pending";
		case "Analyzing":
			return "Analyzing";
		case "PendingApproval":
			return "Pending Approval";
		case "InProgress":
			return "In Progress";
		case "PendingReview":
			return "Pending Review";
		case "Error":
			return "Error";
		default:
			return "Unknown";
	}
};

describe("getStatusLabel", () => {
	it("returns 'Pending' for Pending state", () => {
		const state = IssueState.Pending();
		expect(getStatusLabel(state)).toBe("Pending");
	});

	it("returns 'Analyzing' for Analyzing state", () => {
		const state = IssueState.Analyzing({ sessionId: "test-session" });
		expect(getStatusLabel(state)).toBe("Analyzing");
	});

	it("returns 'Pending Approval' for PendingApproval state", () => {
		const state = IssueState.PendingApproval({
			sessionId: "test-session",
			proposal: "Fix the bug",
		});
		expect(getStatusLabel(state)).toBe("Pending Approval");
	});

	it("returns 'In Progress' for InProgress state", () => {
		const state = IssueState.InProgress({
			analysisSessionId: "analysis-session",
			implementationSessionId: "impl-session",
			worktreePath: "/path/to/worktree",
			worktreeBranch: "fix-bug",
		});
		expect(getStatusLabel(state)).toBe("In Progress");
	});

	it("returns 'Pending Review' for PendingReview state", () => {
		const state = IssueState.PendingReview({
			analysisSessionId: "analysis-session",
			implementationSessionId: "impl-session",
			worktreePath: "/path/to/worktree",
			worktreeBranch: "fix-bug",
		});
		expect(getStatusLabel(state)).toBe("Pending Review");
	});

	it("returns 'Error' for Error state", () => {
		const state = IssueState.Error({
			previousState: "analyzing",
			sessionId: "test-session",
			error: "Something went wrong",
		});
		expect(getStatusLabel(state)).toBe("Error");
	});
});
