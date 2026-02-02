/**
 * @fileoverview Tests for prompt formatters.
 */

import { describe, expect, it } from "@effect/vitest";
import type {
	Breadcrumb,
	ContextInfo,
	ExceptionValue,
	RequestInfo,
	StackFrame,
	UserInfo,
} from "../../../src/domain/issue.js";
import {
	formatBreadcrumb,
	formatBreadcrumbs,
	formatContexts,
	formatException,
	formatExceptions,
	formatRequest,
	formatStackFrame,
	formatTags,
	formatUser,
} from "../../../src/services/prompts/formatters.js";

describe("formatStackFrame", () => {
	it("formats a basic frame with function and location", () => {
		const frame: StackFrame = {
			filename: "src/api.ts",
			absPath: "/project/src/api.ts",
			function: "handleRequest",
			module: null,
			lineNo: 42,
			colNo: 15,
			inApp: true,
		};

		const result = formatStackFrame(frame);

		expect(result).toContain("at handleRequest");
		expect(result).toContain("/project/src/api.ts:42:15");
		expect(result).not.toContain("[library]");
	});

	it("marks library frames", () => {
		const frame: StackFrame = {
			filename: "node_modules/express/lib/router.js",
			absPath: null,
			function: "next",
			module: null,
			lineNo: 100,
			colNo: null,
			inApp: false,
		};

		const result = formatStackFrame(frame);

		expect(result).toContain("[library]");
	});

	it("includes source context when available", () => {
		const frame: StackFrame = {
			filename: "src/api.ts",
			absPath: null,
			function: "handleRequest",
			module: null,
			lineNo: 42,
			colNo: null,
			inApp: true,
			context: [
				[40, "  const data = await fetch(url);"],
				[41, "  if (!data.ok) {"],
				[42, "    throw new ApiError(data.status);"],
				[43, "  }"],
			],
		};

		const result = formatStackFrame(frame);

		expect(result).toContain(">    42 |     throw new ApiError");
		expect(result).toContain("     40 |   const data");
	});

	it("includes local variables when available", () => {
		const frame: StackFrame = {
			filename: "src/api.ts",
			absPath: null,
			function: "process",
			module: null,
			lineNo: 10,
			colNo: null,
			inApp: true,
			vars: {
				userId: "123",
				count: 5,
			},
		};

		const result = formatStackFrame(frame);

		expect(result).toContain("locals:");
		expect(result).toContain("userId = 123");
		expect(result).toContain("count = 5");
	});

	it("handles anonymous functions", () => {
		const frame: StackFrame = {
			filename: "src/api.ts",
			absPath: null,
			function: null,
			module: null,
			lineNo: 10,
			colNo: null,
			inApp: true,
		};

		const result = formatStackFrame(frame);

		expect(result).toContain("<anonymous>");
	});
});

describe("formatException", () => {
	it("formats exception type and value", () => {
		const exception: ExceptionValue = {
			type: "TypeError",
			value: "Cannot read property 'foo' of undefined",
			module: null,
			mechanism: null,
			stacktrace: null,
		};

		const result = formatException(exception);

		expect(result).toContain("TypeError: Cannot read property 'foo' of undefined");
	});

	it("includes module prefix", () => {
		const exception: ExceptionValue = {
			type: "ValidationError",
			value: "Invalid input",
			module: "myapp.validators",
			mechanism: null,
			stacktrace: null,
		};

		const result = formatException(exception);

		expect(result).toContain("myapp.validators.ValidationError");
	});

	it("includes mechanism info", () => {
		const exception: ExceptionValue = {
			type: "Error",
			value: "Something failed",
			module: null,
			mechanism: { type: "generic", handled: false },
			stacktrace: null,
		};

		const result = formatException(exception);

		expect(result).toContain("(generic, unhandled)");
	});

	it("includes stacktrace frames in reverse order", () => {
		const exception: ExceptionValue = {
			type: "Error",
			value: "Test",
			module: null,
			mechanism: null,
			stacktrace: {
				frames: [
					{ filename: "a.ts", absPath: null, function: "first", module: null, lineNo: 1, colNo: null, inApp: true },
					{ filename: "b.ts", absPath: null, function: "second", module: null, lineNo: 2, colNo: null, inApp: true },
					{ filename: "c.ts", absPath: null, function: "third", module: null, lineNo: 3, colNo: null, inApp: true },
				],
				hasSystemFrames: false,
			},
		};

		const result = formatException(exception);
		const lines = result.split("\n");

		// Find the frame lines
		const frameLines = lines.filter((l) => l.includes("at "));

		// Should be reversed: third, second, first (most recent first)
		expect(frameLines[0]).toContain("third");
		expect(frameLines[1]).toContain("second");
		expect(frameLines[2]).toContain("first");
	});
});

describe("formatExceptions", () => {
	it("returns message for empty array", () => {
		const result = formatExceptions([]);
		expect(result).toBe("No exception data available.");
	});

	it("formats multiple exceptions as chain", () => {
		const exceptions: ExceptionValue[] = [
			{ type: "InnerError", value: "Inner", module: null, mechanism: null, stacktrace: null },
			{ type: "OuterError", value: "Outer", module: null, mechanism: null, stacktrace: null },
		];

		const result = formatExceptions(exceptions);

		expect(result).toContain("OuterError: Outer");
		expect(result).toContain("Caused by:");
		expect(result).toContain("InnerError: Inner");
	});
});

