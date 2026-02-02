//! List screen input handling.

use crossterm::event::{KeyCode, KeyEvent};
use super::Action;

/// Handle input on the list screen.
pub fn handle_list_input(key: KeyEvent) -> Action {
    match key.code {
        KeyCode::Char('q') => Action::Quit,
        KeyCode::Char('j') | KeyCode::Down => Action::MoveSelection(1),
        KeyCode::Char('k') | KeyCode::Up => Action::MoveSelection(-1),
        KeyCode::Char('g') => Action::JumpToTop,
        KeyCode::Char('G') => Action::JumpToBottom,
        KeyCode::Char('r') => Action::Refresh,
        KeyCode::Char('a') => Action::AnalyzeFromList,
        KeyCode::Enter => Action::OpenSelected,
        _ => Action::None,
    }
}
