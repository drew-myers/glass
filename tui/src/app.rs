//! Application state and logic.

use crate::api::{AnalysisEvent, ApiClient, Issue, IssueDetail, IssueState, ListIssuesResponse};
use futures_util::StreamExt;
use reqwest_eventsource::{Event, EventSource};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

/// Current screen being displayed.
#[derive(Debug, Clone, PartialEq)]
pub enum Screen {
    List,
    Detail,
    Analysis,
    Proposal,
}

/// A line in the analysis activity pane.
#[derive(Debug, Clone)]
pub struct ActivityLine {
    pub icon: &'static str,
    pub text: String,
    pub style: ActivityStyle,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ActivityStyle {
    Normal,
    Dimmed,
    Tool,
    Thinking,
    Error,
    Success,
}

/// Messages from background tasks.
pub enum BackgroundMessage {
    /// List refresh completed with result
    ListRefreshComplete(Result<ListIssuesResponse, String>),
    /// Detail refresh completed with result
    DetailRefreshComplete(Result<IssueDetail, String>),
    /// Analysis event received from SSE
    AnalysisEvent(AnalysisEvent),
    /// Analysis SSE stream ended (connected or error)
    AnalysisStreamEnded(Option<String>),
}

/// Main application state.
pub struct App {
    /// API client for server communication
    client: Arc<ApiClient>,

    /// Channel receiver for background task results
    bg_rx: mpsc::Receiver<BackgroundMessage>,

    /// Channel sender for background tasks (cloned into spawned tasks)
    bg_tx: mpsc::Sender<BackgroundMessage>,

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

    /// Loading state (for synchronous operations)
    pub is_loading: bool,

    /// Whether a background list refresh is in progress
    pub is_refreshing: bool,

    /// Whether a background detail refresh is in progress
    pub is_refreshing_detail: bool,

    /// Error message to display
    pub error: Option<String>,

    /// Flag to quit the app
    pub should_quit: bool,

    // === Analysis screen state ===
    /// Lines to display in the analysis screen
    pub analysis_lines: Vec<ActivityLine>,

    /// Scroll offset for the analysis pane
    pub analysis_scroll: usize,

    /// Whether we're currently streaming analysis events
    pub is_streaming_analysis: bool,

    /// Current text accumulator for streaming text deltas
    current_text_buffer: String,

    /// Terminal width for text wrapping (updated each frame)
    pub terminal_width: u16,

    /// Terminal height for page scrolling (updated each frame)
    pub terminal_height: u16,

    // === Proposal screen state ===
    /// Scroll offset for the proposal view
    pub proposal_scroll: usize,
}

impl App {
    pub fn new(server_url: String) -> Self {
        let (bg_tx, bg_rx) = mpsc::channel(64);
        Self {
            client: Arc::new(ApiClient::new(server_url)),
            bg_rx,
            bg_tx,
            screen: Screen::List,
            issues: Vec::new(),
            selected_index: 0,
            current_issue: None,
            detail_scroll: 0,
            is_loading: false,
            is_refreshing: false,
            is_refreshing_detail: false,
            error: None,
            should_quit: false,
            analysis_lines: Vec::new(),
            analysis_scroll: 0,
            is_streaming_analysis: false,
            current_text_buffer: String::new(),
            terminal_width: 80, // Default, updated each frame
            terminal_height: 24, // Default, updated each frame
            proposal_scroll: 0,
        }
    }

    /// Update terminal dimensions (call each frame before drawing).
    pub fn set_terminal_size(&mut self, width: u16, height: u16) {
        self.terminal_width = width;
        self.terminal_height = height;
    }

    /// Get half-page scroll amount (for Ctrl+D/U).
    pub fn half_page(&self) -> i32 {
        // Subtract space for header/footer, then halve
        (self.terminal_height.saturating_sub(6) / 2).max(1) as i32
    }

    /// Load cached issues from server (fast, synchronous).
    pub async fn load_cached(&mut self) {
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
    }

    /// Start a background refresh from Sentry.
    pub fn start_refresh(&mut self) {
        if self.is_refreshing {
            return; // Already refreshing
        }

        self.is_refreshing = true;
        self.error = None;

        let client = Arc::clone(&self.client);
        let tx = self.bg_tx.clone();

        tokio::spawn(async move {
            let result = client
                .refresh_issues()
                .await
                .map_err(|e| format!("Failed to refresh issues: {}", e));

            // Send result back (ignore error if receiver dropped)
            let _ = tx.send(BackgroundMessage::ListRefreshComplete(result)).await;
        });
    }

