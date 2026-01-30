/**
 * Shared test fixtures and mock helpers for Sentry service tests.
 */

import { HttpClient, type HttpClientError, HttpClientResponse } from "@effect/platform";
import { Effect, Layer, Option, Redacted } from "effect";
import { Config, type GlassConfig } from "../../../src/config/index.js";
import { SentryServiceLive } from "../../../src/services/sentry/index.js";

// =============================================================================
// Test Configurations
// =============================================================================

/** Standard US region test config */
export const TEST_CONFIG: GlassConfig = {
	sources: {
		sentry: Option.some({
			organization: "test-org",
			project: "test-project",
			team: "test-team",
			authToken: Redacted.make("test-token"),
			region: "us" as const,
		}),
	},
	opencode: {
		analyzeModel: "test-model",
		fixModel: "test-model",
	},
	worktree: {
		createCommand: "git worktree add {path} -b {branch}",
		parentDirectory: "../worktrees",
	},
	display: {
		pageSize: 50,
	},
};

/** DE region test config */
export const TEST_CONFIG_DE: GlassConfig = {
	...TEST_CONFIG,
	sources: {
		sentry: Option.some({
			organization: "test-org",
			project: "test-project",
			team: "test-team",
			authToken: Redacted.make("test-token-de"),
			region: "de" as const,
		}),
	},
};

// =============================================================================
// Mock API Response Fixtures
// =============================================================================

/** Mock Sentry issue matching API response shape */
export const MOCK_ISSUE = {
	id: "12345",
	shortId: "TEST-1",
	title: "TypeError: Cannot read property 'id'",
	culprit: "app/utils.ts in getUser",
	permalink: "https://sentry.io/issues/12345/",
	level: "error",
	status: "unresolved",
	platform: "javascript",
	firstSeen: "2024-01-15T10:00:00Z",
	lastSeen: "2024-01-15T12:00:00Z",
	count: "42",
	userCount: 10,
	metadata: {
		type: "TypeError",
		value: "Cannot read property 'id'",
		filename: "app/utils.ts",
		function: "getUser",
		title: "TypeError: Cannot read property 'id'",
	},
	project: {
		id: "1",
		name: "Test Project",
		slug: "test-project",
		platform: "javascript",
	},
	logger: null,
	type: "error",
	isBookmarked: false,
	isPublic: false,
	isSubscribed: true,
	hasSeen: true,
	numComments: 0,
	assignedTo: null,
};

/** Mock Sentry event matching API response shape */
export const MOCK_EVENT = {
	eventID: "abc123",
	groupID: "12345",
	id: "abc123",
	projectID: "1",
	title: "TypeError: Cannot read property 'id'",
	message: "",
	platform: "javascript",
	type: "error",
	size: 1024,
	dateCreated: "2024-01-15T12:00:00Z",
	dateReceived: "2024-01-15T12:00:01Z",
	culprit: "app/utils.ts in getUser",
	location: "app/utils.ts:42",
	metadata: {
		type: "TypeError",
		value: "Cannot read property 'id'",
		filename: "app/utils.ts",
		function: "getUser",
		title: "TypeError",
	},
	tags: [
		{ key: "environment", value: "production", _meta: null },
		{ key: "browser", value: "Chrome", _meta: null },
	],
	user: null,
	entries: [
		{
			type: "exception",
			data: {
				values: [
					{
						type: "TypeError",
						value: "Cannot read property 'id'",
						module: null,
						threadId: null,
						mechanism: { type: "generic", handled: true, data: {} },
						stacktrace: {
							frames: [
								{
									filename: "app/utils.ts",
									absPath: "/home/user/project/app/utils.ts",
									function: "getUser",
									module: "app.utils",
									lineNo: 42,
									colNo: 15,
									inApp: true,
									context: [
										[40, "function getUser(data) {"],
										[41, "  const user = data.user;"],
										[42, "  return user.id;"],
										[43, "}"],
									],
									vars: null,
								},
							],
							hasSystemFrames: false,
							framesOmitted: null,
							registers: null,
						},
					},
				],
				excOmitted: null,
				hasSystemFrames: false,
			},
		},
		{
			type: "breadcrumbs",
			data: {
				values: [
					{
						type: "navigation",
						category: "navigation",
						level: "info",
						message: "Navigated to /users",
						timestamp: "2024-01-15T11:59:55Z",
						data: { from: "/", to: "/users" },
					},
					{
						type: "http",
						category: "xhr",
						level: "info",
						message: null,
						timestamp: "2024-01-15T11:59:58Z",
						data: { url: "/api/user", method: "GET", status_code: 200 },
					},
				],
			},
		},
	],
	contexts: {},
	context: {},
	fingerprints: ["{{ default }}"],
	errors: [],
	sdk: { name: "sentry.javascript.browser", version: "7.0.0" },
	release: "1.0.0",
	dist: null,
};

// =============================================================================
// Mock Layer Helpers
// =============================================================================

/** Config layer for US region tests */
export const TestConfigLayer = Layer.succeed(Config, TEST_CONFIG);

/** Config layer for DE region tests */
export const TestConfigLayerDE = Layer.succeed(Config, TEST_CONFIG_DE);

/** Type for mock response */
export type MockResponse = {
	status: number;
	headers: Record<string, string>;
	body: unknown;
};

/** Type for mock request passed to handler */
export type MockRequest = {
	url: string;
	headers: Record<string, string>;
	method: string;
};

/** Type for mock handler function */
export type MockHandler = (request: MockRequest) => MockResponse;

/**
 * Create a mock HttpClient layer using dependency injection.
 * The handler function receives the full request (url, headers, method) and returns a mock response.
 */
export const createMockHttpClientLayer = (
	handler: MockHandler,
): Layer.Layer<HttpClient.HttpClient> =>
	Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.makeWith<never, never, HttpClientError.HttpClientError, never>(
			(requestEffect) =>
				Effect.flatMap(requestEffect, (request) => {
					const mockRequest: MockRequest = {
						url: request.url,
						headers: request.headers as unknown as Record<string, string>,
						method: request.method,
					};
					const { status, headers, body } = handler(mockRequest);

					const response = new Response(JSON.stringify(body), {
						status,
						headers: new Headers(headers),
					});

					return Effect.succeed(HttpClientResponse.fromWeb(request, response));
				}),
			(request) => Effect.succeed(request),
		),
	);

/**
 * Create the full test layer stack with a mock HTTP handler (US region).
 */
export const createTestLayer = (handler: MockHandler) =>
	SentryServiceLive.pipe(
		Layer.provide(TestConfigLayer),
		Layer.provide(createMockHttpClientLayer(handler)),
	);

/**
 * Create the full test layer stack with a mock HTTP handler (DE region).
 */
export const createTestLayerDE = (handler: MockHandler) =>
	SentryServiceLive.pipe(
		Layer.provide(TestConfigLayerDE),
		Layer.provide(createMockHttpClientLayer(handler)),
	);
