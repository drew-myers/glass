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
    // Calculate available width for title column
    // Layout: " ▶ " (4) + "○ " (2) + "STATUS   " (9) + title + "  " (2) + events (6) + "  " (2) + date (10) + padding
    // Border takes 2 chars total
    let fixed_width = 4 + 2 + 9 + 2 + 6 + 2 + 10 + 2; // = 37
    let title_width = (area.width as usize).saturating_sub(fixed_width).max(20);

    let items: Vec<ListItem> = app
        .state
        .issues
        .iter()
        .map(|issue| {
            let (icon, color, label) = status_icon_and_color(&issue.status);
            let title = pad_or_truncate(&issue.title, title_width);

            let spans = vec![
                Span::styled(format!("{} ", icon), Style::default().fg(color)),
                Span::styled(
                    format!("{:9}", label),
                    Style::default().fg(color),
                ),
                Span::raw(title),
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

    let title = if app.state.is_loading || app.state.is_refreshing {
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

    let mut list_state = ListState::default();
    list_state.select(Some(app.state.selected_index));

    f.render_stateful_widget(list, area, &mut list_state);

    // Show error if any
    if let Some(error) = &app.state.error {
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

/// Get status icon, color, and abbreviated label.
fn status_icon_and_color(status: &str) -> (&'static str, Color, &'static str) {
    match status {
        "pending" => ("○", Color::DarkGray, "PENDING"),
        "analyzing" => ("◐", Color::Yellow, "ANALYZE"),
        "pending_approval" => ("◉", Color::Cyan, "APPROVAL"),
        "in_progress" => ("◐", Color::Blue, "WORKING"),
        "pending_review" => ("●", Color::Green, "REVIEW"),
        "error" => ("✗", Color::Red, "ERROR"),
        _ => ("?", Color::White, "UNKNOWN"),
    }
}

/// Pad or truncate string to exact length.
fn pad_or_truncate(s: &str, len: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= len {
        // Pad with spaces
        format!("{:<width$}", s, width = len)
    } else {
        // Truncate and add ellipsis
        let truncated: String = s.chars().take(len.saturating_sub(1)).collect();
        format!("{}…", truncated)
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
