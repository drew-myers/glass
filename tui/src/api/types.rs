//! API types matching the server's REST contract.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// =============================================================================
// List Issues
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListIssuesResponse {
    pub issues: Vec<Issue>,
    pub total: usize,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub id: String,
    pub source_type: String,
    pub title: String,
    pub short_id: String,
    pub status: String,
    pub event_count: u64,
    pub user_count: u64,
    pub first_seen: String,
    pub last_seen: String,
    pub updated_at: String,
}

// =============================================================================
// Issue Detail
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDetail {
    pub id: String,
    pub source_type: String,
    pub status: String,
    pub source: IssueSource,
    pub state: IssueState,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueSource {
    pub title: Option<String>,
    pub short_id: Option<String>,
    pub culprit: Option<String>,
    pub event_count: Option<u64>,
    pub user_count: Option<u64>,
    pub first_seen: Option<String>,
    pub last_seen: Option<String>,
    pub metadata: Option<IssueMetadata>,
    pub exceptions: Option<Vec<Exception>>,
    pub breadcrumbs: Option<Vec<Breadcrumb>>,
    pub environment: Option<String>,
    pub release: Option<String>,
    pub tags: Option<HashMap<String, String>>,
    pub request: Option<RequestInfo>,
    pub user: Option<UserInfo>,
    pub contexts: Option<ContextInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestInfo {
    pub method: String,
    pub url: String,
    pub query: Option<Vec<(String, String)>>,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: Option<String>,
    pub email: Option<String>,
    pub ip_address: Option<String>,
    pub username: Option<String>,
    pub geo: Option<GeoInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoInfo {
    pub country_code: Option<String>,
    pub city: Option<String>,
    pub region: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextInfo {
    pub browser: Option<BrowserContext>,
    pub os: Option<OsContext>,
    pub device: Option<DeviceContext>,
    pub runtime: Option<RuntimeContext>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserContext {
    pub name: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsContext {
    pub name: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceContext {
    pub family: Option<String>,
    pub model: Option<String>,
    pub brand: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeContext {
    pub name: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueMetadata {
    #[serde(rename = "type")]
    pub error_type: Option<String>,
    pub value: Option<String>,
    pub filename: Option<String>,
    pub function: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exception {
    #[serde(rename = "type")]
    pub error_type: String,
    pub value: Option<String>,
    pub stacktrace: Option<Stacktrace>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stacktrace {
    pub frames: Vec<StackFrame>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StackFrame {
    pub filename: Option<String>,
    pub function: Option<String>,
    pub lineno: Option<u32>,
    pub colno: Option<u32>,
    pub context: Option<Vec<ContextLine>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextLine {
    pub line: u32,
    pub code: String,
    #[serde(default)]
    pub current: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Breadcrumb {
    #[serde(rename = "type")]
    pub crumb_type: Option<String>,
    pub category: Option<String>,
    pub message: Option<String>,
    pub timestamp: Option<String>,
    pub data: Option<BreadcrumbData>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreadcrumbData {
    pub url: Option<String>,
    #[serde(rename = "http.response.status_code")]
    pub status_code: Option<i32>,
    #[serde(rename = "http.method")]
    pub http_method: Option<String>,
    pub reason: Option<String>,
}

// =============================================================================
// Issue State (tagged union)
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case", tag = "status")]
pub enum IssueState {
    Pending,
    #[serde(rename_all = "camelCase")]
    Analyzing {
        analysis_session_id: String,
    },
    #[serde(rename_all = "camelCase")]
    PendingApproval {
        analysis_session_id: String,
        proposal: String,
    },
    #[serde(rename_all = "camelCase")]
    InProgress {
        analysis_session_id: String,
        implementation_session_id: String,
        worktree_path: String,
        worktree_branch: String,
    },
    #[serde(rename_all = "camelCase")]
    PendingReview {
        analysis_session_id: String,
        implementation_session_id: String,
        worktree_path: String,
        worktree_branch: String,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        previous_status: String,
        session_id: String,
        error: String,
    },
}

// =============================================================================
// Session Info
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub analysis_session: Option<SessionRef>,
    pub implementation_session: Option<SessionRef>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRef {
    pub id: String,
    pub path: String,
}

// =============================================================================
// Action Responses
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResponse {
    pub status: String,
    pub session_id: String,
    pub session_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveResponse {
    pub status: String,
    pub worktree_path: String,
    pub worktree_branch: String,
    pub implementation_session_id: String,
    pub implementation_session_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectResponse {
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteResponse {
    pub status: String,
    pub cleaned_up: Option<CleanedUpInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanedUpInfo {
    pub worktree_path: String,
    pub branch: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryResponse {
    pub status: String,
    pub session_id: String,
}
