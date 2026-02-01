/**
 * Conversation and proposal types for persisting agent interactions.
 *
 * @module
 */

/**
 * Represents a single message in an agent conversation.
 * Messages are persisted to SQLite for conversation continuity across restarts.
 */
export interface ConversationMessage {
	/** Auto-incrementing primary key */
	readonly id: number;
	/** The Sentry issue ID this message belongs to */
	readonly issueId: string;
	/** The OpenCode session ID */
	readonly sessionId: string;
	/** The workflow phase: analysis or implementation */
	readonly phase: "analysis" | "implementation";
	/** Who sent the message */
	readonly role: "user" | "assistant";
	/** The message content (may contain markdown) */
	readonly content: string;
	/** When the message was created */
	readonly createdAt: Date;
}

/**
 * Input type for creating a new conversation message.
 * Omits auto-generated fields (id, createdAt).
 */
export type NewConversationMessage = Omit<ConversationMessage, "id" | "createdAt">;

/**
 * Represents a fix proposal extracted from analysis.
 * Stored separately for quick access without parsing conversation history.
 */
export interface Proposal {
	/** The Sentry issue ID this proposal is for */
	readonly issueId: string;
	/** The proposal content (markdown with fix details) */
	readonly content: string;
	/** When the proposal was created */
	readonly createdAt: Date;
}

/**
 * Input type for creating a new proposal.
 * Omits auto-generated fields (createdAt).
 */
export type NewProposal = Omit<Proposal, "createdAt">;
