//! UI rendering with Ratatui.

mod analysis;
mod detail;
mod list;
mod proposal;

use ratatui::{
    layout::{Constraint, Direction, Layout},
    Frame,
};

use crate::app::{App, Screen};

/// Main draw function - routes to appropriate screen.
pub fn draw(f: &mut Frame, app: &App) {
    // Fullscreen views (have their own footer)
    match app.state.screen {
        Screen::Analysis => {
            analysis::draw_analysis(f, app, f.area());
            return;
        }
        Screen::Proposal => {
            proposal::draw_proposal(f, app, f.area());
            return;
        }
        _ => {}
    }

    // Create layout with main area and status bar
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),    // Main content
            Constraint::Length(1), // Status/action bar
        ])
        .split(f.area());

    // Draw main content based on current screen
    match app.state.screen {
        Screen::List => list::draw_list(f, app, chunks[0]),
        Screen::Detail => detail::draw_detail(f, app, chunks[0]),
        Screen::Analysis | Screen::Proposal => unreachable!(), // Handled above
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

    let keybinds = match app.state.screen {
        Screen::List => vec![
            ("↑↓/jk/C-d/u", "navigate"),
            ("Enter", "open"),
            ("a", "analyze"),
            ("r", "refresh"),
            ("q", "quit"),
        ],
        Screen::Detail => {
            let mut binds = vec![
                ("↑↓/jk/C-d/u", "scroll"),
                ("r", "refresh"),
                ("q/Esc", "back"),
            ];

            // Add state-specific keybinds based on current issue (only if loaded and not refreshing)
            let details_ready = app.state.current_issue.is_some() && !app.state.is_refreshing_detail;
            if let Some(issue) = &app.state.current_issue {
                match &issue.state {
                    crate::api::IssueState::Pending => {
                        if details_ready {
                            binds.push(("a", "analyze"));
                        }
                    }
                    crate::api::IssueState::Analyzing { .. } => {
                        if details_ready {
                            binds.push(("a", "re-analyze"));
                        }
                        binds.push(("Enter", "view analysis"));
                        binds.push(("i", "interactive"));
                    }
                    crate::api::IssueState::PendingApproval { .. } => {
                        if details_ready {
                            binds.push(("a", "re-analyze"));
                        }
                        binds.push(("Enter", "view proposal"));
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
                        if details_ready {
                            binds.push(("a", "re-analyze"));
                        }
                        binds.push(("R", "retry"));
                    }
                }
            }

            binds
        }
        Screen::Analysis | Screen::Proposal => {
            // These screens have their own footer, this shouldn't be called
            vec![]
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
