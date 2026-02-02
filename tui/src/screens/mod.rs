//! Screen-specific input handling.
//!
//! Each screen module defines its keybindings and returns an Action.

mod list;
mod detail;
mod analysis;
mod proposal;

pub use list::handle_list_input;
pub use detail::handle_detail_input;
pub use analysis::handle_analysis_input;
pub use proposal::handle_proposal_input;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use crate::app::{App, Screen};

/// Actions that can be performed by the application.
#[derive(Debug, Clone)]
pub enum Action {
    /// No action needed
    None,
    /// Quit the application
    Quit,
    /// Navigation
    MoveSelection(i32),
    JumpToTop,
    JumpToBottom,
    ScrollDetail(i32),
    ScrollAnalysis(i32),
    ScrollProposal(i32),
    /// Screen transitions
    OpenSelected,
    BackToList,
    BackToDetail,
    BackFromProposal,
    OpenProposal,
    OpenAnalysis,
    /// Data operations (async)
    Refresh,
    RefreshDetail,
    /// Agent actions (async)
    AnalyzeFromList,
    AnalyzeFromDetail,
    ApproveProposal,
    RejectProposal,
    CompleteReview,
    RetryError,
    /// Special
    InteractivePi,
}

/// Route input to the appropriate screen handler.
pub fn handle_input(app: &App, key: KeyEvent) -> Action {
    // Handle Ctrl+D/U for half-page scrolling on all screens
    if key.modifiers.contains(KeyModifiers::CONTROL) {
        match (app.screen(), key.code) {
            (Screen::List, KeyCode::Char('d')) => return Action::MoveSelection(app.half_page()),
            (Screen::List, KeyCode::Char('u')) => return Action::MoveSelection(-app.half_page()),
            (Screen::Detail, KeyCode::Char('d')) => return Action::ScrollDetail(app.half_page()),
            (Screen::Detail, KeyCode::Char('u')) => return Action::ScrollDetail(-app.half_page()),
            (Screen::Analysis, KeyCode::Char('d')) => return Action::ScrollAnalysis(app.half_page()),
            (Screen::Analysis, KeyCode::Char('u')) => return Action::ScrollAnalysis(-app.half_page()),
            (Screen::Proposal, KeyCode::Char('d')) => return Action::ScrollProposal(app.half_page()),
            (Screen::Proposal, KeyCode::Char('u')) => return Action::ScrollProposal(-app.half_page()),
            _ => {}
        }
    }

    // Delegate to screen-specific handler
    match app.screen() {
        Screen::List => handle_list_input(key),
        Screen::Detail => handle_detail_input(app, key),
        Screen::Analysis => handle_analysis_input(key),
        Screen::Proposal => handle_proposal_input(key),
    }
}
