/**
 * @fileoverview Migration to add Sentry event detail fields.
 *
 * Adds columns for storing rich event data from the Sentry API:
 * - environment: The environment where the error occurred (e.g., "production")
 * - release: The release version when the error occurred
 * - tags: Event tags as JSON object
 * - exceptions: Exception values with stacktraces as JSON array
 * - breadcrumbs: Breadcrumb trail as JSON array
 */

import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;

	// Add environment column
	yield* sql`
		ALTER TABLE sentry_issues ADD COLUMN environment TEXT
	`;

	// Add release column
	yield* sql`
		ALTER TABLE sentry_issues ADD COLUMN release TEXT
	`;

	// Add tags as JSON (Record<string, string>)
	yield* sql`
		ALTER TABLE sentry_issues ADD COLUMN tags JSON
	`;

	// Add exceptions as JSON (ExceptionValue[])
	yield* sql`
		ALTER TABLE sentry_issues ADD COLUMN exceptions JSON
	`;

	// Add breadcrumbs as JSON (Breadcrumb[])
	yield* sql`
		ALTER TABLE sentry_issues ADD COLUMN breadcrumbs JSON
	`;

	// Add index on environment for filtering
	yield* sql`
		CREATE INDEX IF NOT EXISTS idx_sentry_issues_environment ON sentry_issues(environment)
	`;
});
