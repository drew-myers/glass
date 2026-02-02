//! Analysis screen rendering.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::app::{ActivityStyle, App};

/// Draw the fullscreen analysis view.
pub fn draw_analysis(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Header
            Constraint::Min(1),    // Content
            Constraint::Length(1), // Footer
        ])
        .split(area);

    draw_header(f, app, chunks[0]);
    draw_content(f, app, chunks[1]);
    draw_footer(f, app, chunks[2]);
}

/// Draw the header with issue title.
fn draw_header(f: &mut Frame, app: &App, area: Rect) {
    let title = app
        .state
        .current_issue
        .as_ref()
        .and_then(|i| i.source.title.clone())
        .unwrap_or_else(|| "Analysis".to_string());

    let status_indicator = if app.state.is_streaming_analysis {
        Span::styled(" ◐ analyzing", Style::default().fg(Color::Yellow))
    } else {
        Span::styled(" ✓ complete", Style::default().fg(Color::Green))
    };

    let header = Paragraph::new(Line::from(vec![
        Span::raw(" "),
        Span::styled(&title, Style::default().add_modifier(Modifier::BOLD)),
        status_indicator,
    ]))
    .block(Block::default().borders(Borders::ALL).title(" Analysis "));

    f.render_widget(header, area);
}

/// Draw the analysis content.
fn draw_content(f: &mut Frame, app: &App, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    // Calculate visible height (area height minus borders)
    let visible_height = area.height.saturating_sub(2) as usize;

    // Auto-scroll: if we have more lines than visible, show the last N lines
    let total_lines = app.state.analysis_lines.len();
    let skip = if app.state.analysis_scroll > 0 {
        // Manual scroll position
        app.state.analysis_scroll
    } else if total_lines > visible_height {
        // Auto-scroll to bottom
        total_lines - visible_height
    } else {
        0
    };

    for activity in app.state.analysis_lines.iter().skip(skip) {
        let (icon_color, text_color) = match activity.style {
            ActivityStyle::Normal => (Color::White, Color::White),
            ActivityStyle::Dimmed => (Color::DarkGray, Color::DarkGray),
            ActivityStyle::Tool => (Color::Cyan, Color::Cyan),
            ActivityStyle::Thinking => (Color::Yellow, Color::Yellow),
            ActivityStyle::Error => (Color::Red, Color::Red),
            ActivityStyle::Success => (Color::Green, Color::Green),
        };

        lines.push(Line::from(vec![
            Span::styled(format!("{} ", activity.icon), Style::default().fg(icon_color)),
            Span::styled(&activity.text, Style::default().fg(text_color)),
        ]));
    }

    // Add cursor if streaming
    if app.state.is_streaming_analysis {
        lines.push(Line::from(Span::styled(
            "  ▊",
            Style::default().fg(Color::Yellow),
        )));
    }

    let paragraph = Paragraph::new(lines)
        .block(Block::default().borders(Borders::ALL))
        .wrap(Wrap { trim: false });

    f.render_widget(paragraph, area);
}

/// Draw the footer with keybindings.
fn draw_footer(f: &mut Frame, app: &App, area: Rect) {
    let keys = if app.state.is_streaming_analysis {
        vec![
            ("q/Esc", "back"),
            ("↑↓/C-d/u", "scroll"),
        ]
    } else {
        vec![
            ("q/Esc", "back to detail"),
            ("↑↓/C-d/u", "scroll"),
        ]
    };

    let spans: Vec<Span> = keys
        .iter()
        .flat_map(|(key, desc)| {
            vec![
                Span::styled(format!(" [{}]", key), Style::default().fg(Color::Cyan)),
                Span::styled(format!(" {} ", desc), Style::default().fg(Color::DarkGray)),
            ]
        })
        .collect();

    let footer = Paragraph::new(Line::from(spans));
    f.render_widget(footer, area);
}
