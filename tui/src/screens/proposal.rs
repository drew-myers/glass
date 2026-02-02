//! Proposal screen input handling.

use crossterm::event::{KeyCode, KeyEvent};
use super::Action;

/// Handle input on the proposal screen.
pub fn handle_proposal_input(key: KeyEvent) -> Action {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => Action::BackFromProposal,
        KeyCode::Char('j') | KeyCode::Down => Action::ScrollProposal(1),
        KeyCode::Char('k') | KeyCode::Up => Action::ScrollProposal(-1),
        KeyCode::Char('A') => Action::ApproveProposal,
        KeyCode::Char('x') => Action::RejectProposal,
        _ => Action::None,
    }
}
