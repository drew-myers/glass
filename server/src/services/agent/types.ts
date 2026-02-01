/**
 * @fileoverview Type definitions for the AgentService.
 *
 * Defines the AgentSessionHandle interface and related types that wrap
 * the Pi SDK's AgentSession with Effect-based methods.
 */

import type { AgentSession, AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { Effect } from "effect";
import type { AgentError } from "./errors.js";

/**
 * Listener function for agent session events.
 * Mirrors Pi SDK's event subscription signature.
 */
export type AgentEventListener = (event: AgentSessionEvent) => void;

/**
 * Handle to a managed agent session.
 *
 * Wraps Pi SDK's AgentSession with Effect-based methods and provides
 * a consistent interface for Glass's orchestration layer.
 */
export interface AgentSessionHandle {
	/** Unique identifier for this session */
	readonly sessionId: string;

	/** The underlying Pi SDK AgentSession for advanced use cases */
	readonly session: AgentSession;

	/** The type of session (analysis = read-only, fix = full tools) */
	readonly type: "analysis" | "fix";

	/**
	 * Send a prompt to the agent and wait for completion.
	 *
	 * @param message - The message to send to the agent
	 * @returns Effect that completes when the agent finishes responding
	 */
	prompt: (message: string) => Effect.Effect<void, AgentError>;

	/**
	 * Subscribe to streaming events from the agent.
	 *
	 * @param listener - Callback invoked for each event
	 * @returns Unsubscribe function to stop receiving events
	 */
	subscribe: (listener: AgentEventListener) => () => void;

	/**
	 * Abort the current agent operation.
	 *
	 * @returns Effect that completes when abort is acknowledged
	 */
	abort: () => Effect.Effect<void, AgentError>;
}

/**
 * Valid thinking levels for Pi SDK models.
 */
export type ThinkingLevelValue = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Parsed model configuration.
 *
 * TODO: Replace with shared utility from config ticket when available.
 */
export interface ParsedModel {
	/** Provider name (e.g., "anthropic", "openai") */
	readonly provider: string;
	/** Model ID (e.g., "claude-sonnet-4-20250514") */
	readonly modelId: string;
	/** Optional thinking level suffix (undefined means "off") */
	readonly thinkingLevel: ThinkingLevelValue | undefined;
}
