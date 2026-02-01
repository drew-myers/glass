/**
 * @fileoverview Conversation repository for database persistence.
 *
 * Provides operations for storing and retrieving conversation messages
 * and proposals associated with issues.
 */

import { SqlClient } from "@effect/sql";
import { Context, Effect, Layer, Option, Schema } from "effect";
import type {
	ConversationMessage,
	NewConversationMessage,
	Proposal,
} from "../../domain/conversation.js";
import { DbError } from "../errors.js";

// =============================================================================
// Database Row Schemas
// =============================================================================

/**
 * Schema for a conversation message row from the database.
 */
const ConversationMessageRowSchema = Schema.Struct({
	id: Schema.Number,
	issue_id: Schema.String,
	session_id: Schema.String,
	phase: Schema.Literal("analysis", "implementation"),
	role: Schema.Literal("user", "assistant"),
	content: Schema.String,
	created_at: Schema.String,
});

type ConversationMessageRow = Schema.Schema.Type<typeof ConversationMessageRowSchema>;

/**
 * Schema for a proposal row from the database.
 */
const ProposalRowSchema = Schema.Struct({
	issue_id: Schema.String,
	content: Schema.String,
	created_at: Schema.String,
});

type ProposalRow = Schema.Schema.Type<typeof ProposalRowSchema>;

// =============================================================================
// Row to Domain Conversions
// =============================================================================

/**
 * Convert a database row to a domain ConversationMessage.
 */
const rowToMessage = (row: ConversationMessageRow): ConversationMessage => ({
	id: row.id,
	issueId: row.issue_id,
	sessionId: row.session_id,
	phase: row.phase,
	role: row.role,
	content: row.content,
	createdAt: new Date(row.created_at),
});

/**
 * Convert a database row to a domain Proposal.
 */
const rowToProposal = (row: ProposalRow): Proposal => ({
	issueId: row.issue_id,
	content: row.content,
	createdAt: new Date(row.created_at),
});

// =============================================================================
// Repository Interface
// =============================================================================

/**
 * Repository service interface for conversation persistence.
 */
export interface ConversationRepositoryService {
	/**
	 * Append a new message to a conversation.
	 * Returns the created message with its auto-generated ID and timestamp.
	 */
	readonly appendMessage: (
		msg: NewConversationMessage,
	) => Effect.Effect<ConversationMessage, DbError>;

	/**
	 * Get all messages for an issue, optionally filtered by phase.
	 * Messages are returned in chronological order.
	 */
	readonly getMessages: (
		issueId: string,
		phase?: "analysis" | "implementation",
	) => Effect.Effect<readonly ConversationMessage[], DbError>;

	/**
	 * Save or update a proposal for an issue.
	 * Uses upsert semantics - creates if not exists, updates if exists.
	 */
	readonly saveProposal: (issueId: string, content: string) => Effect.Effect<Proposal, DbError>;

	/**
	 * Get the proposal for an issue.
	 * Returns None if no proposal exists.
	 */
	readonly getProposal: (issueId: string) => Effect.Effect<Option.Option<Proposal>, DbError>;

	/**
	 * Delete all messages for an issue.
	 * Used when cleaning up after a fix is complete or rejected.
	 */
	readonly deleteMessages: (issueId: string) => Effect.Effect<void, DbError>;

	/**
	 * Delete the proposal for an issue.
	 */
	readonly deleteProposal: (issueId: string) => Effect.Effect<void, DbError>;
}

// =============================================================================
// Repository Tag
// =============================================================================

/**
 * Service tag for the ConversationRepository.
 */
export class ConversationRepository extends Context.Tag("glass/ConversationRepository")<
	ConversationRepository,
	ConversationRepositoryService
>() {}

// =============================================================================
// Repository Implementation
// =============================================================================

/**
 * Create the ConversationRepository implementation.
 */
