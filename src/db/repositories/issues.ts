/**
 * @fileoverview Sentry issue repository for database persistence.
 *
 * Provides CRUD operations for Sentry issues, handling the conversion
 * between domain types and database rows.
 */

import { SqlClient } from "@effect/sql";
import { Context, Effect, Layer, Option, Schema } from "effect";
import type {
	Breadcrumb,
	ExceptionValue,
	Issue,
	IssueSource,
	IssueState,
	SentrySourceData,
} from "../../domain/issue.js";
import {
	IssueSource as IssueSourceEnum,
	IssueState as IssueStateEnum,
} from "../../domain/issue.js";
import { DbError } from "../errors.js";

// =============================================================================
// Status Type
// =============================================================================

/**
 * Valid status values stored in the database.
 */
export type IssueStatus =
	| "pending"
	| "analyzing"
	| "pending_approval"
	| "in_progress"
	| "pending_review"
	| "error";

// =============================================================================
// Database Row Schemas
// =============================================================================

/**
 * Schema for Sentry metadata stored as JSON in the database.
 */
const SentryMetadataSchema = Schema.Struct({
	type: Schema.optionalWith(Schema.String, { as: "Option" }),
	value: Schema.optionalWith(Schema.String, { as: "Option" }),
	filename: Schema.optionalWith(Schema.String, { as: "Option" }),
	function: Schema.optionalWith(Schema.String, { as: "Option" }),
});

/**
 * Schema for tags stored as JSON in the database.
 */
const TagsSchema = Schema.Record({ key: Schema.String, value: Schema.String });

/**
 * Schema for a Sentry issue row from the database.
 * Handles type transformations like TEXT dates to Date objects.
 */
const SentryIssueRowSchema = Schema.Struct({
	id: Schema.String,
	project: Schema.String,
	title: Schema.String,
	short_id: Schema.String,
	culprit: Schema.String,
	first_seen: Schema.String,
	last_seen: Schema.String,
	count: Schema.NullOr(Schema.Number),
	user_count: Schema.NullOr(Schema.Number),
	metadata: Schema.parseJson(SentryMetadataSchema),
	// New event detail fields
	environment: Schema.NullOr(Schema.String),
	release: Schema.NullOr(Schema.String),
	tags: Schema.NullOr(Schema.parseJson(TagsSchema)),
	exceptions: Schema.NullOr(Schema.parseJson(Schema.Unknown)),
	breadcrumbs: Schema.NullOr(Schema.parseJson(Schema.Unknown)),
	// Workflow state fields
	status: Schema.String,
	analysis_session_id: Schema.NullOr(Schema.String),
	fix_session_id: Schema.NullOr(Schema.String),
	worktree_path: Schema.NullOr(Schema.String),
	worktree_branch: Schema.NullOr(Schema.String),
	error_message: Schema.NullOr(Schema.String),
	error_previous_state: Schema.NullOr(Schema.String),
	created_at: Schema.String,
	updated_at: Schema.String,
});

type SentryIssueRow = Schema.Schema.Type<typeof SentryIssueRowSchema>;

// =============================================================================
// Row to Domain Conversions
// =============================================================================

/**
 * Build metadata object, only including defined properties.
 */
const buildMetadata = (row: SentryIssueRow): SentrySourceData["metadata"] => {
	const metadata: {
		type?: string;
		value?: string;
		filename?: string;
		function?: string;
	} = {};

	if (Option.isSome(row.metadata.type)) {
		metadata.type = row.metadata.type.value;
	}
	if (Option.isSome(row.metadata.value)) {
		metadata.value = row.metadata.value.value;
	}
	if (Option.isSome(row.metadata.filename)) {
		metadata.filename = row.metadata.filename.value;
	}
	if (Option.isSome(row.metadata.function)) {
		metadata.function = row.metadata.function.value;
	}

	return metadata;
};

/**
 * Convert database row columns to an IssueState.
 */
const rowToState = (row: SentryIssueRow): IssueState => {
	switch (row.status) {
		case "pending":
			return IssueStateEnum.Pending();

		case "analyzing":
			return IssueStateEnum.Analyzing({
				sessionId: row.analysis_session_id ?? "",
			});

		case "pending_approval":
			return IssueStateEnum.PendingApproval({
				sessionId: row.analysis_session_id ?? "",
				// Proposal content is stored separately in proposals table
				proposal: "",
			});

		case "in_progress":
			return IssueStateEnum.InProgress({
				analysisSessionId: row.analysis_session_id ?? "",
				implementationSessionId: row.fix_session_id ?? "",
				worktreePath: row.worktree_path ?? "",
				worktreeBranch: row.worktree_branch ?? "",
			});

		case "pending_review":
			return IssueStateEnum.PendingReview({
				analysisSessionId: row.analysis_session_id ?? "",
				implementationSessionId: row.fix_session_id ?? "",
				worktreePath: row.worktree_path ?? "",
				worktreeBranch: row.worktree_branch ?? "",
			});

		case "error":
			return IssueStateEnum.Error({
				previousState: (row.error_previous_state as "analyzing" | "in_progress") ?? "analyzing",
				sessionId: row.analysis_session_id ?? row.fix_session_id ?? "",
				error: row.error_message ?? "Unknown error",
			});

		default:
			return IssueStateEnum.Pending();
	}
};