    /// Poll for background task completions. Call this from the main loop.
    pub fn poll_background(&mut self) {
        while let Ok(msg) = self.bg_rx.try_recv() {
            match msg {
                BackgroundMessage::ListRefreshComplete(result) => {
                    self.is_refreshing = false;
                    match result {
                        Ok(response) => {
                            self.issues = response.issues;
                            // Clamp selection to valid range
                            if !self.issues.is_empty() && self.selected_index >= self.issues.len() {
                                self.selected_index = self.issues.len() - 1;
                            }
                        }
                        Err(e) => {
                            self.error = Some(e);
                        }
                    }
                }
                BackgroundMessage::DetailRefreshComplete(result) => {
                    self.is_refreshing_detail = false;
                    match result {
                        Ok(detail) => {
                            self.current_issue = Some(detail);
                        }
                        Err(e) => {
                            self.error = Some(e);
                        }
                    }
                }
                BackgroundMessage::AnalysisEvent(event) => {
                    self.handle_analysis_event(event);
                }
                BackgroundMessage::AnalysisStreamEnded(error) => {
                    self.is_streaming_analysis = false;
                    if let Some(err) = error {
                        self.analysis_lines.push(ActivityLine {
                            icon: "✗",
                            text: format!("Stream error: {}", err),
                            style: ActivityStyle::Error,
                        });
                    }
                }
            }
        }
    }

    /// Handle an analysis event from the SSE stream.
    fn handle_analysis_event(&mut self, event: AnalysisEvent) {
        match event {
            AnalysisEvent::Backfill { events } => {
                // Process all backfill events
                for e in events {
                    self.handle_analysis_event(e);
                }
            }
            AnalysisEvent::Thinking => {
                self.analysis_lines.push(ActivityLine {
                    icon: "◐",
                    text: "Thinking...".to_string(),
                    style: ActivityStyle::Thinking,
                });
            }
            AnalysisEvent::TextDelta { delta } => {
                // Accumulate text
                self.current_text_buffer.push_str(&delta);

                // Flush periodically when we have complete lines or enough content
                // This gives a more real-time feel
                if self.current_text_buffer.contains('\n')
                    || self.current_text_buffer.len() > 200
                {
                    self.flush_text_buffer();
                }
            }
            AnalysisEvent::ToolStart { tool, args } => {
                // Flush any accumulated text first
                self.flush_text_buffer();

                let wrap_width = (self.terminal_width as usize).saturating_sub(6).max(40);

                // Format tool args - show full values, wrap if needed
                let args_str = if let Some(obj) = args.as_object() {
                    obj.iter()
                        .map(|(k, v)| {
                            let v_str = match v {
                                serde_json::Value::String(s) => s.clone(),
                                _ => v.to_string(),
                            };
                            format!("{}={}", k, v_str)
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                } else {
                    String::new()
                };

                let full_text = format!("{} {}", tool, args_str);

                // Word-wrap the tool call if it's long
                let wrapped = word_wrap(&full_text, wrap_width);
                for (i, line) in wrapped.into_iter().enumerate() {
                    self.analysis_lines.push(ActivityLine {
                        icon: if i == 0 { "🔧" } else { "  " },
                        text: line,
                        style: ActivityStyle::Tool,
                    });
                }
            }
            AnalysisEvent::ToolOutput { output } => {
                // Show tool output with wrapping
                let wrap_width = (self.terminal_width as usize).saturating_sub(6).max(40);
                if !output.trim().is_empty() {
                    for line in output.lines().take(5) {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }
                        for wrapped in word_wrap(trimmed, wrap_width) {
                            self.analysis_lines.push(ActivityLine {
                                icon: "  ",
                                text: wrapped,
                                style: ActivityStyle::Dimmed,
                            });
                        }
                    }
                }
            }
            AnalysisEvent::ToolEnd { tool: _, is_error } => {
                if is_error {
                    self.analysis_lines.push(ActivityLine {
                        icon: "  ",
                        text: "(error)".to_string(),
                        style: ActivityStyle::Error,
                    });
                }
            }
            AnalysisEvent::Complete { proposal } => {
                // Flush any accumulated text
                self.flush_text_buffer();

                self.analysis_lines.push(ActivityLine {
                    icon: "✓",
                    text: "Analysis complete".to_string(),
                    style: ActivityStyle::Success,
                });

                self.is_streaming_analysis = false;

                // Update the issue state with the proposal
                if let Some(ref mut issue) = self.current_issue {
                    if let IssueState::Analyzing { analysis_session_id } = &issue.state {
                        issue.state = IssueState::PendingApproval {
                            analysis_session_id: analysis_session_id.clone(),
                            proposal,
                        };
                    }
                }

                // Automatically transition to proposal screen
                self.screen = Screen::Proposal;
                self.proposal_scroll = 0;
            }
            AnalysisEvent::Error { message } => {
                self.flush_text_buffer();

                self.analysis_lines.push(ActivityLine {
                    icon: "✗",
                    text: message,
                    style: ActivityStyle::Error,
                });

                self.is_streaming_analysis = false;
            }
        }

        // Auto-scroll is handled in the UI based on actual pane height
    }

    /// Flush accumulated text buffer to analysis lines.
    fn flush_text_buffer(&mut self) {
        if !self.current_text_buffer.is_empty() {
            let text = self.current_text_buffer.trim();
            if !text.is_empty() {
                // Word-wrap based on terminal width (minus borders and icon space)
                let wrap_width = (self.terminal_width as usize).saturating_sub(6).max(40);
                let mut first = true;

                for line in text.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    // Word-wrap this line
                    for wrapped in word_wrap(trimmed, wrap_width) {
                        self.analysis_lines.push(ActivityLine {
                            icon: "  ",
                            text: wrapped,
                            style: ActivityStyle::Normal,
                        });
                    }
                }
            }
            self.current_text_buffer.clear();
        }
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

        // Reset analysis state
        self.analysis_lines.clear();
        self.analysis_scroll = 0;
        self.current_text_buffer.clear();

        // Note: actual fetch happens via refresh_current_issue
    }

