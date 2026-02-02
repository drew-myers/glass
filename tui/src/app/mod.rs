//! Application state and coordination.
//!
//! The app module is split into:
//! - `state`: Pure data structures
//! - `background`: Async task management
//! - `analysis`: Analysis event processing

mod analysis;
mod background;
mod state;

pub use state::{ActivityLine, ActivityStyle, AppState, Screen};
pub use background::{BackgroundMessage, BackgroundTasks};

use crate::api::IssueState;
use tracing::debug;

/// Main application coordinator.
///
/// Holds the state and background task manager, provides high-level operations.
pub struct App {
    /// Pure application state
    pub state: AppState,
    /// Background task manager
    bg: BackgroundTasks,
}

impl App {
    pub fn new(server_url: String) -> Self {
        Self {
            state: AppState::default(),
            bg: BackgroundTasks::new(server_url),
        }
    }

    // === Convenience accessors (delegate to state) ===

    pub fn screen(&self) -> &Screen {
        &self.state.screen
    }

    pub fn half_page(&self) -> i32 {
        self.state.half_page()
    }

    pub fn set_terminal_size(&mut self, width: u16, height: u16) {
        self.state.set_terminal_size(width, height);
    }

    // === Background task polling ===

    /// Poll for background task completions and update state.
    pub fn poll_background(&mut self) {
        for msg in self.bg.poll() {
            match msg {
                BackgroundMessage::ListRefreshComplete(result) => {
                    self.state.is_refreshing = false;
                    match result {
                        Ok(response) => {
                            self.state.issues = response.issues;
                            self.state.clamp_selection();
                        }
                        Err(e) => {
                            self.state.error = Some(e);
                        }
                    }
                }
                BackgroundMessage::DetailRefreshComplete(result) => {
                    self.state.is_refreshing_detail = false;
                    match result {
                        Ok(detail) => {
                            self.state.current_issue = Some(detail);
                        }
                        Err(e) => {
                            self.state.error = Some(e);
                        }
                    }
                }
                BackgroundMessage::AnalysisEvent(event) => {
                    analysis::handle_analysis_event(&mut self.state, event);
                }
                BackgroundMessage::AnalysisStreamEnded(error) => {
                    self.state.is_streaming_analysis = false;
                    if let Some(err) = error {
                        self.state.analysis_lines.push(ActivityLine {
                            icon: "✗",
                            text: format!("Stream error: {}", err),
                            style: ActivityStyle::Error,
                        });
                    }
                }
            }
        }
    }

    // === Data loading ===

    /// Load cached issues from server (fast).
    pub async fn load_cached(&mut self) {
        self.state.error = None;

        match self.bg.client().list_issues().await {
            Ok(response) => {
                self.state.issues = response.issues;
                self.state.clamp_selection();
            }
            Err(e) => {
                self.state.error = Some(format!("Failed to fetch issues: {}", e));
            }
        }
    }

    /// Start a background refresh from Sentry.
    pub fn start_refresh(&mut self) {
        if self.state.is_refreshing {
            return;
        }

        self.state.is_refreshing = true;
        self.state.error = None;
        self.bg.spawn_list_refresh();
    }

    /// Load cached issue detail from server (fast).
    pub async fn load_cached_detail(&mut self) {
        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        self.state.error = None;

        match self.bg.client().get_issue(&issue_id).await {
            Ok(detail) => {
                // If issue is in Analyzing state, connect to SSE stream
                if matches!(detail.state, IssueState::Analyzing { .. }) {
                    self.start_analysis_stream(&detail.id);
                }
                self.state.current_issue = Some(detail);
            }
            Err(e) => {
                self.state.error = Some(format!("Failed to fetch issue: {}", e));
            }
        }
    }

    /// Start a background refresh for the current issue from Sentry.
    pub fn start_detail_refresh(&mut self) {
        if self.state.is_refreshing_detail {
            return;
        }

        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        self.state.is_refreshing_detail = true;
        self.state.error = None;
        self.bg.spawn_detail_refresh(issue_id);
    }

    /// Refresh current issue detail from server (sync, for use after actions).
    pub async fn refresh_current_issue(&mut self) {
        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        self.state.is_loading = true;

        match self.bg.client().get_issue(&issue_id).await {
            Ok(detail) => {
                self.state.current_issue = Some(detail);
            }
            Err(e) => {
                self.state.error = Some(format!("Failed to fetch issue: {}", e));
            }
        }

        self.state.is_loading = false;
    }

    // === Navigation ===

    /// Move selection by delta (positive = down, negative = up).
    pub fn move_selection(&mut self, delta: i32) {
        if self.state.issues.is_empty() {
            return;
        }

        let new_index = self.state.selected_index as i32 + delta;
        self.state.selected_index = new_index.clamp(0, self.state.issues.len() as i32 - 1) as usize;
    }

    /// Jump to top of list.
    pub fn jump_to_top(&mut self) {
        self.state.selected_index = 0;
    }

    /// Jump to bottom of list.
    pub fn jump_to_bottom(&mut self) {
        if !self.state.issues.is_empty() {
            self.state.selected_index = self.state.issues.len() - 1;
        }
    }