/**
 * Convert a database row to a domain Issue.
 */
const rowToIssue = (row: SentryIssueRow): Issue => {
	// Build source data with only defined optional fields
	const sourceData: SentrySourceData = {
		title: row.title,
		shortId: row.short_id,
		culprit: row.culprit,
		firstSeen: new Date(row.first_seen),
		lastSeen: new Date(row.last_seen),
		metadata: buildMetadata(row),
		...(row.count !== null ? { count: row.count } : {}),
		...(row.user_count !== null ? { userCount: row.user_count } : {}),
		// New event detail fields
		...(row.environment !== null ? { environment: row.environment } : {}),
		...(row.release !== null ? { release: row.release } : {}),
		...(row.tags !== null ? { tags: row.tags } : {}),
		...(row.exceptions !== null ? { exceptions: row.exceptions as readonly ExceptionValue[] } : {}),
		...(row.breadcrumbs !== null ? { breadcrumbs: row.breadcrumbs as readonly Breadcrumb[] } : {}),
	};

	const source: IssueSource = IssueSourceEnum.Sentry({
		project: row.project,
		data: sourceData,
	});

	const state = rowToState(row);

	return {
		id: row.id,
		source,
		state,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
};

/**
 * Get the status string from an IssueState for database storage.
 */
export const getStatusFromState = (state: IssueState): IssueStatus => {
	switch (state._tag) {
		case "Pending":
			return "pending";
		case "Analyzing":
			return "analyzing";
		case "PendingApproval":
			return "pending_approval";
		case "InProgress":
			return "in_progress";
		case "PendingReview":
			return "pending_review";
		case "Error":
			return "error";
	}
};

// =============================================================================
// Input Types
// =============================================================================

/**
 * Input type for upserting a Sentry issue.
 */
export interface UpsertSentryIssue {
	/** Sentry issue ID */
	readonly id: string;
	/** Sentry project slug */
	readonly project: string;
	/** Issue data from Sentry API */
	readonly data: SentrySourceData;
}

// =============================================================================
// Repository Interface
// =============================================================================

/**
 * Repository service interface for Sentry issue persistence.
 */
export interface SentryIssueRepositoryService {
	/**
	 * Get an issue by its ID.
	 * Returns None if the issue doesn't exist.
	 */
	readonly getById: (id: string) => Effect.Effect<Option.Option<Issue>, DbError>;

	/**
	 * List all issues with the given statuses.
	 */
	readonly listByStatuses: (
		statuses: readonly IssueStatus[],
	) => Effect.Effect<readonly Issue[], DbError>;

	/**
	 * List all issues with pagination.
	 */
	readonly listAll: (options?: {
		readonly limit?: number;
		readonly offset?: number;
	}) => Effect.Effect<readonly Issue[], DbError>;

	/**
	 * Insert or update a Sentry issue.
	 * On insert, state defaults to Pending.
	 * On update, only source data fields are updated, not workflow state.
	 */
	readonly upsert: (issue: UpsertSentryIssue) => Effect.Effect<Issue, DbError>;

	/**
	 * Update the workflow state of an issue.
	 */
	readonly updateState: (id: string, state: IssueState) => Effect.Effect<void, DbError>;
}

// =============================================================================
// Repository Tag
// =============================================================================

/**
 * Service tag for the SentryIssueRepository.
 */
export class SentryIssueRepository extends Context.Tag("glass/SentryIssueRepository")<
	SentryIssueRepository,
	SentryIssueRepositoryService
>() {}

// =============================================================================
// Repository Implementation
// =============================================================================

/**
 * Create the SentryIssueRepository implementation.
 */
const make = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const decode = Schema.decodeUnknown(SentryIssueRowSchema);

	const getById: SentryIssueRepositoryService["getById"] = (id) =>
		Effect.gen(function* () {
			const rows = yield* sql`
        SELECT * FROM sentry_issues WHERE id = ${id}
      `;

			if (rows.length === 0) {
				return Option.none();
			}

			const row = yield* decode(rows[0]);
			return Option.some(rowToIssue(row));
		}).pipe(Effect.mapError((cause) => new DbError({ method: "getById", cause })));

	const listByStatuses: SentryIssueRepositoryService["listByStatuses"] = (statuses) =>
		Effect.gen(function* () {
			if (statuses.length === 0) {
				return [];
			}

			const rows = yield* sql`
        SELECT * FROM sentry_issues 
        WHERE status IN ${sql.in(statuses)}
        ORDER BY updated_at DESC
      `;

			const decoded = yield* Effect.all(
				rows.map((row) => decode(row)),
				{ concurrency: "unbounded" },
			);
			return decoded.map(rowToIssue);
		}).pipe(Effect.mapError((cause) => new DbError({ method: "listByStatuses", cause })));

	const listAll: SentryIssueRepositoryService["listAll"] = (options) =>
		Effect.gen(function* () {
			const limit = options?.limit ?? 100;
			const offset = options?.offset ?? 0;

			const rows = yield* sql`
        SELECT * FROM sentry_issues 
        ORDER BY updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

			const decoded = yield* Effect.all(
				rows.map((row) => decode(row)),
				{ concurrency: "unbounded" },
			);
			return decoded.map(rowToIssue);
		}).pipe(Effect.mapError((cause) => new DbError({ method: "listAll", cause })));

	const upsert: SentryIssueRepositoryService["upsert"] = (issue) =>
		Effect.gen(function* () {
			const metadataJson = JSON.stringify(issue.data.metadata);
			const firstSeen = issue.data.firstSeen.toISOString();
			const lastSeen = issue.data.lastSeen.toISOString();

			// Serialize optional JSON fields
			const tagsJson = issue.data.tags ? JSON.stringify(issue.data.tags) : null;
			const exceptionsJson = issue.data.exceptions ? JSON.stringify(issue.data.exceptions) : null;
			const breadcrumbsJson = issue.data.breadcrumbs
				? JSON.stringify(issue.data.breadcrumbs)
				: null;

			yield* sql`
        INSERT INTO sentry_issues (
          id, project, title, short_id, culprit, 
          first_seen, last_seen, count, user_count, metadata,
          environment, release, tags, exceptions, breadcrumbs,
          status
        ) VALUES (
          ${issue.id}, ${issue.project}, ${issue.data.title}, ${issue.data.shortId}, ${issue.data.culprit},
          ${firstSeen}, ${lastSeen}, ${issue.data.count ?? null}, ${issue.data.userCount ?? null}, ${metadataJson},
          ${issue.data.environment ?? null}, ${issue.data.release ?? null}, ${tagsJson}, ${exceptionsJson}, ${breadcrumbsJson},
          'pending'
        )
        ON CONFLICT(id) DO UPDATE SET
          project = ${issue.project},
          title = ${issue.data.title},
          short_id = ${issue.data.shortId},
          culprit = ${issue.data.culprit},
          first_seen = ${firstSeen},
          last_seen = ${lastSeen},
          count = ${issue.data.count ?? null},
          user_count = ${issue.data.userCount ?? null},
          metadata = ${metadataJson},
          environment = ${issue.data.environment ?? null},
          release = ${issue.data.release ?? null},
          tags = ${tagsJson},
          exceptions = ${exceptionsJson},
          breadcrumbs = ${breadcrumbsJson}
      `;

			// Return the upserted issue
			const result = yield* getById(issue.id);
			return Option.getOrThrow(result);
		}).pipe(Effect.mapError((cause) => new DbError({ method: "upsert", cause })));

	const updateState: SentryIssueRepositoryService["updateState"] = (id, state) =>
		Effect.gen(function* () {
			const status = getStatusFromState(state);

			// Extract state-specific fields
			let analysisSessionId: string | null = null;
			let fixSessionId: string | null = null;
			let worktreePath: string | null = null;
			let worktreeBranch: string | null = null;
			let errorMessage: string | null = null;
			let errorPreviousState: string | null = null;

			switch (state._tag) {
				case "Analyzing":
					analysisSessionId = state.sessionId;
					break;
				case "PendingApproval":
					analysisSessionId = state.sessionId;
					break;
				case "InProgress":
					analysisSessionId = state.analysisSessionId;
					fixSessionId = state.implementationSessionId;
					worktreePath = state.worktreePath;
					worktreeBranch = state.worktreeBranch;
					break;
				case "PendingReview":
					analysisSessionId = state.analysisSessionId;
					fixSessionId = state.implementationSessionId;
					worktreePath = state.worktreePath;
					worktreeBranch = state.worktreeBranch;
					break;
				case "Error":
					errorMessage = state.error;
					errorPreviousState = state.previousState;
					// Keep the session ID from the error
					if (state.previousState === "analyzing") {
						analysisSessionId = state.sessionId;
					} else {
						fixSessionId = state.sessionId;
					}
					break;
			}

			yield* sql`
        UPDATE sentry_issues SET
          status = ${status},
          analysis_session_id = ${analysisSessionId},
          fix_session_id = ${fixSessionId},
          worktree_path = ${worktreePath},
          worktree_branch = ${worktreeBranch},
          error_message = ${errorMessage},
          error_previous_state = ${errorPreviousState}
        WHERE id = ${id}
      `;
		}).pipe(Effect.mapError((cause) => new DbError({ method: "updateState", cause })));

	return {
		getById,
		listByStatuses,
		listAll,
		upsert,
		updateState,
	} satisfies SentryIssueRepositoryService;
});

// =============================================================================
// Layer
// =============================================================================

/**
 * Layer that provides the SentryIssueRepository implementation.
 */
export const SentryIssueRepositoryLive: Layer.Layer<
	SentryIssueRepository,
	never,
	SqlClient.SqlClient
> = Layer.effect(SentryIssueRepository, make);
