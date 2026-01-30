/**
 * Integration tests for SentryService using mock HTTP layers.
 */

import {
	HttpClient,
	HttpClientError,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect } from "vitest";
import { SentryService, SentryServiceLive } from "../../../src/services/sentry/index.js";
import {
	MOCK_EVENT,
	MOCK_ISSUE,
	TestConfigLayer,
	createTestLayer,
	createTestLayerDE,
} from "./fixtures.js";

describe("SentryService", () => {
	describe("listIssues", () => {
		it.effect("fetches issues and converts to domain types", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const issues = yield* sentry.listIssues();

				expect(issues).toHaveLength(1);
				expect(issues[0]?._tag).toBe("Sentry");

				if (issues[0]?._tag === "Sentry") {
					expect(issues[0].project).toBe("test-project");
					expect(issues[0].data.title).toBe("TypeError: Cannot read property 'id'");
					expect(issues[0].data.shortId).toBe("TEST-1");
					expect(issues[0].data.count).toBe(42);
					expect(issues[0].data.userCount).toBe(10);
				}
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						expect(url).toContain("/organizations/test-org/issues/");
						expect(url).toContain("is%3Aunresolved");
						expect(url).toContain("assigned%3A%23test-team");

						return {
							status: 200,
							headers: { link: '<url>; rel="next"; results="false"; cursor="0:0:0"' },
							body: [MOCK_ISSUE],
						};
					}),
				),
			),
		);

		it.effect("uses custom query when provided", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				yield* sentry.listIssues({ query: "is:resolved" });
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						expect(url).toContain("is%3Aresolved");
						return {
							status: 200,
							headers: { link: "" },
							body: [],
						};
					}),
				),
			),
		);

		it.effect("handles pagination across multiple pages with cursor parameter", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const issues = yield* sentry.listIssues();

				expect(issues).toHaveLength(2);
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						if (!url.includes("cursor=")) {
							return {
								status: 200,
								headers: { link: '<url>; rel="next"; results="true"; cursor="0:1:0"' },
								body: [MOCK_ISSUE],
							};
						}
						expect(url).toContain("cursor=0%3A1%3A0");
						return {
							status: 200,
							headers: { link: '<url>; rel="next"; results="false"; cursor="0:2:0"' },
							body: [{ ...MOCK_ISSUE, id: "12346", shortId: "TEST-2" }],
						};
					}),
				),
			),
		);

		it.effect("stops pagination when fetchAllPages is false", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const issues = yield* sentry.listIssues({ fetchAllPages: false });

				expect(issues).toHaveLength(1);
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						expect(url).not.toContain("cursor=");
						return {
							status: 200,
							headers: { link: '<url>; rel="next"; results="true"; cursor="0:1:0"' },
							body: [MOCK_ISSUE],
						};
					}),
				),
			),
		);

		it.effect("converts metadata fields correctly", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const issues = yield* sentry.listIssues();

				expect(issues).toHaveLength(1);
				if (issues[0]?._tag === "Sentry") {
					const { metadata } = issues[0].data;
					expect(metadata.type).toBe("TypeError");
					expect(metadata.value).toBe("Cannot read property 'id'");
					expect(metadata.filename).toBe("app/utils.ts");
					expect(metadata.function).toBe("getUser");
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: { link: "" },
						body: [MOCK_ISSUE],
					})),
				),
			),
		);

		it.effect("converts date strings to Date objects", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const issues = yield* sentry.listIssues();

				if (issues[0]?._tag === "Sentry") {
					expect(issues[0].data.firstSeen).toBeInstanceOf(Date);
					expect(issues[0].data.lastSeen).toBeInstanceOf(Date);
					expect(issues[0].data.firstSeen.toISOString()).toBe("2024-01-15T10:00:00.000Z");
					expect(issues[0].data.lastSeen.toISOString()).toBe("2024-01-15T12:00:00.000Z");
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: { link: "" },
						body: [MOCK_ISSUE],
					})),
				),
			),
		);

		it.effect("sends correct Authorization header", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				yield* sentry.listIssues();
			}).pipe(
				Effect.provide(
					createTestLayer(({ headers }) => {
						expect(headers.authorization).toBe("Bearer test-token");
						return {
							status: 200,
							headers: { link: "" },
							body: [],
						};
					}),
				),
			),
		);

		it.effect("uses custom limit when provided", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				yield* sentry.listIssues({ limit: 25 });
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						expect(url).toContain("limit=25");
						return {
							status: 200,
							headers: { link: "" },
							body: [],
						};
					}),
				),
			),
		);

		it.effect("respects MAX_PAGES limit (stops at 10 pages)", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const issues = yield* sentry.listIssues();

				expect(issues).toHaveLength(10);
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						const cursorMatch = url.match(/cursor=0%3A(\d+)%3A0/);
						const page = cursorMatch?.[1] ? Number.parseInt(cursorMatch[1], 10) : 0;

						return {
							status: 200,
							headers: {
								link: `<url>; rel="next"; results="true"; cursor="0:${page + 1}:0"`,
							},
							body: [{ ...MOCK_ISSUE, id: String(page), shortId: `TEST-${page}` }],
						};
					}),
				),
			),
		);

		it.effect("handles sparse metadata (missing optional fields)", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const issues = yield* sentry.listIssues();

				if (issues[0]?._tag === "Sentry") {
					expect(issues[0].data.metadata.type).toBe("Error");
					expect(issues[0].data.metadata.value).toBeUndefined();
					expect(issues[0].data.metadata.filename).toBeUndefined();
					expect(issues[0].data.metadata.function).toBeUndefined();
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: { link: "" },
						body: [
							{
								...MOCK_ISSUE,
								metadata: {
									type: "Error",
									value: "",
									filename: "",
									function: "",
									title: "Error",
								},
							},
						],
					})),
				),
			),
		);
	});

	describe("region configuration", () => {
		it.effect("uses US base URL for us region", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				yield* sentry.listIssues();
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						expect(url).toContain("https://sentry.io/api/0/");
						return {
							status: 200,
							headers: { link: "" },
							body: [],
						};
					}),
				),
			),
		);

		it.effect("uses DE base URL for de region", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				yield* sentry.listIssues();
			}).pipe(
				Effect.provide(
					createTestLayerDE(({ url }) => {
						expect(url).toContain("https://de.sentry.io/api/0/");
						return {
							status: 200,
							headers: { link: "" },
							body: [],
						};
					}),
				),
			),
		);

		it.effect("uses correct auth token for DE region", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				yield* sentry.listIssues();
			}).pipe(
				Effect.provide(
					createTestLayerDE(({ headers }) => {
						expect(headers.authorization).toBe("Bearer test-token-de");
						return {
							status: 200,
							headers: { link: "" },
							body: [],
						};
					}),
				),
			),
		);
	});

	describe("getIssue", () => {
		it.effect("fetches single issue by ID", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const issue = yield* sentry.getIssue("12345");

				expect(issue._tag).toBe("Sentry");
				if (issue._tag === "Sentry") {
					expect(issue.data.shortId).toBe("TEST-1");
					expect(issue.data.title).toBe("TypeError: Cannot read property 'id'");
				}
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						expect(url).toContain("/issues/12345/");
						return {
							status: 200,
							headers: {},
							body: MOCK_ISSUE,
						};
					}),
				),
			),
		);
	});

	describe("getLatestEvent", () => {
		it.effect("fetches latest event with exceptions and breadcrumbs", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const event = yield* sentry.getLatestEvent("12345");

				expect(event.eventId).toBe("abc123");
				expect(event.title).toBe("TypeError: Cannot read property 'id'");
				expect(event.environment).toBe("production");
				expect(event.release).toBe("1.0.0");

				expect(event.exceptions).toHaveLength(1);
				expect(event.exceptions[0]?.type).toBe("TypeError");
				expect(event.exceptions[0]?.stacktrace?.frames).toHaveLength(1);
				expect(event.exceptions[0]?.stacktrace?.frames[0]?.function).toBe("getUser");

				expect(event.breadcrumbs).toHaveLength(2);
				expect(event.breadcrumbs[0]?.category).toBe("navigation");
				expect(event.breadcrumbs[1]?.category).toBe("xhr");

				expect(event.tags.environment).toBe("production");
				expect(event.tags.browser).toBe("Chrome");
			}).pipe(
				Effect.provide(
					createTestLayer(({ url }) => {
						expect(url).toContain("/issues/12345/events/latest/");
						return {
							status: 200,
							headers: {},
							body: MOCK_EVENT,
						};
					}),
				),
			),
		);

		it.effect("converts stack frames with all fields", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const event = yield* sentry.getLatestEvent("12345");

				const frame = event.exceptions[0]?.stacktrace?.frames[0];
				expect(frame).toBeDefined();
				expect(frame?.filename).toBe("app/utils.ts");
				expect(frame?.absPath).toBe("/home/user/project/app/utils.ts");
				expect(frame?.function).toBe("getUser");
				expect(frame?.module).toBe("app.utils");
				expect(frame?.lineNo).toBe(42);
				expect(frame?.colNo).toBe(15);
				expect(frame?.inApp).toBe(true);
				expect(frame?.context).toEqual([
					[40, "function getUser(data) {"],
					[41, "  const user = data.user;"],
					[42, "  return user.id;"],
					[43, "}"],
				]);
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: MOCK_EVENT,
					})),
				),
			),
		);

		it.effect("converts exception mechanism correctly", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const event = yield* sentry.getLatestEvent("12345");

				const exception = event.exceptions[0];
				expect(exception?.mechanism).toEqual({
					type: "generic",
					handled: true,
				});
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: MOCK_EVENT,
					})),
				),
			),
		);

		it.effect("converts breadcrumb data correctly", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const event = yield* sentry.getLatestEvent("12345");

				const navBreadcrumb = event.breadcrumbs[0];
				expect(navBreadcrumb?.type).toBe("navigation");
				expect(navBreadcrumb?.level).toBe("info");
				expect(navBreadcrumb?.message).toBe("Navigated to /users");
				expect(navBreadcrumb?.data).toEqual({ from: "/", to: "/users" });

				const httpBreadcrumb = event.breadcrumbs[1];
				expect(httpBreadcrumb?.type).toBe("http");
				expect(httpBreadcrumb?.category).toBe("xhr");
				expect(httpBreadcrumb?.data).toEqual({
					url: "/api/user",
					method: "GET",
					status_code: 200,
				});
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: MOCK_EVENT,
					})),
				),
			),
		);

		it.effect("handles events without exceptions", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const event = yield* sentry.getLatestEvent("12345");

				expect(event.exceptions).toEqual([]);
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: {
							...MOCK_EVENT,
							entries: [{ type: "breadcrumbs", data: { values: [] } }],
						},
					})),
				),
			),
		);

		it.effect("handles events without breadcrumbs", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const event = yield* sentry.getLatestEvent("12345");

				expect(event.breadcrumbs).toEqual([]);
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: {
							...MOCK_EVENT,
							entries: [
								{
									type: "exception",
									data: { values: [{ type: "Error", value: "test" }] },
								},
							],
						},
					})),
				),
			),
		);

		it.effect("handles release as object with version", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const event = yield* sentry.getLatestEvent("12345");

				expect(event.release).toBe("2.0.0");
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: {
							...MOCK_EVENT,
							release: { version: "2.0.0" },
						},
					})),
				),
			),
		);

		it.effect("handles missing environment tag", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const event = yield* sentry.getLatestEvent("12345");

				expect(event.environment).toBeUndefined();
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: {
							...MOCK_EVENT,
							tags: [{ key: "browser", value: "Chrome", _meta: null }],
						},
					})),
				),
			),
		);
	});

	describe("error handling", () => {
		it.effect("returns AuthError for 401", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.listIssues().pipe(Effect.flip);

				expect(result._tag).toBe("AuthError");
				if (result._tag === "AuthError") {
					expect(result.status).toBe(401);
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 401,
						headers: {},
						body: { detail: "Authentication required" },
					})),
				),
			),
		);

		it.effect("returns AuthError for 403", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.listIssues().pipe(Effect.flip);

				expect(result._tag).toBe("AuthError");
				if (result._tag === "AuthError") {
					expect(result.status).toBe(403);
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 403,
						headers: {},
						body: { detail: "Forbidden" },
					})),
				),
			),
		);

		it.effect("returns NotFoundError for 404", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.getIssue("nonexistent").pipe(Effect.flip);

				expect(result._tag).toBe("NotFoundError");
				if (result._tag === "NotFoundError") {
					expect(result.resource).toBe("issue");
					expect(result.id).toBe("nonexistent");
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 404,
						headers: {},
						body: { detail: "Not found" },
					})),
				),
			),
		);

		it.effect("returns RateLimitError for 429", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.listIssues().pipe(Effect.flip);

				expect(result._tag).toBe("RateLimitError");
				if (result._tag === "RateLimitError") {
					expect(result.limit).toBe(100);
					expect(result.remaining).toBe(0);
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => {
						const resetTime = Math.floor(Date.now() / 1000) + 60;
						return {
							status: 429,
							headers: {
								"x-sentry-rate-limit-limit": "100",
								"x-sentry-rate-limit-remaining": "0",
								"x-sentry-rate-limit-reset": String(resetTime),
							},
							body: { detail: "Rate limited" },
						};
					}),
				),
			),
		);

		it.effect("returns ApiError for other errors", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.listIssues().pipe(Effect.flip);

				expect(result._tag).toBe("ApiError");
				if (result._tag === "ApiError") {
					expect(result.status).toBe(500);
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 500,
						headers: {},
						body: { detail: "Internal server error" },
					})),
				),
			),
		);

		it.effect("returns ApiError for schema validation failure on listIssues", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.listIssues().pipe(Effect.flip);

				expect(result._tag).toBe("ApiError");
				if (result._tag === "ApiError") {
					expect(result.message).toContain("Schema validation failed");
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: { link: "" },
						body: [{ id: "123" }],
					})),
				),
			),
		);

		it.effect("returns ApiError for schema validation failure on getIssue", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.getIssue("12345").pipe(Effect.flip);

				expect(result._tag).toBe("ApiError");
				if (result._tag === "ApiError") {
					expect(result.message).toContain("Schema validation failed");
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: { wrong: "structure" },
					})),
				),
			),
		);

		it.effect("returns ApiError for schema validation failure on getLatestEvent", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.getLatestEvent("12345").pipe(Effect.flip);

				expect(result._tag).toBe("ApiError");
				if (result._tag === "ApiError") {
					expect(result.message).toContain("Schema validation failed");
				}
			}).pipe(
				Effect.provide(
					createTestLayer(() => ({
						status: 200,
						headers: {},
						body: { title: "test" },
					})),
				),
			),
		);

		it.effect("returns ApiError for invalid JSON response", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.listIssues().pipe(Effect.flip);

				expect(result._tag).toBe("ApiError");
				if (result._tag === "ApiError") {
					expect(result.message).toContain("Failed to parse response JSON");
				}
			}).pipe(
				Effect.provide(
					SentryServiceLive.pipe(
						Layer.provide(TestConfigLayer),
						Layer.provide(
							Layer.succeed(
								HttpClient.HttpClient,
								HttpClient.makeWith<never, never, HttpClientError.HttpClientError, never>(
									(requestEffect) =>
										Effect.flatMap(requestEffect, (request) => {
											const response = new Response("not json {{{", {
												status: 200,
												headers: new Headers({}),
											});
											return Effect.succeed(HttpClientResponse.fromWeb(request, response));
										}),
									(request) => Effect.succeed(request),
								),
							),
						),
					),
				),
			),
		);
	});

	describe("network errors", () => {
		it.effect("returns NetworkError for connection failure", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.listIssues().pipe(Effect.flip);

				expect(result._tag).toBe("NetworkError");
				if (result._tag === "NetworkError") {
					expect(result.message).toContain("Connection refused");
				}
			}).pipe(
				Effect.provide(
					SentryServiceLive.pipe(
						Layer.provide(TestConfigLayer),
						Layer.provide(
							Layer.succeed(
								HttpClient.HttpClient,
								HttpClient.makeWith<never, never, HttpClientError.HttpClientError, never>(
									() =>
										Effect.fail(
											new HttpClientError.RequestError({
												request: HttpClientRequest.get("https://sentry.io"),
												reason: "Transport",
												description: "Connection refused",
											}),
										),
									(request) => Effect.succeed(request),
								),
							),
						),
					),
				),
			),
		);

		it.effect("returns NetworkError for timeout", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.getIssue("12345").pipe(Effect.flip);

				expect(result._tag).toBe("NetworkError");
				if (result._tag === "NetworkError") {
					expect(result.message).toContain("Request timeout");
				}
			}).pipe(
				Effect.provide(
					SentryServiceLive.pipe(
						Layer.provide(TestConfigLayer),
						Layer.provide(
							Layer.succeed(
								HttpClient.HttpClient,
								HttpClient.makeWith<never, never, HttpClientError.HttpClientError, never>(
									() =>
										Effect.fail(
											new HttpClientError.RequestError({
												request: HttpClientRequest.get("https://sentry.io"),
												reason: "Transport",
												description: "Request timeout",
											}),
										),
									(request) => Effect.succeed(request),
								),
							),
						),
					),
				),
			),
		);

		it.effect("returns NetworkError for DNS resolution failure", () =>
			Effect.gen(function* () {
				const sentry = yield* SentryService;
				const result = yield* sentry.getLatestEvent("12345").pipe(Effect.flip);

				expect(result._tag).toBe("NetworkError");
				if (result._tag === "NetworkError") {
					expect(result.message).toContain("getaddrinfo ENOTFOUND");
				}
			}).pipe(
				Effect.provide(
					SentryServiceLive.pipe(
						Layer.provide(TestConfigLayer),
						Layer.provide(
							Layer.succeed(
								HttpClient.HttpClient,
								HttpClient.makeWith<never, never, HttpClientError.HttpClientError, never>(
									() =>
										Effect.fail(
											new HttpClientError.RequestError({
												request: HttpClientRequest.get("https://sentry.io"),
												reason: "Transport",
												description: "getaddrinfo ENOTFOUND sentry.io",
											}),
										),
									(request) => Effect.succeed(request),
								),
							),
						),
					),
				),
			),
		);
	});
});
