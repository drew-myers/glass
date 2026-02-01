/**
 * @fileoverview Health check endpoint handler.
 */

import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

const VERSION = "0.1.0";

export const healthHandler = Effect.gen(function* () {
	return yield* HttpServerResponse.json({
		status: "ok",
		version: VERSION,
	});
});
