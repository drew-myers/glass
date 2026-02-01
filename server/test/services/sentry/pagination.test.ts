/**
 * Tests for Sentry pagination helpers.
 */

import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import { getNextCursor, hasNextPage, parseLinkHeader } from "../../../src/services/sentry/index.js";

describe("parseLinkHeader", () => {
	it("parses empty header", () => {
		expect(parseLinkHeader(undefined)).toEqual([]);
		expect(parseLinkHeader("")).toEqual([]);
	});

	it("parses single link", () => {
		const header =
			'<https://sentry.io/api/0/issues/?cursor=0:100:0>; rel="next"; results="true"; cursor="0:100:0"';
		const links = parseLinkHeader(header);

		expect(links).toHaveLength(1);
		expect(links[0]).toEqual({
			url: "https://sentry.io/api/0/issues/?cursor=0:100:0",
			rel: "next",
			results: true,
			cursor: "0:100:0",
		});
	});

	it("parses multiple links", () => {
		const header =
			'<https://sentry.io/api/0/issues/?cursor=0:0:1>; rel="previous"; results="false"; cursor="0:0:1", <https://sentry.io/api/0/issues/?cursor=0:100:0>; rel="next"; results="true"; cursor="0:100:0"';
		const links = parseLinkHeader(header);

		expect(links).toHaveLength(2);
		const [link0, link1] = links;
		expect(link0?.rel).toBe("previous");
		expect(link0?.results).toBe(false);
		expect(link1?.rel).toBe("next");
		expect(link1?.results).toBe(true);
	});

	it("handles malformed links gracefully", () => {
		const header = "invalid link header";
		const links = parseLinkHeader(header);
		expect(links).toEqual([]);
	});

	it("handles link without cursor", () => {
		const header = '<https://sentry.io/api/0/issues/>; rel="next"; results="true"';
		const links = parseLinkHeader(header);

		expect(links).toHaveLength(1);
		expect(links[0]?.cursor).toBe("");
	});
});

describe("hasNextPage", () => {
	it("returns true when next page has results", () => {
		const links = [
			{ url: "url1", rel: "previous" as const, results: false, cursor: "0:0:1" },
			{ url: "url2", rel: "next" as const, results: true, cursor: "0:100:0" },
		];
		expect(hasNextPage(links)).toBe(true);
	});

	it("returns false when next page has no results", () => {
		const links = [
			{ url: "url1", rel: "previous" as const, results: true, cursor: "0:0:1" },
			{ url: "url2", rel: "next" as const, results: false, cursor: "0:100:0" },
		];
		expect(hasNextPage(links)).toBe(false);
	});

	it("returns false when no next link", () => {
		const links = [{ url: "url1", rel: "previous" as const, results: true, cursor: "0:0:1" }];
		expect(hasNextPage(links)).toBe(false);
	});

	it("returns false for empty array", () => {
		expect(hasNextPage([])).toBe(false);
	});
});

describe("getNextCursor", () => {
	it("returns cursor when next page has results", () => {
		const links = [
			{ url: "url1", rel: "previous" as const, results: false, cursor: "0:0:1" },
			{ url: "url2", rel: "next" as const, results: true, cursor: "0:100:0" },
		];
		expect(getNextCursor(links)).toBe("0:100:0");
	});

	it("returns undefined when no next page", () => {
		const links = [
			{ url: "url1", rel: "previous" as const, results: true, cursor: "0:0:1" },
			{ url: "url2", rel: "next" as const, results: false, cursor: "0:100:0" },
		];
		expect(getNextCursor(links)).toBeUndefined();
	});

	it("returns undefined for empty array", () => {
		expect(getNextCursor([])).toBeUndefined();
	});
});
