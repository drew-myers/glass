import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

describe("Glass Setup", () => {
	it.effect("should run Effect-based tests", () =>
		Effect.gen(function* () {
			const result = yield* Effect.succeed(1 + 1);
			expect(result).toBe(2);
		}),
	);

	it("should run regular tests", () => {
		expect(true).toBe(true);
	});
});
