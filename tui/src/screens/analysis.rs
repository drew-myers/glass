//! Analysis screen input handling.

use crossterm::event::{KeyCode, KeyEvent};
use super::Action;

/// Handle input on the analysis screen.
pub fn handle_analysis_input(key: KeyEvent) -> Action {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => Action::BackToDetail,
        KeyCode::Char('j') | KeyCode::Down => Action::ScrollAnalysis(1),
        KeyCode::Char('k') | KeyCode::Up => Action::ScrollAnalysis(-1),
        _ => Action::None,
    }
}
