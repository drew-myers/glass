/**
 * Tests for SentryError types and helpers.
 */

import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import {
	SentryError,
	getSentryErrorMessage,
	isSentryError,
} from "../../../src/services/sentry/index.js";

describe("SentryError", () => {
	describe("error construction", () => {
		it("creates AuthError", () => {
			const error = SentryError.AuthError({ status: 401, message: "Invalid token" });
			expect(error._tag).toBe("AuthError");
			expect(error.status).toBe(401);
			expect(error.message).toBe("Invalid token");
		});

		it("creates NotFoundError", () => {
			const error = SentryError.NotFoundError({ resource: "issue", id: "12345" });
			expect(error._tag).toBe("NotFoundError");
			expect(error.resource).toBe("issue");
			expect(error.id).toBe("12345");
		});

		it("creates RateLimitError", () => {
			const resetAt = new Date("2024-01-15T12:00:00Z");
			const error = SentryError.RateLimitError({ resetAt, limit: 100, remaining: 0 });
			expect(error._tag).toBe("RateLimitError");
			expect(error.resetAt).toEqual(resetAt);
			expect(error.limit).toBe(100);
			expect(error.remaining).toBe(0);
		});

		it("creates NetworkError", () => {
			const error = SentryError.NetworkError({ message: "Connection failed" });
			expect(error._tag).toBe("NetworkError");
			expect(error.message).toBe("Connection failed");
		});

		it("creates ApiError", () => {
			const error = SentryError.ApiError({ status: 500, message: "Server error" });
			expect(error._tag).toBe("ApiError");
			expect(error.status).toBe(500);
			expect(error.message).toBe("Server error");
		});
	});

	describe("isSentryError", () => {
		it("returns true for SentryError instances", () => {
			expect(isSentryError(SentryError.AuthError({ status: 401, message: "test" }))).toBe(true);
			expect(isSentryError(SentryError.NotFoundError({ resource: "issue", id: "1" }))).toBe(true);
			expect(
				isSentryError(
					SentryError.RateLimitError({ resetAt: new Date(), limit: 100, remaining: 0 }),
				),
			).toBe(true);
			expect(isSentryError(SentryError.NetworkError({ message: "test" }))).toBe(true);
			expect(isSentryError(SentryError.ApiError({ status: 500, message: "test" }))).toBe(true);
		});

		it("returns false for non-SentryError values", () => {
			expect(isSentryError(null)).toBe(false);
			expect(isSentryError(undefined)).toBe(false);
			expect(isSentryError("error")).toBe(false);
			expect(isSentryError({ _tag: "SomeOtherError" })).toBe(false);
			expect(isSentryError(new Error("test"))).toBe(false);
		});
	});

	describe("getSentryErrorMessage", () => {
		it("formats AuthError message", () => {
			const error = SentryError.AuthError({ status: 401, message: "Invalid token" });
			expect(getSentryErrorMessage(error)).toBe(
				"Sentry authentication failed (401): Invalid token",
			);
		});

		it("formats NotFoundError message", () => {
			const error = SentryError.NotFoundError({ resource: "issue", id: "12345" });
			expect(getSentryErrorMessage(error)).toBe("Sentry issue not found: 12345");
		});

		it("formats RateLimitError message", () => {
			const resetAt = new Date("2024-01-15T12:00:00Z");
			const error = SentryError.RateLimitError({ resetAt, limit: 100, remaining: 0 });
			expect(getSentryErrorMessage(error)).toContain("Sentry rate limit exceeded");
			expect(getSentryErrorMessage(error)).toContain("2024-01-15");
		});

		it("formats NetworkError message", () => {
			const error = SentryError.NetworkError({ message: "Connection refused" });
			expect(getSentryErrorMessage(error)).toBe("Failed to connect to Sentry: Connection refused");
		});

		it("formats ApiError message", () => {
			const error = SentryError.ApiError({ status: 500, message: "Internal error" });
			expect(getSentryErrorMessage(error)).toBe("Sentry API error (500): Internal error");
		});
	});
});
