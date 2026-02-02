/**
 * @fileoverview Tests for analysis prompt builder.
 */

import { describe, expect, it } from "@effect/vitest";
import type { Issue, SentrySourceData } from "../../../src/domain/issue.js";
import { IssueSource, IssueState } from "../../../src/domain/issue.js";
import { buildAnalysisPrompt, extractStacktraceFiles } from "../../../src/services/prompts/analysis.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const createSentryData = (overrides?: Partial<SentrySourceData>): SentrySourceData => ({
	sentryId: "12345",
	shortId: "PROJ-123",
	title: "TypeError: Cannot read property 'foo' of undefined",
	culprit: "src/handlers/api.ts in handleRequest",
	firstSeen: new Date("2024-01-01T10:00:00Z"),
	lastSeen: new Date("2024-01-15T14:30:00Z"),
	count: 42,
	userCount: 15,
	metadata: {
		type: "TypeError",
		value: "Cannot read property 'foo' of undefined",
		filename: "src/handlers/api.ts",
		function: "handleRequest",
	},
	...overrides,
});

const createIssue = (data: SentrySourceData): Issue => ({
	id: `sentry:${data.sentryId}`,
	source: IssueSource.Sentry({ project: "test-project", data }),
	state: IssueState.Pending(),
	createdAt: new Date(),
	updatedAt: new Date(),
});

// =============================================================================
// Tests
// =============================================================================

describe("buildAnalysisPrompt", () => {
	it("includes issue ID and title", () => {
		const issue = createIssue(createSentryData());
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("# Issue Analysis: PROJ-123");
		expect(prompt).toContain("TypeError: Cannot read property 'foo' of undefined");
	});

	it("includes error type and message from metadata", () => {
		const issue = createIssue(createSentryData());
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("**Type:** TypeError");
		expect(prompt).toContain("**Message:** Cannot read property 'foo' of undefined");
	});

	it("includes culprit and project", () => {
		const issue = createIssue(createSentryData());
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("**Culprit:** src/handlers/api.ts in handleRequest");
		expect(prompt).toContain("**Project:** test-project");
	});

	it("includes impact statistics", () => {
		const issue = createIssue(createSentryData());
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## Impact");
		expect(prompt).toContain("**Events:** 42");
		expect(prompt).toContain("**Users affected:** 15");
		expect(prompt).toContain("**First seen:**");
		expect(prompt).toContain("**Last seen:**");
	});

	it("includes environment info when available", () => {
		const issue = createIssue(
			createSentryData({
				environment: "production",
				release: "1.2.3",
			}),
		);
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## Environment");
		expect(prompt).toContain("**Environment:** production");
		expect(prompt).toContain("**Release:** 1.2.3");
	});

	it("omits environment section when not available", () => {
		const issue = createIssue(createSentryData());
		const prompt = buildAnalysisPrompt(issue);

		// Should not have the Environment header if no env/release
		const lines = prompt.split("\n");
		const hasEnvSection = lines.some((l) => l === "## Environment");
		expect(hasEnvSection).toBe(false);
	});

	it("includes exception and stacktrace", () => {
		const issue = createIssue(
			createSentryData({
				exceptions: [
					{
						type: "TypeError",
						value: "Cannot read property 'foo' of undefined",
						module: null,
						mechanism: { type: "generic", handled: false },
						stacktrace: {
							frames: [
								{
									filename: "src/utils.ts",
									absPath: "/project/src/utils.ts",
									function: "helper",
									module: null,
									lineNo: 10,
									colNo: 5,
									inApp: true,
								},
								{
									filename: "src/api.ts",
									absPath: "/project/src/api.ts",
									function: "handleRequest",
									module: null,
									lineNo: 42,
									colNo: 15,
									inApp: true,
								},
							],
							hasSystemFrames: false,
						},
					},
				],
			}),
		);
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## Exception & Stacktrace");
		expect(prompt).toContain("TypeError: Cannot read property 'foo' of undefined");
		expect(prompt).toContain("at handleRequest");
		expect(prompt).toContain("/project/src/api.ts:42:15");
	});

	it("includes breadcrumbs when available", () => {
		const issue = createIssue(
			createSentryData({
				breadcrumbs: [
					{
						type: "http",
						category: "http",
						level: "info",
						message: null,
						timestamp: "2024-01-15T14:30:00.000Z",
						data: { method: "GET", url: "/api/users", status_code: 200 },
					},
					{
						type: "default",
						category: "console",
						level: "info",
						message: "Processing request",
						timestamp: "2024-01-15T14:30:01.000Z",
					},
				],
			}),
		);
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## Breadcrumbs");
		expect(prompt).toContain("GET /api/users -> 200");
		expect(prompt).toContain("Processing request");
	});

	it("includes HTTP request when available", () => {
		const issue = createIssue(
			createSentryData({
				request: {
					method: "POST",
					url: "https://api.example.com/users",
					query: [["page", "1"]],
					data: { name: "test" },
				},
			}),
		);
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## HTTP Request");
		expect(prompt).toContain("POST https://api.example.com/users");
		expect(prompt).toContain("page: 1");
	});

	it("includes user context when available", () => {
		const issue = createIssue(
			createSentryData({
				user: {
					id: "user-123",
					email: "test@example.com",
				},
			}),
		);
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## User Context");
		expect(prompt).toContain("ID: user-123");
		expect(prompt).toContain("Email: test@example.com");
	});

	it("includes runtime context when available", () => {
		const issue = createIssue(
			createSentryData({
				contexts: {
					browser: { name: "Chrome", version: "120.0" },
					os: { name: "macOS", version: "14.0" },
				},
			}),
		);
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## Runtime Context");
		expect(prompt).toContain("Browser: Chrome 120.0");
		expect(prompt).toContain("OS: macOS 14.0");
	});

	it("includes tags when available", () => {
		const issue = createIssue(
			createSentryData({
				tags: {
					environment: "production",
					server_name: "web-01",
				},
			}),
		);
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## Tags");
		expect(prompt).toContain("environment: production");
		expect(prompt).toContain("server_name: web-01");
	});

	it("includes task instructions", () => {
		const issue = createIssue(createSentryData());
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("## Your Task");
		expect(prompt).toContain("read-only access");
		expect(prompt).toContain("### Steps");
		expect(prompt).toContain("Read the source files");
		expect(prompt).toContain("Investigate the context");
		expect(prompt).toContain("Identify the root cause");
		expect(prompt).toContain("Propose a specific fix");
	});

	it("includes output format guidance", () => {
		const issue = createIssue(createSentryData());
		const prompt = buildAnalysisPrompt(issue);

		expect(prompt).toContain("### Output Format");
		expect(prompt).toContain("#### Root Cause");
		expect(prompt).toContain("#### Proposed Fix");
		expect(prompt).toContain("#### Risk Assessment");
		expect(prompt).toContain("#### Testing Recommendations");
	});
});