const make = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const decodeMessage = Schema.decodeUnknown(ConversationMessageRowSchema);
	const decodeProposal = Schema.decodeUnknown(ProposalRowSchema);

	const appendMessage: ConversationRepositoryService["appendMessage"] = (msg) =>
		Effect.gen(function* () {
			// Insert the message
			yield* sql`
        INSERT INTO conversation_messages (issue_id, session_id, phase, role, content)
        VALUES (${msg.issueId}, ${msg.sessionId}, ${msg.phase}, ${msg.role}, ${msg.content})
      `;

			// Get the inserted message with its auto-generated ID and timestamp
			const rows = yield* sql`
        SELECT * FROM conversation_messages 
        WHERE rowid = last_insert_rowid()
      `;

			if (rows.length === 0) {
				// This shouldn't happen, but handle gracefully
				return {
					id: 0,
					issueId: msg.issueId,
					sessionId: msg.sessionId,
					phase: msg.phase,
					role: msg.role,
					content: msg.content,
					createdAt: new Date(),
				};
			}

			const row = yield* decodeMessage(rows[0]);
			return rowToMessage(row);
		}).pipe(Effect.mapError((cause) => new DbError({ method: "appendMessage", cause })));

	const getMessages: ConversationRepositoryService["getMessages"] = (issueId, phase) =>
		Effect.gen(function* () {
			const rows =
				phase !== undefined
					? yield* sql`
              SELECT * FROM conversation_messages 
              WHERE issue_id = ${issueId} AND phase = ${phase}
              ORDER BY created_at ASC
            `
					: yield* sql`
              SELECT * FROM conversation_messages 
              WHERE issue_id = ${issueId}
              ORDER BY created_at ASC
            `;

			const decoded = yield* Effect.all(
				rows.map((row) => decodeMessage(row)),
				{ concurrency: "unbounded" },
			);
			return decoded.map(rowToMessage);
		}).pipe(Effect.mapError((cause) => new DbError({ method: "getMessages", cause })));

	const saveProposal: ConversationRepositoryService["saveProposal"] = (issueId, content) =>
		Effect.gen(function* () {
			yield* sql`
        INSERT INTO proposals (issue_id, content)
        VALUES (${issueId}, ${content})
        ON CONFLICT(issue_id) DO UPDATE SET
          content = ${content},
          created_at = datetime('now')
      `;

			// Return the saved proposal
			const rows = yield* sql`
        SELECT * FROM proposals WHERE issue_id = ${issueId}
      `;

			if (rows.length === 0) {
				// This shouldn't happen, but handle gracefully
				return {
					issueId,
					content,
					createdAt: new Date(),
				};
			}

			const row = yield* decodeProposal(rows[0]);
			return rowToProposal(row);
		}).pipe(Effect.mapError((cause) => new DbError({ method: "saveProposal", cause })));

	const getProposal: ConversationRepositoryService["getProposal"] = (issueId) =>
		Effect.gen(function* () {
			const rows = yield* sql`
        SELECT * FROM proposals WHERE issue_id = ${issueId}
      `;

			if (rows.length === 0) {
				return Option.none();
			}

			const row = yield* decodeProposal(rows[0]);
			return Option.some(rowToProposal(row));
		}).pipe(Effect.mapError((cause) => new DbError({ method: "getProposal", cause })));

	const deleteMessages: ConversationRepositoryService["deleteMessages"] = (issueId) =>
		Effect.gen(function* () {
			yield* sql`
        DELETE FROM conversation_messages WHERE issue_id = ${issueId}
      `;
		}).pipe(Effect.mapError((cause) => new DbError({ method: "deleteMessages", cause })));

	const deleteProposal: ConversationRepositoryService["deleteProposal"] = (issueId) =>
		Effect.gen(function* () {
			yield* sql`
        DELETE FROM proposals WHERE issue_id = ${issueId}
      `;
		}).pipe(Effect.mapError((cause) => new DbError({ method: "deleteProposal", cause })));

	return {
		appendMessage,
		getMessages,
		saveProposal,
		getProposal,
		deleteMessages,
		deleteProposal,
	} satisfies ConversationRepositoryService;
});

// =============================================================================
// Layer
// =============================================================================

/**
 * Layer that provides the ConversationRepository implementation.
 */
export const ConversationRepositoryLive: Layer.Layer<
	ConversationRepository,
	never,
	SqlClient.SqlClient
> = Layer.effect(ConversationRepository, make);