    /// Go back to list view.
    pub fn back_to_list(&mut self) {
        self.screen = Screen::List;
        self.current_issue = None;
        self.detail_scroll = 0;
        self.analysis_lines.clear();
    }

    /// Go back from analysis to detail view.
    pub fn back_to_detail(&mut self) {
        self.screen = Screen::Detail;
        // Keep analysis_lines in case user wants to see them again
    }

    /// Scroll detail view.
    pub fn scroll_detail(&mut self, delta: i32) {
        let new_scroll = self.detail_scroll as i32 + delta;
        self.detail_scroll = new_scroll.max(0) as usize;
    }

    /// Scroll analysis pane.
    pub fn scroll_analysis(&mut self, delta: i32) {
        let new_scroll = self.analysis_scroll as i32 + delta;
        self.analysis_scroll = new_scroll.max(0) as usize;
    }

    /// Scroll proposal pane.
    pub fn scroll_proposal(&mut self, delta: i32) {
        let new_scroll = self.proposal_scroll as i32 + delta;
        self.proposal_scroll = new_scroll.max(0) as usize;
    }

    /// Open proposal screen (from detail view when in pending_approval state).
    pub fn open_proposal(&mut self) {
        self.screen = Screen::Proposal;
        self.proposal_scroll = 0;
    }

    /// Go back from proposal to detail view.
    pub fn back_from_proposal(&mut self) {
        self.screen = Screen::Detail;
    }

    /// Load cached issue detail from server (fast).
    pub async fn load_cached_detail(&mut self) {
        if self.issues.is_empty() {
            return;
        }

        let issue_id = &self.issues[self.selected_index].id;
        self.error = None;

        match self.client.get_issue(issue_id).await {
            Ok(detail) => {
                // If issue is in Analyzing state, connect to SSE stream
                if matches!(detail.state, IssueState::Analyzing { .. }) {
                    self.start_analysis_stream(&detail.id);
                }
                self.current_issue = Some(detail);
            }
            Err(e) => {
                self.error = Some(format!("Failed to fetch issue: {}", e));
            }
        }
    }

    /// Start a background refresh for the current issue from Sentry.
    pub fn start_detail_refresh(&mut self) {
        if self.is_refreshing_detail || self.issues.is_empty() {
            return;
        }

        let issue_id = self.issues[self.selected_index].id.clone();
        self.is_refreshing_detail = true;
        self.error = None;

        let client = Arc::clone(&self.client);
        let tx = self.bg_tx.clone();

        tokio::spawn(async move {
            let result = client
                .refresh_issue(&issue_id)
                .await
                .map_err(|e| format!("Failed to refresh issue: {}", e));

            let _ = tx.send(BackgroundMessage::DetailRefreshComplete(result)).await;
        });
    }

    /// Refresh current issue detail from server (for use after actions).
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

    /// Start analysis on current issue (from list view - headless, stays on list).
    pub async fn analyze_issue_from_list(&mut self) {
        if self.issues.is_empty() {
            return;
        }

        let issue_id = self.issues[self.selected_index].id.clone();
        
        // Just kick off the analysis - don't switch screens
        match self.client.analyze(&issue_id).await {
            Ok(_) => {
                // Refresh the list to show updated status
                self.start_refresh();
            }
            Err(e) => {
                self.error = Some(format!("Failed to start analysis: {}", e));
            }
        }
    }

