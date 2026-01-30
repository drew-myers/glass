/**
 * @fileoverview Initial database schema migration for Glass.
 *
 * Creates the following tables:
 * - metadata: Key-value store for project metadata
 * - sentry_issues: Sentry issues with workflow state
 * - conversation_messages: AI conversation history
 * - proposals: Fix proposals generated during analysis
 */

import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;

	// Metadata table for project info
	yield* sql`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;

	// Sentry issues table with workflow state
	yield* sql`
    CREATE TABLE IF NOT EXISTS sentry_issues (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      title TEXT NOT NULL,
      short_id TEXT NOT NULL,
      culprit TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      count INTEGER,
      user_count INTEGER,
      metadata JSON NOT NULL,
      
      -- Workflow state
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'analyzing', 'proposed', 'fixing', 'fixed', 'error')),
      analysis_session_id TEXT,
      fix_session_id TEXT,
      worktree_path TEXT,
      worktree_branch TEXT,
      error_message TEXT,
      error_previous_state TEXT
        CHECK(error_previous_state IS NULL OR error_previous_state IN ('analyzing', 'fixing')),
      
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

	// Indexes for sentry_issues
	yield* sql`CREATE INDEX IF NOT EXISTS idx_sentry_issues_status ON sentry_issues(status)`;
	yield* sql`CREATE INDEX IF NOT EXISTS idx_sentry_issues_updated ON sentry_issues(updated_at DESC)`;

	// Conversation messages table
	yield* sql`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('analysis', 'fix')),
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

	// Index for conversation queries
	yield* sql`CREATE INDEX IF NOT EXISTS idx_messages_issue_phase ON conversation_messages(issue_id, phase, created_at)`;

	// Proposals table
	yield* sql`
    CREATE TABLE IF NOT EXISTS proposals (
      issue_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

	// Trigger for updated_at on sentry_issues
	yield* sql`
    CREATE TRIGGER IF NOT EXISTS sentry_issues_updated_at 
    AFTER UPDATE ON sentry_issues
    BEGIN
      UPDATE sentry_issues SET updated_at = datetime('now') WHERE id = NEW.id;
    END
  `;
});
