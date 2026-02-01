//! Tests for API type deserialization.
//!
//! These tests ensure our Rust types correctly deserialize the JSON
//! returned by the Glass server.

use glass_tui::api::{
    IssueDetail, IssueState, ListIssuesResponse, SessionInfo,
};

fn load_fixture(name: &str) -> String {
    std::fs::read_to_string(format!("tests/fixtures/{}.json", name))
        .unwrap_or_else(|e| panic!("Failed to load fixture {}: {}", name, e))
}

#[test]
fn test_list_issues_empty() {
    let json = load_fixture("list_issues_empty");
    let response: ListIssuesResponse = serde_json::from_str(&json)
        .expect("Failed to deserialize empty list response");

    assert_eq!(response.issues.len(), 0);
    assert_eq!(response.total, 0);
    assert_eq!(response.limit, 50);
    assert_eq!(response.offset, 0);
}

#[test]
fn test_list_issues() {
    let json = load_fixture("list_issues");
    let response: ListIssuesResponse = serde_json::from_str(&json)
        .expect("Failed to deserialize list response");

    assert_eq!(response.issues.len(), 3);
    assert_eq!(response.total, 3);

    // Check first issue
    let issue = &response.issues[0];
    assert_eq!(issue.id, "12345");
    assert_eq!(issue.source_type, "sentry");
    assert_eq!(issue.title, "TypeError: Cannot read property 'id' of undefined");
    assert_eq!(issue.short_id, "PROJ-123");
    assert_eq!(issue.status, "pending");
    assert_eq!(issue.event_count, 127);
    assert_eq!(issue.user_count, 43);

    // Check different statuses
    assert_eq!(response.issues[1].status, "pending_approval");
    assert_eq!(response.issues[2].status, "error");
}

#[test]
fn test_issue_detail_pending() {
    let json = load_fixture("issue_detail_pending");
    let detail: IssueDetail = serde_json::from_str(&json)
        .expect("Failed to deserialize pending issue detail");

    assert_eq!(detail.id, "12345");
    assert_eq!(detail.source_type, "sentry");
    assert_eq!(detail.status, "pending");

    // Check source data
    assert_eq!(detail.source.title, Some("TypeError: Cannot read property 'id' of undefined".to_string()));
    assert_eq!(detail.source.culprit, Some("src/handlers/user.ts in getUser".to_string()));
    assert_eq!(detail.source.event_count, Some(127));
    assert_eq!(detail.source.environment, Some("production".to_string()));
    assert_eq!(detail.source.release, Some("v2.3.1".to_string()));

    // Check exceptions
    let exceptions = detail.source.exceptions.expect("Expected exceptions");
    assert_eq!(exceptions.len(), 1);
    assert_eq!(exceptions[0].error_type, "TypeError");

    // Check stacktrace
    let stacktrace = exceptions[0].stacktrace.as_ref().expect("Expected stacktrace");
    assert_eq!(stacktrace.frames.len(), 2);
    assert_eq!(stacktrace.frames[0].function, Some("getUser".to_string()));
    assert_eq!(stacktrace.frames[0].lineno, Some(42));

    // Check breadcrumbs
    let breadcrumbs = detail.source.breadcrumbs.expect("Expected breadcrumbs");
    assert_eq!(breadcrumbs.len(), 1);
    assert_eq!(breadcrumbs[0].category, Some("route".to_string()));

    // Check state
    assert!(matches!(detail.state, IssueState::Pending));
}

#[test]
fn test_issue_detail_pending_approval() {
    let json = load_fixture("issue_detail_pending_approval");
    let detail: IssueDetail = serde_json::from_str(&json)
        .expect("Failed to deserialize pending_approval issue detail");

    assert_eq!(detail.id, "67890");
    assert_eq!(detail.status, "pending_approval");

    // Check state with proposal
    match &detail.state {
        IssueState::PendingApproval { analysis_session_id, proposal } => {
            assert_eq!(analysis_session_id, "2026-02-01T14-30-00-000Z_abc123.jsonl");
            assert!(proposal.contains("## Analysis"));
            assert!(proposal.contains("## Proposed Fix"));
        }
        _ => panic!("Expected PendingApproval state, got {:?}", detail.state),
    }
}

#[test]
fn test_issue_detail_in_progress() {
    let json = load_fixture("issue_detail_in_progress");
    let detail: IssueDetail = serde_json::from_str(&json)
        .expect("Failed to deserialize in_progress issue detail");

    assert_eq!(detail.status, "in_progress");

    match &detail.state {
        IssueState::InProgress {
            analysis_session_id,
            implementation_session_id,
            worktree_path,
            worktree_branch,
        } => {
            assert_eq!(analysis_session_id, "2026-02-01T14-30-00-000Z_abc123.jsonl");
            assert_eq!(implementation_session_id, "2026-02-01T15-00-00-000Z_def456.jsonl");
            assert!(worktree_path.contains("fix-sentry-67890"));
            assert_eq!(worktree_branch, "fix/sentry-67890");
        }
        _ => panic!("Expected InProgress state, got {:?}", detail.state),
    }
}

#[test]
fn test_issue_detail_error() {
    let json = load_fixture("issue_detail_error");
    let detail: IssueDetail = serde_json::from_str(&json)
        .expect("Failed to deserialize error issue detail");

    assert_eq!(detail.status, "error");

    match &detail.state {
        IssueState::Error {
            previous_status,
            session_id,
            error,
        } => {
            assert_eq!(previous_status, "analyzing");
            assert_eq!(session_id, "2026-02-01T16-00-00-000Z_ghi789.jsonl");
            assert_eq!(error, "Model API rate limited");
        }
        _ => panic!("Expected Error state, got {:?}", detail.state),
    }
}

#[test]
fn test_session_info_full() {
    let json = load_fixture("session_info");
    let info: SessionInfo = serde_json::from_str(&json)
        .expect("Failed to deserialize session info");

    let analysis = info.analysis_session.expect("Expected analysis session");
    assert_eq!(analysis.id, "2026-02-01T14-30-00-000Z_abc123.jsonl");
    assert!(analysis.path.contains(".pi/agent/sessions"));

    let implementation = info.implementation_session.expect("Expected implementation session");
    assert_eq!(implementation.id, "2026-02-01T15-00-00-000Z_def456.jsonl");
}

#[test]
fn test_session_info_analysis_only() {
    let json = load_fixture("session_info_analysis_only");
    let info: SessionInfo = serde_json::from_str(&json)
        .expect("Failed to deserialize session info with analysis only");

    assert!(info.analysis_session.is_some());
    assert!(info.implementation_session.is_none());
}