    /// Start analysis on current issue.
    pub async fn analyze_issue(&mut self) {
        // Don't allow analysis until we have the full issue details
        if self.current_issue.is_none() || self.is_refreshing_detail {
            self.error = Some("Please wait for issue details to load".to_string());
            return;
        }

        if let Some(issue) = self.issues.get(self.selected_index) {
            let issue_id = issue.id.clone();

            // Switch to analysis screen
            self.screen = Screen::Analysis;
            self.analysis_lines.clear();
            self.analysis_scroll = 0;
            self.current_text_buffer.clear();

            self.analysis_lines.push(ActivityLine {
                icon: "▶",
                text: "Starting analysis...".to_string(),
                style: ActivityStyle::Normal,
            });

            self.is_loading = true;
            match self.client.analyze(&issue_id).await {
                Ok(_) => {
                    // Start SSE stream to receive events
                    self.start_analysis_stream(&issue_id);
                    self.refresh_current_issue().await;
                }
                Err(e) => {
                    self.error = Some(format!("Failed to start analysis: {}", e));
                    self.analysis_lines.push(ActivityLine {
                        icon: "✗",
                        text: format!("Failed: {}", e),
                        style: ActivityStyle::Error,
                    });
                }
            }
            self.is_loading = false;
        }
    }

    /// Start the SSE stream for analysis events.
    fn start_analysis_stream(&mut self, issue_id: &str) {
        if self.is_streaming_analysis {
            debug!("Already streaming analysis, skipping");
            return;
        }

        self.is_streaming_analysis = true;

        let url = self.client.events_url(issue_id);
        let tx = self.bg_tx.clone();

        info!(%url, "Starting SSE stream for analysis events");

        tokio::spawn(async move {
            let mut es = EventSource::get(&url);

            while let Some(event) = es.next().await {
                match event {
                    Ok(Event::Open) => {
                        info!("SSE connection opened");
                    }
                    Ok(Event::Message(message)) => {
                        debug!(data_len = message.data.len(), "Received SSE message");
                        // Log first 500 chars of data for debugging
                        if message.data.len() > 500 {
                            debug!(data_preview = %&message.data[..500], "SSE data preview");
                        } else {
                            debug!(data = %message.data, "SSE data");
                        }

                        // Parse the event data
                        match serde_json::from_str::<AnalysisEvent>(&message.data) {
                            Ok(event) => {
                                debug!(?event, "Parsed analysis event");
                                if tx.send(BackgroundMessage::AnalysisEvent(event)).await.is_err() {
                                    warn!("Failed to send event to channel, receiver dropped");
                                    break;
                                }
                            }
                            Err(e) => {
                                error!(%e, data = %message.data, "Failed to parse SSE event");
                                let _ = tx
                                    .send(BackgroundMessage::AnalysisStreamEnded(Some(format!(
                                        "Parse error: {}",
                                        e
                                    ))))
                                    .await;
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        // Only report actual errors, not normal stream end
                        let err_str = e.to_string();
                        let is_normal_end = err_str.contains("end of stream")
                            || err_str.contains("Stream ended")
                            || err_str.contains("EOF");
                        if !is_normal_end {
                            error!(%err_str, "SSE stream error");
                            let _ = tx
                                .send(BackgroundMessage::AnalysisStreamEnded(Some(err_str)))
                                .await;
                        } else {
                            info!("SSE stream ended normally");
                            let _ = tx.send(BackgroundMessage::AnalysisStreamEnded(None)).await;
                        }
                        break;
                    }
                }
            }

            info!("SSE stream task completed");
            let _ = tx.send(BackgroundMessage::AnalysisStreamEnded(None)).await;
        });
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

/// Truncate a string to max length with ellipsis.
fn truncate_str(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_len.saturating_sub(1)).collect();
        format!("{}…", truncated)
    }
}

/// Word-wrap a string to fit within a given width.
fn word_wrap(s: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current_line = String::new();

    for word in s.split_whitespace() {
        if current_line.is_empty() {
            // First word on the line
            if word.len() > width {
                // Word itself is too long, just add it (will be truncated by display)
                lines.push(word.to_string());
            } else {
                current_line = word.to_string();
            }
        } else if current_line.len() + 1 + word.len() <= width {
            // Word fits on current line
            current_line.push(' ');
            current_line.push_str(word);
        } else {
            // Word doesn't fit, start new line
            lines.push(current_line);
            if word.len() > width {
                lines.push(word.to_string());
                current_line = String::new();
            } else {
                current_line = word.to_string();
            }
        }
    }

    // Don't forget the last line
    if !current_line.is_empty() {
        lines.push(current_line);
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    lines
}
