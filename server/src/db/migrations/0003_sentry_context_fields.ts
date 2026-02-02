/**
 * @fileoverview Migration to add Sentry context fields.
 *
 * Adds columns for storing additional context from Sentry events:
 * - request: HTTP request info (method, URL, body)
 * - user: User info (id, email, ip, geo)
 * - contexts: Runtime contexts (browser, device, os, runtime)
 */

import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;

	// Add request as JSON (RequestInfo)
	yield* sql`
		ALTER TABLE sentry_issues ADD COLUMN request JSON
	`;

	// Add user as JSON (UserInfo)
	yield* sql`
		ALTER TABLE sentry_issues ADD COLUMN user_info JSON
	`;

	// Add contexts as JSON (ContextInfo)
	yield* sql`
		ALTER TABLE sentry_issues ADD COLUMN contexts JSON
	`;
});