    /// Open the selected issue in detail view.
    pub fn open_selected(&mut self) {
        if self.state.issues.is_empty() {
            return;
        }

        self.state.screen = Screen::Detail;
        self.state.detail_scroll = 0;
        self.state.current_issue = None;
        self.state.reset_analysis();
    }

    /// Go back to list view.
    pub fn back_to_list(&mut self) {
        self.state.screen = Screen::List;
        self.state.current_issue = None;
        self.state.detail_scroll = 0;
        self.state.analysis_lines.clear();
    }

    /// Go back from analysis to detail view.
    pub fn back_to_detail(&mut self) {
        self.state.screen = Screen::Detail;
    }

    /// Open proposal screen.
    pub fn open_proposal(&mut self) {
        self.state.screen = Screen::Proposal;
        self.state.proposal_scroll = 0;
    }

    /// Go back from proposal to detail view.
    pub fn back_from_proposal(&mut self) {
        self.state.screen = Screen::Detail;
    }

    // === Scrolling ===

    pub fn scroll_detail(&mut self, delta: i32) {
        let new_scroll = self.state.detail_scroll as i32 + delta;
        self.state.detail_scroll = new_scroll.max(0) as usize;
    }

    pub fn scroll_analysis(&mut self, delta: i32) {
        let new_scroll = self.state.analysis_scroll as i32 + delta;
        self.state.analysis_scroll = new_scroll.max(0) as usize;
    }

    pub fn scroll_proposal(&mut self, delta: i32) {
        let new_scroll = self.state.proposal_scroll as i32 + delta;
        self.state.proposal_scroll = new_scroll.max(0) as usize;
    }

    // === Actions ===

    /// Get session path for interactive pi (escape hatch).
    pub async fn get_session_path(&self) -> Option<String> {
        let issue_id = self.state.selected_issue_id()?;

        match self.bg.client().get_session(issue_id).await {
            Ok(session) => session
                .analysis_session
                .map(|s| s.path)
                .or(session.implementation_session.map(|s| s.path)),
            Err(_) => None,
        }
    }

    /// Start analysis on current issue from list view (headless).
    pub async fn analyze_issue_from_list(&mut self) {
        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        match self.bg.client().analyze(&issue_id).await {
            Ok(_) => {
                self.start_refresh();
            }
            Err(e) => {
                self.state.error = Some(format!("Failed to start analysis: {}", e));
            }
        }
    }

    /// Start analysis on current issue (from detail view).
    pub async fn analyze_issue(&mut self) {
        if self.state.current_issue.is_none() || self.state.is_refreshing_detail {
            self.state.error = Some("Please wait for issue details to load".to_string());
            return;
        }

        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        // Switch to analysis screen
        self.state.screen = Screen::Analysis;
        self.state.reset_analysis();

        self.state.analysis_lines.push(ActivityLine {
            icon: "▶",
            text: "Starting analysis...".to_string(),
            style: ActivityStyle::Normal,
        });

        self.state.is_loading = true;
        match self.bg.client().analyze(&issue_id).await {
            Ok(_) => {
                self.start_analysis_stream(&issue_id);
                self.refresh_current_issue().await;
            }
            Err(e) => {
                self.state.error = Some(format!("Failed to start analysis: {}", e));
                self.state.analysis_lines.push(ActivityLine {
                    icon: "✗",
                    text: format!("Failed: {}", e),
                    style: ActivityStyle::Error,
                });
            }
        }
        self.state.is_loading = false;
    }

    /// Start the SSE stream for analysis events.
    fn start_analysis_stream(&mut self, issue_id: &str) {
        if self.state.is_streaming_analysis {
            debug!("Already streaming analysis, skipping");
            return;
        }

        self.state.is_streaming_analysis = true;
        self.bg.spawn_analysis_stream(issue_id);
    }

    /// Approve proposal on current issue.
    pub async fn approve_proposal(&mut self) {
        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        self.state.is_loading = true;
        if let Err(e) = self.bg.client().approve(&issue_id).await {
            self.state.error = Some(format!("Failed to approve: {}", e));
        }
        self.refresh_current_issue().await;
        self.state.is_loading = false;
    }

    /// Reject proposal on current issue.
    pub async fn reject_proposal(&mut self) {
        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        self.state.is_loading = true;
        if let Err(e) = self.bg.client().reject(&issue_id).await {
            self.state.error = Some(format!("Failed to reject: {}", e));
        }
        self.refresh_current_issue().await;
        self.state.is_loading = false;
    }

    /// Complete review on current issue.
    pub async fn complete_review(&mut self) {
        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        self.state.is_loading = true;
        if let Err(e) = self.bg.client().complete(&issue_id).await {
            self.state.error = Some(format!("Failed to complete: {}", e));
        }
        self.refresh_current_issue().await;
        self.state.is_loading = false;
    }

    /// Retry after error on current issue.
    pub async fn retry_error(&mut self) {
        let Some(issue_id) = self.state.selected_issue_id().map(|s| s.to_string()) else {
            return;
        };

        self.state.is_loading = true;
        if let Err(e) = self.bg.client().retry(&issue_id).await {
            self.state.error = Some(format!("Failed to retry: {}", e));
        }
        self.refresh_current_issue().await;
        self.state.is_loading = false;
    }
}
