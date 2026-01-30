import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import {
	colors,
	getStatusColor,
	getStatusIcon,
	heights,
	statusColors,
	statusIcons,
} from "../../src/ui/theme.js";

// ----------------------------------------------------------------------------
// Color Definitions Tests
// ----------------------------------------------------------------------------

describe("colors", () => {
	it("defines all required base colors", () => {
		expect(colors.bg).toBeDefined();
		expect(colors.bgPanel).toBeDefined();
		expect(colors.bgHighlight).toBeDefined();
		expect(colors.fg).toBeDefined();
		expect(colors.fgDim).toBeDefined();
		expect(colors.fgMuted).toBeDefined();
		expect(colors.border).toBeDefined();
		expect(colors.borderFocus).toBeDefined();
		expect(colors.accent).toBeDefined();
	});

	it("uses valid hex color format", () => {
		const hexPattern = /^#[0-9A-Fa-f]{6}$/;
		for (const color of Object.values(colors)) {
			expect(color).toMatch(hexPattern);
		}
	});
});

describe("statusColors", () => {
	it("defines colors for all issue states", () => {
		expect(statusColors.pending).toBeDefined();
		expect(statusColors.analyzing).toBeDefined();
		expect(statusColors.pendingApproval).toBeDefined();
		expect(statusColors.inProgress).toBeDefined();
		expect(statusColors.pendingReview).toBeDefined();
		expect(statusColors.error).toBeDefined();
	});

	it("uses valid hex color format", () => {
		const hexPattern = /^#[0-9A-Fa-f]{6}$/;
		for (const color of Object.values(statusColors)) {
			expect(color).toMatch(hexPattern);
		}
	});
});

// ----------------------------------------------------------------------------
// Status Icons Tests
// ----------------------------------------------------------------------------

describe("statusIcons", () => {
	it("defines icons for all issue states", () => {
		expect(statusIcons.pending).toBeDefined();
		expect(statusIcons.analyzing).toBeDefined();
		expect(statusIcons.pendingApproval).toBeDefined();
		expect(statusIcons.inProgress).toBeDefined();
		expect(statusIcons.pendingReview).toBeDefined();
		expect(statusIcons.error).toBeDefined();
	});

	it("uses single-character unicode icons", () => {
		for (const icon of Object.values(statusIcons)) {
			// Each icon should be a single character
			expect([...icon].length).toBe(1);
		}
	});
});

// ----------------------------------------------------------------------------
// getStatusIcon Tests
// ----------------------------------------------------------------------------

describe("getStatusIcon", () => {
	it("returns correct icon for Pending state", () => {
		expect(getStatusIcon("Pending")).toBe(statusIcons.pending);
	});

	it("returns correct icon for Analyzing state", () => {
		expect(getStatusIcon("Analyzing")).toBe(statusIcons.analyzing);
	});

	it("returns correct icon for PendingApproval state", () => {
		expect(getStatusIcon("PendingApproval")).toBe(statusIcons.pendingApproval);
	});

	it("returns correct icon for InProgress state", () => {
		expect(getStatusIcon("InProgress")).toBe(statusIcons.inProgress);
	});

	it("returns correct icon for PendingReview state", () => {
		expect(getStatusIcon("PendingReview")).toBe(statusIcons.pendingReview);
	});

	it("returns correct icon for Error state", () => {
		expect(getStatusIcon("Error")).toBe(statusIcons.error);
	});

	it("returns pending icon for unknown state", () => {
		expect(getStatusIcon("Unknown")).toBe(statusIcons.pending);
	});
});

// ----------------------------------------------------------------------------
// getStatusColor Tests
// ----------------------------------------------------------------------------

describe("getStatusColor", () => {
	it("returns correct color for Pending state", () => {
		expect(getStatusColor("Pending")).toBe(statusColors.pending);
	});

	it("returns correct color for Analyzing state", () => {
		expect(getStatusColor("Analyzing")).toBe(statusColors.analyzing);
	});

	it("returns correct color for PendingApproval state", () => {
		expect(getStatusColor("PendingApproval")).toBe(statusColors.pendingApproval);
	});

	it("returns correct color for InProgress state", () => {
		expect(getStatusColor("InProgress")).toBe(statusColors.inProgress);
	});

	it("returns correct color for PendingReview state", () => {
		expect(getStatusColor("PendingReview")).toBe(statusColors.pendingReview);
	});

	it("returns correct color for Error state", () => {
		expect(getStatusColor("Error")).toBe(statusColors.error);
	});

	it("returns pending color for unknown state", () => {
		expect(getStatusColor("Unknown")).toBe(statusColors.pending);
	});
});

// ----------------------------------------------------------------------------
// Layout Constants Tests
// ----------------------------------------------------------------------------

describe("heights", () => {
	it("defines status bar height", () => {
		expect(heights.statusBar).toBe(1);
	});

	it("defines action bar height", () => {
		expect(heights.actionBar).toBe(1);
	});
});
