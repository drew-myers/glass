//! Detail screen rendering.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::api::{IssueDetail, IssueState};
use crate::app::App;

/// Draw the issue detail screen.
pub fn draw_detail(f: &mut Frame, app: &App, area: Rect) {
    // Header with title and status
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Header
            Constraint::Min(1),    // Content
        ])
        .split(area);

    draw_header(f, app, chunks[0]);

    if let Some(issue) = &app.current_issue {
        draw_content(f, issue, app.detail_scroll, chunks[1]);
    } else if app.is_loading {
        let loading = Paragraph::new("Loading...")
            .style(Style::default().fg(Color::DarkGray))
            .block(Block::default().borders(Borders::ALL));
        f.render_widget(loading, chunks[1]);
    } else {
        let empty = Paragraph::new("No issue selected")
            .style(Style::default().fg(Color::DarkGray))
            .block(Block::default().borders(Borders::ALL));
        f.render_widget(empty, chunks[1]);
    }
}

/// Draw the header with issue title and status.
fn draw_header(f: &mut Frame, app: &App, area: Rect) {
    let (title, status) = if let Some(issue) = &app.current_issue {
        let title = issue
            .source
            .title
            .clone()
            .unwrap_or_else(|| "Unknown".to_string());
        let status = format_status(&issue.state);
        (title, status)
    } else if let Some(issue) = app.issues.get(app.selected_index) {
        (issue.title.clone(), issue.status.clone())
    } else {
        ("No issue".to_string(), "".to_string())
    };

    let (icon, color) = status_icon_and_color(&status);

    let header_text = vec![Line::from(vec![
        Span::raw(" "),
        Span::styled(title, Style::default().add_modifier(Modifier::BOLD)),
        Span::raw("  "),
        Span::styled(format!("{} {}", icon, status.to_uppercase()), Style::default().fg(color)),
    ])];

    let header = Paragraph::new(header_text)
        .block(Block::default().borders(Borders::ALL));

    f.render_widget(header, area);
}

/// Draw the main content area.
fn draw_content(f: &mut Frame, issue: &IssueDetail, scroll: usize, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    // Source info section
    lines.push(Line::from(Span::styled(
        "── Source ──",
        Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
    )));
    lines.push(Line::default());

    if let Some(culprit) = &issue.source.culprit {
        lines.push(Line::from(vec![
            Span::styled("Culprit: ", Style::default().fg(Color::DarkGray)),
            Span::raw(culprit),
        ]));
    }

    if let Some(env) = &issue.source.environment {
        lines.push(Line::from(vec![
            Span::styled("Environment: ", Style::default().fg(Color::DarkGray)),
            Span::raw(env),
        ]));
    }

    if let Some(release) = &issue.source.release {
        lines.push(Line::from(vec![
            Span::styled("Release: ", Style::default().fg(Color::DarkGray)),
            Span::raw(release),
        ]));
    }

    lines.push(Line::from(vec![
        Span::styled("Events: ", Style::default().fg(Color::DarkGray)),
        Span::raw(format!("{}", issue.source.event_count.unwrap_or(0))),
        Span::raw(" │ "),
        Span::styled("Users: ", Style::default().fg(Color::DarkGray)),
        Span::raw(format!("{}", issue.source.user_count.unwrap_or(0))),
    ]));

    lines.push(Line::default());

    // Exception/stacktrace section
    if let Some(exceptions) = &issue.source.exceptions {
        lines.push(Line::from(Span::styled(
            "── Exception ──",
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::default());

        for exc in exceptions {
            lines.push(Line::from(vec![
                Span::styled(&exc.error_type, Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)),
                Span::raw(": "),
                Span::raw(exc.value.clone().unwrap_or_default()),
            ]));

            if let Some(stacktrace) = &exc.stacktrace {
                lines.push(Line::default());
                for frame in &stacktrace.frames {
                    let filename = frame.filename.as_deref().unwrap_or("?");
                    let function = frame.function.as_deref().unwrap_or("?");
                    let lineno = frame.lineno.map(|n| n.to_string()).unwrap_or_default();

                    lines.push(Line::from(vec![
                        Span::styled("  at ", Style::default().fg(Color::DarkGray)),
                        Span::styled(function, Style::default().fg(Color::Yellow)),
                        Span::styled(" (", Style::default().fg(Color::DarkGray)),
                        Span::raw(filename),
                        Span::styled(":", Style::default().fg(Color::DarkGray)),
                        Span::raw(lineno),
                        Span::styled(")", Style::default().fg(Color::DarkGray)),
                    ]));
                }
            }
        }
        lines.push(Line::default());
    }

    // Proposal section (if in pending_approval state)
    if let IssueState::PendingApproval { proposal, .. } = &issue.state {
        lines.push(Line::from(Span::styled(
            "── Proposal ──",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::default());

        // Simple markdown-ish rendering
        for line in proposal.lines() {
            let styled_line = if line.starts_with("## ") {
                Line::from(Span::styled(
                    &line[3..],
                    Style::default().add_modifier(Modifier::BOLD),
                ))
            } else if line.starts_with("```") {
                Line::from(Span::styled(line, Style::default().fg(Color::DarkGray)))
            } else if line.starts_with("- ") || line.starts_with("+ ") {
                let color = if line.starts_with("+") {
                    Color::Green
                } else {
                    Color::Red
                };
                Line::from(Span::styled(line, Style::default().fg(color)))
            } else {
                Line::from(line)
            };
            lines.push(styled_line);
        }
    }

    // Error section (if in error state)
    if let IssueState::Error { error, .. } = &issue.state {
        lines.push(Line::from(Span::styled(
            "── Error ──",
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::default());
        lines.push(Line::from(Span::styled(error, Style::default().fg(Color::Red))));
    }

    // Worktree info (if in progress or review)
    match &issue.state {
        IssueState::InProgress { worktree_path, worktree_branch, .. }
        | IssueState::PendingReview { worktree_path, worktree_branch, .. } => {
            lines.push(Line::from(Span::styled(
                "── Worktree ──",
                Style::default().fg(Color::Blue).add_modifier(Modifier::BOLD),
            )));
            lines.push(Line::default());
            lines.push(Line::from(vec![
                Span::styled("Path: ", Style::default().fg(Color::DarkGray)),
                Span::raw(worktree_path),
            ]));
            lines.push(Line::from(vec![
                Span::styled("Branch: ", Style::default().fg(Color::DarkGray)),
                Span::raw(worktree_branch),
            ]));
        }
        _ => {}
    }

    let text = Text::from(lines);
    let paragraph = Paragraph::new(text)
        .block(Block::default().borders(Borders::ALL))
        .wrap(Wrap { trim: false })
        .scroll((scroll as u16, 0));

    f.render_widget(paragraph, area);
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

/// Format state to status string.
fn format_status(state: &IssueState) -> String {
    match state {
        IssueState::Pending => "pending".to_string(),
        IssueState::Analyzing { .. } => "analyzing".to_string(),
        IssueState::PendingApproval { .. } => "pending_approval".to_string(),
        IssueState::InProgress { .. } => "in_progress".to_string(),
        IssueState::PendingReview { .. } => "pending_review".to_string(),
        IssueState::Error { .. } => "error".to_string(),
    }
}
