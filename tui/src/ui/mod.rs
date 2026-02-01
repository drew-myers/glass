//! UI rendering with Ratatui.

mod list;
mod detail;

use ratatui::{
    layout::{Constraint, Direction, Layout},
    Frame,
};

use crate::app::{App, Screen};

/// Main draw function - routes to appropriate screen.
pub fn draw(f: &mut Frame, app: &App) {
    // Create layout with main area and status bar
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),    // Main content
            Constraint::Length(1), // Status/action bar
        ])
        .split(f.area());

    // Draw main content based on current screen
    match app.screen {
        Screen::List => list::draw_list(f, app, chunks[0]),
        Screen::Detail => detail::draw_detail(f, app, chunks[0]),
    }

    // Draw action bar
    draw_action_bar(f, app, chunks[1]);
}

/// Draw the action bar at the bottom.
fn draw_action_bar(f: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    use ratatui::{
        style::{Color, Style},
        text::{Line, Span},
        widgets::Paragraph,
    };

    let keybinds = match app.screen {
        Screen::List => vec![
            ("↑↓/jk", "navigate"),
            ("Enter", "open"),
            ("r", "refresh"),
            ("q", "quit"),
        ],
        Screen::Detail => {
            let mut binds = vec![
                ("↑↓/jk", "scroll"),
                ("r", "refresh"),
                ("q/Esc", "back"),
            ];

            // Add state-specific keybinds based on current issue
            if let Some(issue) = &app.current_issue {
                match &issue.state {
                    crate::api::IssueState::Pending => {
                        binds.push(("a", "analyze"));
                    }
                    crate::api::IssueState::PendingApproval { .. } => {
                        binds.push(("A", "approve"));
                        binds.push(("x", "reject"));
                        binds.push(("i", "interactive"));
                    }
                    crate::api::IssueState::InProgress { .. } => {
                        binds.push(("i", "interactive"));
                    }
                    crate::api::IssueState::PendingReview { .. } => {
                        binds.push(("d", "done"));
                        binds.push(("i", "interactive"));
                    }
                    crate::api::IssueState::Error { .. } => {
                        binds.push(("R", "retry"));
                    }
                    _ => {}
                }
            }

            binds
        }
    };

    let spans: Vec<Span> = keybinds
        .iter()
        .flat_map(|(key, desc)| {
            vec![
                Span::styled(format!("[{}]", key), Style::default().fg(Color::Cyan)),
                Span::raw(format!(" {} ", desc)),
            ]
        })
        .collect();

    let line = Line::from(spans);
    let paragraph = Paragraph::new(line).style(Style::default().bg(Color::DarkGray));

    f.render_widget(paragraph, area);
}
