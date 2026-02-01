//! List screen rendering.

use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState},
    Frame,
};

use crate::app::App;

/// Draw the issue list screen.
pub fn draw_list(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app
        .issues
        .iter()
        .map(|issue| {
            let (icon, color) = status_icon_and_color(&issue.status);

            let spans = vec![
                Span::styled(format!(" {} ", icon), Style::default().fg(color)),
                Span::styled(
                    format!("{:8} ", issue.status.to_uppercase()),
                    Style::default().fg(color),
                ),
                Span::raw(truncate(&issue.title, 50)),
                Span::styled(
                    format!("  {:>6}", issue.event_count),
                    Style::default().fg(Color::DarkGray),
                ),
                Span::styled(
                    format!("  {}", format_relative_time(&issue.last_seen)),
                    Style::default().fg(Color::DarkGray),
                ),
            ];

            ListItem::new(Line::from(spans))
        })
        .collect();

    let title = if app.is_loading {
        " Glass ◐ "
    } else {
        " Glass "
    };

    let list = List::new(items)
        .block(Block::default().title(title).borders(Borders::ALL))
        .highlight_style(
            Style::default()
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▶ ");

    let mut state = ListState::default();
    state.select(Some(app.selected_index));

    f.render_stateful_widget(list, area, &mut state);

    // Show error if any
    if let Some(error) = &app.error {
        let error_area = Rect {
            x: area.x + 2,
            y: area.y + area.height.saturating_sub(2),
            width: area.width.saturating_sub(4),
            height: 1,
        };
        let error_text = ratatui::widgets::Paragraph::new(error.as_str())
            .style(Style::default().fg(Color::Red));
        f.render_widget(error_text, error_area);
    }
}

/// Get status icon and color.
fn status_icon_and_color(status: &str) -> (&'static str, Color) {
    match status {
        "pending" => ("○", Color::DarkGray),
        "analyzing" => ("◐", Color::Yellow),
        "pending_approval" => ("◉", Color::Cyan),
        "in_progress" => ("◐", Color::Blue),
        "pending_review" => ("●", Color::Green),
        "error" => ("✗", Color::Red),
        _ => ("?", Color::White),
    }
}

/// Truncate string to max length.
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}…", &s[..max_len - 1])
    }
}

/// Format ISO timestamp as relative time.
fn format_relative_time(iso: &str) -> String {
    // Simple implementation - in production use chrono
    // For now just show the date portion
    if iso.len() >= 10 {
        iso[..10].to_string()
    } else {
        iso.to_string()
    }
}
