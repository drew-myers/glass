//! Proposal screen rendering.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::api::IssueState;
use crate::app::App;

/// Draw the fullscreen proposal view.
pub fn draw_proposal(f: &mut Frame, app: &App, area: Rect) {
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
        .current_issue
        .as_ref()
        .and_then(|i| i.source.title.clone())
        .unwrap_or_else(|| "Proposal".to_string());

    let header = Paragraph::new(Line::from(vec![
        Span::raw(" "),
        Span::styled(&title, Style::default().add_modifier(Modifier::BOLD)),
        Span::styled(" ◉ pending approval", Style::default().fg(Color::Cyan)),
    ]))
    .block(Block::default().borders(Borders::ALL).title(" Proposal "));

    f.render_widget(header, area);
}

/// Draw the proposal content.
fn draw_content(f: &mut Frame, app: &App, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    // Get proposal text from issue state
    let proposal_text = app.current_issue.as_ref().and_then(|issue| {
        if let IssueState::PendingApproval { proposal, .. } = &issue.state {
            Some(proposal.as_str())
        } else {
            None
        }
    });

    if let Some(proposal) = proposal_text {
        // Render with basic markdown-style formatting
        for line in proposal.lines() {
            let styled_line = if line.starts_with("## ") {
                Line::from(Span::styled(
                    &line[3..],
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ))
            } else if line.starts_with("# ") {
                Line::from(Span::styled(
                    &line[2..],
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ))
            } else if line.starts_with("### ") {
                Line::from(Span::styled(
                    &line[4..],
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ))
            } else if line.starts_with("```") {
                Line::from(Span::styled(line, Style::default().fg(Color::DarkGray)))
            } else if line.starts_with("- ") {
                Line::from(vec![
                    Span::styled("  • ", Style::default().fg(Color::DarkGray)),
                    Span::raw(&line[2..]),
                ])
            } else if line.starts_with("+ ") {
                Line::from(Span::styled(line, Style::default().fg(Color::Green)))
            } else if line.starts_with("> ") {
                Line::from(Span::styled(
                    line,
                    Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC),
                ))
            } else if line.trim().is_empty() {
                Line::default()
            } else {
                Line::from(line)
            };
            lines.push(styled_line);
        }
    } else {
        lines.push(Line::from(Span::styled(
            "No proposal available",
            Style::default().fg(Color::DarkGray),
        )));
    }

    let paragraph = Paragraph::new(lines)
        .block(Block::default().borders(Borders::ALL))
        .wrap(Wrap { trim: false })
        .scroll((app.proposal_scroll as u16, 0));

    f.render_widget(paragraph, area);
}

/// Draw the footer with keybindings.
fn draw_footer(f: &mut Frame, _app: &App, area: Rect) {
    let keys = vec![
        ("q/Esc", "back"),
        ("↑↓/C-d/u", "scroll"),
        ("A", "approve"),
        ("x", "reject"),
    ];

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
