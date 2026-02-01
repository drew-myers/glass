//! Application state and logic.

use crate::api::{ApiClient, Issue, IssueDetail};

/// Current screen being displayed.
#[derive(Debug, Clone, PartialEq)]
pub enum Screen {
    List,
    Detail,
}

/// Main application state.
pub struct App {
    /// API client for server communication
    client: ApiClient,

    /// Current screen
    pub screen: Screen,

    /// List of issues
    pub issues: Vec<Issue>,

    /// Currently selected index in list
    pub selected_index: usize,

    /// Currently viewed issue detail (when on detail screen)
    pub current_issue: Option<IssueDetail>,

    /// Scroll offset for detail view
    pub detail_scroll: usize,

    /// Loading state
    pub is_loading: bool,

    /// Error message to display
    pub error: Option<String>,

    /// Flag to quit the app
    pub should_quit: bool,
}

impl App {
    pub fn new(server_url: String) -> Self {
        Self {
            client: ApiClient::new(server_url),
            screen: Screen::List,
            issues: Vec::new(),
            selected_index: 0,
            current_issue: None,
            detail_scroll: 0,
            is_loading: false,
            error: None,
            should_quit: false,
        }
    }

    /// Refresh issues from server.
    pub async fn refresh(&mut self) {
        self.is_loading = true;
        self.error = None;

        match self.client.list_issues().await {
            Ok(response) => {
                self.issues = response.issues;
                // Clamp selection to valid range
                if !self.issues.is_empty() && self.selected_index >= self.issues.len() {
                    self.selected_index = self.issues.len() - 1;
                }
            }
            Err(e) => {
                self.error = Some(format!("Failed to fetch issues: {}", e));
            }
        }

        self.is_loading = false;
    }

    /// Move selection by delta (positive = down, negative = up).
    pub fn move_selection(&mut self, delta: i32) {
        if self.issues.is_empty() {
            return;
        }

        let new_index = self.selected_index as i32 + delta;
        self.selected_index = new_index.clamp(0, self.issues.len() as i32 - 1) as usize;
    }

    /// Jump to top of list.
    pub fn jump_to_top(&mut self) {
        self.selected_index = 0;
    }

    /// Jump to bottom of list.
    pub fn jump_to_bottom(&mut self) {
        if !self.issues.is_empty() {
            self.selected_index = self.issues.len() - 1;
        }
    }

    /// Open the selected issue in detail view.
    pub fn open_selected(&mut self) {
        if self.issues.is_empty() {
            return;
        }

        // We'll fetch detail in the background
        self.screen = Screen::Detail;
        self.detail_scroll = 0;
        self.current_issue = None;

        // Note: actual fetch happens via refresh_current_issue
    }

    /// Go back to list view.
    pub fn back_to_list(&mut self) {
        self.screen = Screen::List;
        self.current_issue = None;
        self.detail_scroll = 0;
    }

    /// Scroll detail view.
    pub fn scroll_detail(&mut self, delta: i32) {
        let new_scroll = self.detail_scroll as i32 + delta;
        self.detail_scroll = new_scroll.max(0) as usize;
    }

    /// Refresh current issue detail from server.
    pub async fn refresh_current_issue(&mut self) {
        if self.issues.is_empty() {
            return;
        }

        let issue_id = &self.issues[self.selected_index].id;
        self.is_loading = true;

        match self.client.get_issue(issue_id).await {
            Ok(detail) => {
                self.current_issue = Some(detail);
            }
            Err(e) => {
                self.error = Some(format!("Failed to fetch issue: {}", e));
            }
        }

        self.is_loading = false;
    }

    /// Get session path for interactive pi (escape hatch).
    pub async fn get_session_path(&self) -> Option<String> {
        let issue_id = &self.issues.get(self.selected_index)?.id;

        match self.client.get_session(issue_id).await {
            Ok(session) => session
                .analysis_session
                .map(|s| s.path)
                .or(session.implementation_session.map(|s| s.path)),
            Err(_) => None,
        }
    }

    /// Start analysis on current issue.
    pub async fn analyze_issue(&mut self) {
        if let Some(issue) = self.issues.get(self.selected_index) {
            self.is_loading = true;
            if let Err(e) = self.client.analyze(&issue.id).await {
                self.error = Some(format!("Failed to start analysis: {}", e));
            }
            self.refresh_current_issue().await;
            self.is_loading = false;
        }
    }

    /// Approve proposal on current issue.
    pub async fn approve_proposal(&mut self) {
        if let Some(issue) = self.issues.get(self.selected_index) {
            self.is_loading = true;
            if let Err(e) = self.client.approve(&issue.id).await {
                self.error = Some(format!("Failed to approve: {}", e));
            }
            self.refresh_current_issue().await;
            self.is_loading = false;
        }
    }

    /// Reject proposal on current issue.
    pub async fn reject_proposal(&mut self) {
        if let Some(issue) = self.issues.get(self.selected_index) {
            self.is_loading = true;
            if let Err(e) = self.client.reject(&issue.id).await {
                self.error = Some(format!("Failed to reject: {}", e));
            }
            self.refresh_current_issue().await;
            self.is_loading = false;
        }
    }

    /// Complete review on current issue.
    pub async fn complete_review(&mut self) {
        if let Some(issue) = self.issues.get(self.selected_index) {
            self.is_loading = true;
            if let Err(e) = self.client.complete(&issue.id).await {
                self.error = Some(format!("Failed to complete: {}", e));
            }
            self.refresh_current_issue().await;
            self.is_loading = false;
        }
    }

    /// Retry after error on current issue.
    pub async fn retry_error(&mut self) {
        if let Some(issue) = self.issues.get(self.selected_index) {
            self.is_loading = true;
            if let Err(e) = self.client.retry(&issue.id).await {
                self.error = Some(format!("Failed to retry: {}", e));
            }
            self.refresh_current_issue().await;
            self.is_loading = false;
        }
    }
}
