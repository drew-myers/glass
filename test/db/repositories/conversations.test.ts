/**
 * @fileoverview Tests for ConversationRepository.
 *
 * Uses in-memory SQLite for real database behavior without persistence.
 */

import { BunContext } from "@effect/platform-bun";
import { describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { expect } from "vitest";
import { ConversationRepository, DatabaseTestLive } from "../../../src/db/index.js";
import type { NewConversationMessage } from "../../../src/domain/conversation.js";

// Test layer with in-memory SQLite
const TestLayer = DatabaseTestLive.pipe(Layer.provide(BunContext.layer));

// Helper to create a test message
const makeMessage = (
	issueId: string,
	overrides?: Partial<NewConversationMessage>,
): NewConversationMessage => ({
	issueId,
	sessionId: "session-1",
	phase: "analysis",
	role: "user",
	content: "Test message content",
	...overrides,
});

describe("ConversationRepository", () => {
	describe("appendMessage", () => {
		it.effect("creates a message with auto-generated id and timestamp", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;
				const input = makeMessage("issue-1");

				const message = yield* repo.appendMessage(input);

				expect(message.id).toBeGreaterThan(0);
				expect(message.issueId).toBe("issue-1");
				expect(message.sessionId).toBe("session-1");
				expect(message.phase).toBe("analysis");
				expect(message.role).toBe("user");
				expect(message.content).toBe("Test message content");
				expect(message.createdAt).toBeInstanceOf(Date);
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("creates multiple messages with sequential ids", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				const msg1 = yield* repo.appendMessage(makeMessage("issue-1", { content: "First" }));
				const msg2 = yield* repo.appendMessage(makeMessage("issue-1", { content: "Second" }));

				expect(msg2.id).toBeGreaterThan(msg1.id);
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("getMessages", () => {
		it.effect("returns empty array when no messages exist", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				const messages = yield* repo.getMessages("non-existent");

				expect(messages).toEqual([]);
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("returns all messages for an issue in chronological order", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				yield* repo.appendMessage(makeMessage("issue-1", { content: "First" }));
				yield* repo.appendMessage(makeMessage("issue-1", { content: "Second" }));
				yield* repo.appendMessage(makeMessage("issue-1", { content: "Third" }));

				const messages = yield* repo.getMessages("issue-1");

				expect(messages.length).toBe(3);
				expect(messages[0]?.content).toBe("First");
				expect(messages[1]?.content).toBe("Second");
				expect(messages[2]?.content).toBe("Third");
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("filters by phase when specified", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				yield* repo.appendMessage(
					makeMessage("issue-1", { phase: "analysis", content: "Analysis 1" }),
				);
				yield* repo.appendMessage(makeMessage("issue-1", { phase: "fix", content: "Fix 1" }));
				yield* repo.appendMessage(
					makeMessage("issue-1", { phase: "analysis", content: "Analysis 2" }),
				);

				const analysisMessages = yield* repo.getMessages("issue-1", "analysis");
				const fixMessages = yield* repo.getMessages("issue-1", "fix");

				expect(analysisMessages.length).toBe(2);
				expect(fixMessages.length).toBe(1);
				expect(analysisMessages[0]?.content).toBe("Analysis 1");
				expect(fixMessages[0]?.content).toBe("Fix 1");
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("only returns messages for the specified issue", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				yield* repo.appendMessage(makeMessage("issue-1", { content: "For issue 1" }));
				yield* repo.appendMessage(makeMessage("issue-2", { content: "For issue 2" }));

				const messages = yield* repo.getMessages("issue-1");

				expect(messages.length).toBe(1);
				expect(messages[0]?.issueId).toBe("issue-1");
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("saveProposal", () => {
		it.effect("creates a new proposal", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				const proposal = yield* repo.saveProposal("issue-1", "Fix: Add null check");

				expect(proposal.issueId).toBe("issue-1");
				expect(proposal.content).toBe("Fix: Add null check");
				expect(proposal.createdAt).toBeInstanceOf(Date);
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("updates existing proposal", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				yield* repo.saveProposal("issue-1", "Initial proposal");
				const updated = yield* repo.saveProposal("issue-1", "Updated proposal");

				expect(updated.content).toBe("Updated proposal");

				const retrieved = yield* repo.getProposal("issue-1");
				expect(Option.isSome(retrieved)).toBe(true);
				if (Option.isSome(retrieved)) {
					expect(retrieved.value.content).toBe("Updated proposal");
				}
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("getProposal", () => {
		it.effect("returns None when no proposal exists", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				const proposal = yield* repo.getProposal("non-existent");

				expect(Option.isNone(proposal)).toBe(true);
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("returns Some when proposal exists", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;
				yield* repo.saveProposal("issue-1", "The fix");

				const proposal = yield* repo.getProposal("issue-1");

				expect(Option.isSome(proposal)).toBe(true);
				if (Option.isSome(proposal)) {
					expect(proposal.value.content).toBe("The fix");
				}
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("deleteMessages", () => {
		it.effect("removes all messages for an issue", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				yield* repo.appendMessage(makeMessage("issue-1", { content: "Message 1" }));
				yield* repo.appendMessage(makeMessage("issue-1", { content: "Message 2" }));
				yield* repo.appendMessage(makeMessage("issue-2", { content: "Other issue" }));

				yield* repo.deleteMessages("issue-1");

				const issue1Messages = yield* repo.getMessages("issue-1");
				const issue2Messages = yield* repo.getMessages("issue-2");

				expect(issue1Messages.length).toBe(0);
				expect(issue2Messages.length).toBe(1); // Should not affect other issues
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("succeeds even when no messages exist", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				// Should not throw
				yield* repo.deleteMessages("non-existent");
			}).pipe(Effect.provide(TestLayer)),
		);
	});

	describe("deleteProposal", () => {
		it.effect("removes the proposal for an issue", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				yield* repo.saveProposal("issue-1", "The fix");
				yield* repo.deleteProposal("issue-1");

				const proposal = yield* repo.getProposal("issue-1");
				expect(Option.isNone(proposal)).toBe(true);
			}).pipe(Effect.provide(TestLayer)),
		);

		it.effect("succeeds even when no proposal exists", () =>
			Effect.gen(function* () {
				const repo = yield* ConversationRepository;

				// Should not throw
				yield* repo.deleteProposal("non-existent");
			}).pipe(Effect.provide(TestLayer)),
		);
	});
});