describe("extractStacktraceFiles", () => {
	it("extracts in-app file paths from stacktrace", () => {
		const source = IssueSource.Sentry({
			project: "test",
			data: createSentryData({
				exceptions: [
					{
						type: "Error",
						value: "Test",
						module: null,
						mechanism: null,
						stacktrace: {
							frames: [
								{
									filename: "node_modules/express/lib/router.js",
									absPath: null,
									function: "next",
									module: null,
									lineNo: 100,
									colNo: null,
									inApp: false,
								},
								{
									filename: "src/api.ts",
									absPath: "/project/src/api.ts",
									function: "handleRequest",
									module: null,
									lineNo: 42,
									colNo: null,
									inApp: true,
								},
								{
									filename: "src/utils.ts",
									absPath: "/project/src/utils.ts",
									function: "helper",
									module: null,
									lineNo: 10,
									colNo: null,
									inApp: true,
								},
							],
							hasSystemFrames: true,
						},
					},
				],
			}),
		});

		const files = extractStacktraceFiles(source);

		expect(files).toContain("/project/src/api.ts");
		expect(files).toContain("/project/src/utils.ts");
		expect(files).not.toContain("node_modules/express/lib/router.js");
	});

	it("deduplicates file paths", () => {
		const source = IssueSource.Sentry({
			project: "test",
			data: createSentryData({
				exceptions: [
					{
						type: "Error",
						value: "Test",
						module: null,
						mechanism: null,
						stacktrace: {
							frames: [
								{
									filename: "src/api.ts",
									absPath: "/project/src/api.ts",
									function: "first",
									module: null,
									lineNo: 10,
									colNo: null,
									inApp: true,
								},
								{
									filename: "src/api.ts",
									absPath: "/project/src/api.ts",
									function: "second",
									module: null,
									lineNo: 20,
									colNo: null,
									inApp: true,
								},
							],
							hasSystemFrames: false,
						},
					},
				],
			}),
		});

		const files = extractStacktraceFiles(source);

		expect(files).toHaveLength(1);
		expect(files[0]).toBe("/project/src/api.ts");
	});

	it("prefers absPath over filename", () => {
		const source = IssueSource.Sentry({
			project: "test",
			data: createSentryData({
				exceptions: [
					{
						type: "Error",
						value: "Test",
						module: null,
						mechanism: null,
						stacktrace: {
							frames: [
								{
									filename: "api.ts",
									absPath: "/project/src/api.ts",
									function: "test",
									module: null,
									lineNo: 10,
									colNo: null,
									inApp: true,
								},
							],
							hasSystemFrames: false,
						},
					},
				],
			}),
		});

		const files = extractStacktraceFiles(source);

		expect(files).toContain("/project/src/api.ts");
		expect(files).not.toContain("api.ts");
	});

	it("skips URLs", () => {
		const source = IssueSource.Sentry({
			project: "test",
			data: createSentryData({
				exceptions: [
					{
						type: "Error",
						value: "Test",
						module: null,
						mechanism: null,
						stacktrace: {
							frames: [
								{
									filename: "https://cdn.example.com/app.js",
									absPath: "https://cdn.example.com/app.js",
									function: "test",
									module: null,
									lineNo: 10,
									colNo: null,
									inApp: true,
								},
							],
							hasSystemFrames: false,
						},
					},
				],
			}),
		});

		const files = extractStacktraceFiles(source);

		expect(files).toHaveLength(0);
	});

	it("returns empty array for GitHub source", () => {
		const source = IssueSource.GitHub({
			data: {
				owner: "test",
				repo: "repo",
				number: 1,
				labels: [],
				assignees: [],
				body: "Test",
				url: "https://github.com/test/repo/issues/1",
				shortId: "gh#1",
				title: "Test issue",
				firstSeen: new Date(),
				lastSeen: new Date(),
			},
		});

		const files = extractStacktraceFiles(source);

		expect(files).toHaveLength(0);
	});

	it("returns empty array for Ticket source", () => {
		const source = IssueSource.Ticket({
			data: {
				ticketId: "TK-1",
				description: "Test",
				tags: [],
				priority: 1,
				shortId: "TK-1",
				title: "Test ticket",
				firstSeen: new Date(),
				lastSeen: new Date(),
			},
		});

		const files = extractStacktraceFiles(source);

		expect(files).toHaveLength(0);
	});
});
