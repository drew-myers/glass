/**
 * @fileoverview API routes for Glass server.
 *
 * Defines all REST endpoints and wires up handlers.
 */

import {
	HttpRouter,
	HttpServer,
	HttpServerRequest,
	HttpServerResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { healthHandler } from "./handlers/health.js";
import { listIssuesHandler, getIssueHandler, refreshIssuesHandler } from "./handlers/issues.js";

// =============================================================================
// Router
// =============================================================================

const router = HttpRouter.empty.pipe(
	// Health check
	HttpRouter.get("/health", healthHandler),

	// Issues
	HttpRouter.get("/api/v1/issues", listIssuesHandler),
	HttpRouter.get("/api/v1/issues/:id", getIssueHandler),
	HttpRouter.post("/api/v1/issues/refresh", refreshIssuesHandler),

	// TODO: Add more routes as we implement them
	// HttpRouter.post("/api/v1/issues/:id/analyze", analyzeHandler),
	// HttpRouter.post("/api/v1/issues/:id/approve", approveHandler),
	// HttpRouter.post("/api/v1/issues/:id/reject", rejectHandler),
	// HttpRouter.post("/api/v1/issues/:id/revise", reviseHandler),
	// HttpRouter.post("/api/v1/issues/:id/complete", completeHandler),
	// HttpRouter.post("/api/v1/issues/:id/retry", retryHandler),
	// HttpRouter.get("/api/v1/issues/:id/session", getSessionHandler),
);

// =============================================================================
// Server Layer
// =============================================================================

export const ApiLive = router.pipe(
	HttpServer.serve(),
	HttpServer.withLogAddress,
	Layer.provide(HttpServer.layerContext),
);
