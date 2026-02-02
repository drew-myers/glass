/**
 * @fileoverview Analysis prompt template for Sentry issues.
 *
 * Builds the prompt sent to the agent for the initial analysis phase.
 * The agent has read-only tools (read, grep, find, ls) and should:
 * 1. Read source files mentioned in the stacktrace
 * 2. Understand the context and root cause
 * 3. Propose a specific fix with rationale
 *
 * @module
 */

import { Match } from "effect";
import type { Issue, IssueSource, SentrySourceData } from "../../domain/issue.js";
import {
	formatBreadcrumbs,
	formatContexts,
	formatExceptions,
	formatRequest,
	formatTags,
	formatUser,
} from "./formatters.js";

// =============================================================================
// Analysis Prompt Builder
// =============================================================================

/**
 * Build the analysis prompt for an issue.
 *
 * Currently supports Sentry issues. Will be extended for GitHub and Ticket
 * sources as they are implemented.
 *
 * @param issue - The issue to analyze
 * @returns The prompt string to send to the agent
 */
export const buildAnalysisPrompt = (issue: Issue): string =>
	Match.value(issue.source).pipe(
		Match.tag("Sentry", ({ project, data }) => buildSentryAnalysisPrompt(project, data)),
		Match.tag("GitHub", () => {
			throw new Error("GitHub issue analysis not yet implemented");
		}),
		Match.tag("Ticket", () => {
			throw new Error("Ticket analysis not yet implemented");
		}),
		Match.exhaustive,
	);

// =============================================================================
// Sentry-specific Prompt
// =============================================================================

/**
 * Build the analysis prompt for a Sentry issue.
 */
const buildSentryAnalysisPrompt = (project: string, data: SentrySourceData): string => {
	const sections: string[] = [];

	// Header
	sections.push(`# Issue Analysis: ${data.shortId}`);
	sections.push("");

	// Error summary
	sections.push("## Error Summary");
	sections.push("");
	sections.push(`**Title:** ${data.title}`);
	if (data.metadata.type) {
		sections.push(`**Type:** ${data.metadata.type}`);
	}
	if (data.metadata.value) {
		sections.push(`**Message:** ${data.metadata.value}`);
	}
	if (data.culprit) {
		sections.push(`**Culprit:** ${data.culprit}`);
	}
	sections.push(`**Project:** ${project}`);
	sections.push("");

	// Statistics
	sections.push("## Impact");
	sections.push("");
	sections.push(`- **Events:** ${data.count ?? "unknown"}`);
	sections.push(`- **Users affected:** ${data.userCount ?? "unknown"}`);
	sections.push(`- **First seen:** ${data.firstSeen.toISOString()}`);
	sections.push(`- **Last seen:** ${data.lastSeen.toISOString()}`);
	sections.push("");

	// Environment context
	if (data.environment || data.release) {
		sections.push("## Environment");
		sections.push("");
		if (data.environment) sections.push(`- **Environment:** ${data.environment}`);
		if (data.release) sections.push(`- **Release:** ${data.release}`);
		sections.push("");
	}

	// Exception & stacktrace (most important section)
	if (data.exceptions && data.exceptions.length > 0) {
		sections.push("## Exception & Stacktrace");
		sections.push("");
		sections.push("```");
		sections.push(formatExceptions(data.exceptions));
		sections.push("```");
		sections.push("");
	}

	// Breadcrumbs
	if (data.breadcrumbs && data.breadcrumbs.length > 0) {
		sections.push("## Breadcrumbs (events leading up to error)");
		sections.push("");
		sections.push("```");
		sections.push(formatBreadcrumbs(data.breadcrumbs));
		sections.push("```");
		sections.push("");
	}

	// HTTP Request
	if (data.request) {
		sections.push("## HTTP Request");
		sections.push("");
		sections.push("```");
		sections.push(formatRequest(data.request));
		sections.push("```");
		sections.push("");
	}

	// User context
	if (data.user) {
		sections.push("## User Context");
		sections.push("");
		sections.push(formatUser(data.user));
		sections.push("");
	}

	// Runtime contexts (browser, OS, etc.)
	if (data.contexts) {
		const contextStr = formatContexts(data.contexts);
		if (contextStr) {
			sections.push("## Runtime Context");
			sections.push("");
			sections.push(contextStr);
			sections.push("");
		}
	}

	// Tags
	if (data.tags && Object.keys(data.tags).length > 0) {
		sections.push("## Tags");
		sections.push("");
		sections.push(formatTags(data.tags));
		sections.push("");
	}

	// Instructions
	sections.push("---");
	sections.push("");
	sections.push("## Your Task");
	sections.push("");
	sections.push("Analyze this error and propose a fix. You have read-only access to the codebase.");
	sections.push("");
	sections.push("### Steps");
	sections.push("");
	sections.push("1. **Read the source files** mentioned in the stacktrace to understand the code");
	sections.push("2. **Investigate the context** - look at related files, types, and dependencies");
	sections.push("3. **Identify the root cause** - why is this error happening?");
	sections.push("4. **Propose a specific fix** with file paths and code changes");
	sections.push("");
	sections.push("### Output Format");
	sections.push("");
	sections.push("Structure your response with these sections:");
	sections.push("");
	sections.push("#### Root Cause");
	sections.push("Explain what's causing the error and why.");
	sections.push("");
	sections.push("#### Proposed Fix");
	sections.push("Describe the specific changes needed. Include:");
	sections.push("- File paths");
	sections.push("- Code snippets showing the fix");
	sections.push("- Any new files or dependencies needed");
	sections.push("");
	sections.push("#### Risk Assessment");
	sections.push("Note any potential side effects, edge cases, or concerns with the fix.");
	sections.push("");
	sections.push("#### Testing Recommendations");
	sections.push("Suggest how to verify the fix works and doesn't introduce regressions.");

	return sections.join("\n");
};

// =============================================================================
// Utility: Extract files from stacktrace
// =============================================================================

/**
 * Extract unique file paths from an issue's stacktrace.
 * Useful for pre-loading context or validating file existence.
 *
 * Only returns in-app files (excludes library frames).
 *
 * @param source - The issue source
 * @returns Array of file paths from the stacktrace
 */
export const extractStacktraceFiles = (source: IssueSource): string[] =>
	Match.value(source).pipe(
		Match.tag("Sentry", ({ data }) => {
			const files = new Set<string>();

			for (const exception of data.exceptions ?? []) {
				for (const frame of exception.stacktrace?.frames ?? []) {
					// Only include in-app frames with valid file paths
					if (frame.inApp && frame.filename) {
						// Prefer absPath if available, otherwise use filename
						const path = frame.absPath ?? frame.filename;
						// Skip URLs and paths that don't look like local files
						if (!path.startsWith("http") && !path.startsWith("<")) {
							files.add(path);
						}
					}
				}
			}

			return Array.from(files);
		}),
		Match.tag("GitHub", () => []),
		Match.tag("Ticket", () => []),
		Match.exhaustive,
	);
