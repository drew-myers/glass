//! Detail screen input handling.

use crossterm::event::{KeyCode, KeyEvent};
use crate::api::IssueState;
use crate::app::App;
use super::Action;

/// Handle input on the detail screen.
pub fn handle_detail_input(app: &App, key: KeyEvent) -> Action {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => Action::BackToList,
        KeyCode::Char('j') | KeyCode::Down => Action::ScrollDetail(1),
        KeyCode::Char('k') | KeyCode::Up => Action::ScrollDetail(-1),
        KeyCode::Char('r') => Action::RefreshDetail,
        KeyCode::Char('i') => Action::InteractivePi,
        KeyCode::Enter => handle_enter(app),
        KeyCode::Char('a') => Action::AnalyzeFromDetail,
        KeyCode::Char('d') => Action::CompleteReview,
        KeyCode::Char('R') => Action::RetryError,
        _ => Action::None,
    }
}

/// Handle Enter key based on current issue state.
fn handle_enter(app: &App) -> Action {
    if let Some(issue) = &app.state.current_issue {
        match &issue.state {
            IssueState::PendingApproval { .. } => Action::OpenProposal,
            IssueState::Analyzing { .. } => Action::OpenAnalysis,
            _ => Action::None,
        }
    } else {
        Action::None
    }
}
