//! Pure application state - data only, no logic.

use crate::api::{Issue, IssueDetail};

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

/// Pure application state container.
#[derive(Debug)]
pub struct AppState {
    // === Navigation ===
    /// Current screen
    pub screen: Screen,

    // === List screen state ===
    /// List of issues
    pub issues: Vec<Issue>,
    /// Currently selected index in list
    pub selected_index: usize,

    // === Detail screen state ===
    /// Currently viewed issue detail
    pub current_issue: Option<IssueDetail>,
    /// Scroll offset for detail view
    pub detail_scroll: usize,

    // === Analysis screen state ===
    /// Lines to display in the analysis screen
    pub analysis_lines: Vec<ActivityLine>,
    /// Scroll offset for the analysis pane
    pub analysis_scroll: usize,
    /// Whether we're currently streaming analysis events
    pub is_streaming_analysis: bool,
    /// Current text accumulator for streaming text deltas
    pub current_text_buffer: String,

    // === Proposal screen state ===
    /// Scroll offset for the proposal view
    pub proposal_scroll: usize,

    // === Loading state ===
    /// Loading state (for synchronous operations)
    pub is_loading: bool,
    /// Whether a background list refresh is in progress
    pub is_refreshing: bool,
    /// Whether a background detail refresh is in progress
    pub is_refreshing_detail: bool,

    // === Error state ===
    /// Error message to display
    pub error: Option<String>,

    // === Terminal info ===
    /// Terminal width for text wrapping
    pub terminal_width: u16,
    /// Terminal height for page scrolling
    pub terminal_height: u16,

    // === Control ===
    /// Flag to quit the app
    pub should_quit: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            screen: Screen::List,
            issues: Vec::new(),
            selected_index: 0,
            current_issue: None,
            detail_scroll: 0,
            analysis_lines: Vec::new(),
            analysis_scroll: 0,
            is_streaming_analysis: false,
            current_text_buffer: String::new(),
            proposal_scroll: 0,
            is_loading: false,
            is_refreshing: false,
            is_refreshing_detail: false,
            error: None,
            terminal_width: 80,
            terminal_height: 24,
            should_quit: false,
        }
    }
}

impl AppState {
    /// Update terminal dimensions.
    pub fn set_terminal_size(&mut self, width: u16, height: u16) {
        self.terminal_width = width;
        self.terminal_height = height;
    }

    /// Get half-page scroll amount (for Ctrl+D/U).
    pub fn half_page(&self) -> i32 {
        (self.terminal_height.saturating_sub(6) / 2).max(1) as i32
    }

    /// Clamp selected index to valid range.
    pub fn clamp_selection(&mut self) {
        if !self.issues.is_empty() && self.selected_index >= self.issues.len() {
            self.selected_index = self.issues.len() - 1;
        }
    }

    /// Get currently selected issue ID, if any.
    pub fn selected_issue_id(&self) -> Option<&str> {
        self.issues.get(self.selected_index).map(|i| i.id.as_str())
    }

    /// Clear analysis state for a fresh analysis.
    pub fn reset_analysis(&mut self) {
        self.analysis_lines.clear();
        self.analysis_scroll = 0;
        self.current_text_buffer.clear();
    }
}
