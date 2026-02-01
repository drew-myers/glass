/**
 * @fileoverview Tests for AgentService error types.
 */

import { describe, expect, it } from "@effect/vitest";
import {
	AgentError,
	InvalidModelError,
	SessionNotFoundError,
} from "../../../src/services/agent/index.js";

describe("AgentError", () => {
	it("creates error with all fields", () => {
		const error = new AgentError({
			operation: "createSession",
			message: "Failed to create session",
			cause: new Error("underlying error"),
		});

		expect(error._tag).toBe("AgentError");
		expect(error.operation).toBe("createSession");
		expect(error.message).toBe("Failed to create session");
		expect(error.cause).toBeInstanceOf(Error);
	});

	it("creates error without cause", () => {
		const error = new AgentError({
			operation: "prompt",
			message: "Prompt failed",
		});

		expect(error._tag).toBe("AgentError");
		expect(error.operation).toBe("prompt");
		expect(error.message).toBe("Prompt failed");
		expect(error.cause).toBeUndefined();
	});
});

describe("SessionNotFoundError", () => {
	it("creates error with session ID", () => {
		const error = new SessionNotFoundError({
			sessionId: "analysis-123-1",
		});

		expect(error._tag).toBe("SessionNotFoundError");
		expect(error.sessionId).toBe("analysis-123-1");
	});
});

describe("InvalidModelError", () => {
	it("creates error with model string and message", () => {
		const error = new InvalidModelError({
			modelString: "invalid-format",
			message: "Model string must be in format 'provider/model'",
		});

		expect(error._tag).toBe("InvalidModelError");
		expect(error.modelString).toBe("invalid-format");
		expect(error.message).toBe("Model string must be in format 'provider/model'");
	});
});