describe("formatBreadcrumb", () => {
	it("formats basic breadcrumb", () => {
		const crumb: Breadcrumb = {
			type: "default",
			category: "console",
			level: "info",
			message: "User logged in",
			timestamp: "2024-01-15T14:32:01.123Z",
		};

		const result = formatBreadcrumb(crumb);

		expect(result).toContain("[14:32:01]");
		expect(result).toContain("console");
		expect(result).toContain("User logged in");
	});

	it("shows level if not info", () => {
		const crumb: Breadcrumb = {
			type: "default",
			category: "auth",
			level: "warning",
			message: "Session expiring",
			timestamp: "2024-01-15T14:32:01.123Z",
		};

		const result = formatBreadcrumb(crumb);

		expect(result).toContain("(warning)");
	});

	it("enriches HTTP breadcrumbs with data", () => {
		const crumb: Breadcrumb = {
			type: "http",
			category: "http",
			level: "info",
			message: null,
			timestamp: "2024-01-15T14:32:01.123Z",
			data: {
				method: "POST",
				url: "/api/users",
				status_code: 201,
			},
		};

		const result = formatBreadcrumb(crumb);

		expect(result).toContain("POST /api/users -> 201");
	});
});

describe("formatBreadcrumbs", () => {
	it("returns message for empty array", () => {
		const result = formatBreadcrumbs([]);
		expect(result).toBe("No breadcrumbs available.");
	});

	it("limits output to most recent", () => {
		const crumbs: Breadcrumb[] = Array.from({ length: 50 }, (_, i) => ({
			type: "default",
			category: "test",
			level: "info",
			message: `Message ${i}`,
			timestamp: `2024-01-15T14:${String(i).padStart(2, "0")}:00.000Z`,
		}));

		const result = formatBreadcrumbs(crumbs, { limit: 10 });

		expect(result).toContain("40 earlier breadcrumbs omitted");
		expect(result).toContain("Message 40");
		expect(result).toContain("Message 49");
		expect(result).not.toContain("Message 39");
	});
});

describe("formatRequest", () => {
	it("formats method and URL", () => {
		const request: RequestInfo = {
			method: "POST",
			url: "https://api.example.com/users",
		};

		const result = formatRequest(request);

		expect(result).toContain("POST https://api.example.com/users");
	});

	it("includes query parameters", () => {
		const request: RequestInfo = {
			method: "GET",
			url: "/search",
			query: [
				["q", "test"],
				["page", "1"],
			],
		};

		const result = formatRequest(request);

		expect(result).toContain("Query Parameters:");
		expect(result).toContain("q: test");
		expect(result).toContain("page: 1");
	});

	it("redacts sensitive headers", () => {
		const request: RequestInfo = {
			method: "GET",
			url: "/api",
			headers: [
				["Content-Type", "application/json"],
				["Authorization", "Bearer secret-token"],
				["Cookie", "session=abc123"],
			],
		};

		const result = formatRequest(request);

		expect(result).toContain("Content-Type: application/json");
		expect(result).toContain("Authorization: [redacted]");
		expect(result).toContain("Cookie: [redacted]");
		expect(result).not.toContain("secret-token");
		expect(result).not.toContain("abc123");
	});

	it("truncates long body", () => {
		const request: RequestInfo = {
			method: "POST",
			url: "/api",
			data: "x".repeat(1000),
		};

		const result = formatRequest(request);

		expect(result).toContain("Body:");
		expect(result).toContain("[truncated]");
		expect(result.length).toBeLessThan(1000);
	});
});

describe("formatUser", () => {
	it("formats user info", () => {
		const user: UserInfo = {
			id: "user-123",
			email: "test@example.com",
			username: "testuser",
			ipAddress: "192.168.1.1",
			geo: {
				city: "New York",
				region: "NY",
				countryCode: "US",
			},
		};

		const result = formatUser(user);

		expect(result).toContain("ID: user-123");
		expect(result).toContain("Email: test@example.com");
		expect(result).toContain("Username: testuser");
		expect(result).toContain("IP: 192.168.1.1");
		expect(result).toContain("Location: New York, NY, US");
	});

	it("returns message for empty user", () => {
		const user: UserInfo = {};
		const result = formatUser(user);
		expect(result).toBe("No user information available.");
	});
});

describe("formatContexts", () => {
	it("formats browser, OS, and runtime", () => {
		const contexts: ContextInfo = {
			browser: { name: "Chrome", version: "120.0" },
			os: { name: "macOS", version: "14.0" },
			runtime: { name: "Node.js", version: "20.10.0" },
		};

		const result = formatContexts(contexts);

		expect(result).toContain("Browser: Chrome 120.0");
		expect(result).toContain("OS: macOS 14.0");
		expect(result).toContain("Runtime: Node.js 20.10.0");
	});

	it("returns empty string for empty contexts", () => {
		const result = formatContexts({});
		expect(result).toBe("");
	});
});

describe("formatTags", () => {
	it("formats tags as key-value pairs", () => {
		const tags = {
			environment: "production",
			release: "1.2.3",
			server_name: "web-01",
		};

		const result = formatTags(tags);

		expect(result).toContain("environment: production");
		expect(result).toContain("release: 1.2.3");
		expect(result).toContain("server_name: web-01");
	});

	it("returns empty string for empty tags", () => {
		const result = formatTags({});
		expect(result).toBe("");
	});
});
