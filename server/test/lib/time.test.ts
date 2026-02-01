/**
 * @fileoverview Tests for time formatting utilities.
 */

import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import { formatRelativeTime, formatRelativeTimeShort } from "../../src/lib/time.js";

describe("formatRelativeTime", () => {
	// Use a fixed reference time for all tests
	const now = new Date("2024-06-15T12:00:00.000Z");

	describe("seconds", () => {
		it("returns 'just now' for less than a minute", () => {
			const date = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
			expect(formatRelativeTime(date, now)).toBe("just now");
		});

		it("returns 'just now' for 0 seconds", () => {
			expect(formatRelativeTime(now, now)).toBe("just now");
		});

		it("returns 'just now' for future dates", () => {
			const date = new Date(now.getTime() + 60 * 1000); // 1 minute in future
			expect(formatRelativeTime(date, now)).toBe("just now");
		});
	});

	describe("minutes", () => {
		it("returns '1m ago' for 1 minute", () => {
			const date = new Date(now.getTime() - 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("1m ago");
		});

		it("returns '30m ago' for 30 minutes", () => {
			const date = new Date(now.getTime() - 30 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("30m ago");
		});

		it("returns '59m ago' for 59 minutes", () => {
			const date = new Date(now.getTime() - 59 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("59m ago");
		});
	});

	describe("hours", () => {
		it("returns '1h ago' for 1 hour", () => {
			const date = new Date(now.getTime() - 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("1h ago");
		});

		it("returns '12h ago' for 12 hours", () => {
			const date = new Date(now.getTime() - 12 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("12h ago");
		});

		it("returns '23h ago' for 23 hours", () => {
			const date = new Date(now.getTime() - 23 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("23h ago");
		});
	});

	describe("days", () => {
		it("returns '1d ago' for 1 day", () => {
			const date = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("1d ago");
		});

		it("returns '3d ago' for 3 days", () => {
			const date = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("3d ago");
		});

		it("returns '6d ago' for 6 days", () => {
			const date = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("6d ago");
		});
	});

	describe("weeks", () => {
		it("returns '1w ago' for 7 days", () => {
			const date = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("1w ago");
		});

		it("returns '2w ago' for 14 days", () => {
			const date = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("2w ago");
		});

		it("returns '4w ago' for 28 days", () => {
			const date = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("4w ago");
		});
	});

	describe("months", () => {
		it("returns '1mo ago' for 30 days", () => {
			const date = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("1mo ago");
		});

		it("returns '6mo ago' for 180 days", () => {
			const date = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("6mo ago");
		});

		it("returns '11mo ago' for 330 days", () => {
			const date = new Date(now.getTime() - 330 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("11mo ago");
		});
	});

	describe("years", () => {
		it("returns '1y ago' for 365 days", () => {
			const date = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("1y ago");
		});

		it("returns '2y ago' for 730 days", () => {
			const date = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("2y ago");
		});

		it("returns '5y ago' for 5 years", () => {
			const date = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
			expect(formatRelativeTime(date, now)).toBe("5y ago");
		});
	});
});

describe("formatRelativeTimeShort", () => {
	const now = new Date("2024-06-15T12:00:00.000Z");

	it("returns 'now' for just now", () => {
		expect(formatRelativeTimeShort(now, now)).toBe("now");
	});

	it("returns '5m' for 5 minutes ago", () => {
		const date = new Date(now.getTime() - 5 * 60 * 1000);
		expect(formatRelativeTimeShort(date, now)).toBe("5m");
	});

	it("returns '2h' for 2 hours ago", () => {
		const date = new Date(now.getTime() - 2 * 60 * 60 * 1000);
		expect(formatRelativeTimeShort(date, now)).toBe("2h");
	});

	it("returns '3d' for 3 days ago", () => {
		const date = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
		expect(formatRelativeTimeShort(date, now)).toBe("3d");
	});

	it("returns '2w' for 2 weeks ago", () => {
		const date = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
		expect(formatRelativeTimeShort(date, now)).toBe("2w");
	});

	it("returns '3mo' for 3 months ago", () => {
		const date = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
		expect(formatRelativeTimeShort(date, now)).toBe("3mo");
	});

	it("returns '1y' for 1 year ago", () => {
		const date = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
		expect(formatRelativeTimeShort(date, now)).toBe("1y");
	});
});
