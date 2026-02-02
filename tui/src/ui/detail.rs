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

    // Show spinner if refreshing
    let refresh_indicator = if app.is_refreshing_detail || app.is_loading {
        " ◐"
    } else {
        ""
    };

    let header_text = vec![Line::from(vec![
        Span::raw(" "),
        Span::styled(title, Style::default().add_modifier(Modifier::BOLD)),
        Span::raw("  "),
        Span::styled(format!("{} {}", icon, status.to_uppercase()), Style::default().fg(color)),
        Span::styled(refresh_indicator, Style::default().fg(Color::Yellow)),
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

    // Request section
    if let Some(request) = &issue.source.request {
        lines.push(Line::from(Span::styled(
            "── Request ──",
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::default());

        lines.push(Line::from(vec![
            Span::styled(&request.method, Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
            Span::raw(" "),
            Span::raw(&request.url),
        ]));

        if let Some(query) = &request.query {
            if !query.is_empty() {
                for (key, value) in query {
                    lines.push(Line::from(vec![
                        Span::styled("  ?", Style::default().fg(Color::DarkGray)),
                        Span::raw(format!("{}={}", key, truncate_str(value, 50))),
                    ]));
                }
            }
        }

        if let Some(data) = &request.data {
            lines.push(Line::from(vec![
                Span::styled("  Body: ", Style::default().fg(Color::DarkGray)),
                Span::raw(truncate_str(&format!("{}", data), 60)),
            ]));
        }

        lines.push(Line::default());
    }

    // User section
    if let Some(user) = &issue.source.user {
        lines.push(Line::from(Span::styled(
            "── User ──",
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::default());

        let mut user_parts: Vec<Span> = Vec::new();
        if let Some(email) = &user.email {
            user_parts.push(Span::raw(email.clone()));
        } else if let Some(id) = &user.id {
            user_parts.push(Span::styled("ID: ", Style::default().fg(Color::DarkGray)));
            user_parts.push(Span::raw(truncate_str(id, 30)));
        }
        if let Some(ip) = &user.ip_address {
            if !user_parts.is_empty() {
                user_parts.push(Span::raw(" │ "));
            }
            user_parts.push(Span::styled("IP: ", Style::default().fg(Color::DarkGray)));
            user_parts.push(Span::raw(ip.clone()));
        }
        if let Some(geo) = &user.geo {
            if !user_parts.is_empty() {
                user_parts.push(Span::raw(" │ "));
            }
            let location = [
                geo.city.as_deref(),
                geo.region.as_deref(),
                geo.country_code.as_deref(),
            ]
            .iter()
            .filter_map(|&s| s)
            .collect::<Vec<_>>()
            .join(", ");
            if !location.is_empty() {
                user_parts.push(Span::raw(location));
            }
        }
        if !user_parts.is_empty() {
            lines.push(Line::from(user_parts));
        }

        lines.push(Line::default());
    }

    // Context section (browser, device, runtime)
    if let Some(contexts) = &issue.source.contexts {
        lines.push(Line::from(Span::styled(
            "── Context ──",
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::default());

        let mut ctx_parts: Vec<String> = Vec::new();

        if let Some(browser) = &contexts.browser {
            let browser_str = match (&browser.name, &browser.version) {
                (Some(n), Some(v)) => format!("{} {}", n, v),
                (Some(n), None) => n.clone(),
                _ => String::new(),
            };
            if !browser_str.is_empty() {
                ctx_parts.push(browser_str);
            }
        }

        if let Some(os) = &contexts.os {
            let os_str = match (&os.name, &os.version) {
                (Some(n), Some(v)) => format!("{} {}", n, v),
                (Some(n), None) => n.clone(),
                _ => String::new(),
            };
            if !os_str.is_empty() {
                ctx_parts.push(os_str);
            }
        }

        if let Some(device) = &contexts.device {
            let device_str = [
                device.brand.as_deref(),
                device.model.as_deref(),
            ]
            .iter()
            .filter_map(|&s| s)
            .collect::<Vec<_>>()
            .join(" ");
            if !device_str.is_empty() {
                ctx_parts.push(device_str);
            }
        }

        if let Some(runtime) = &contexts.runtime {
            let runtime_str = match (&runtime.name, &runtime.version) {
                (Some(n), Some(v)) => format!("{} {}", n, v),
                (Some(n), None) => n.clone(),
                _ => String::new(),
            };
            if !runtime_str.is_empty() {
                ctx_parts.push(runtime_str);
            }
        }

        if !ctx_parts.is_empty() {
            lines.push(Line::from(ctx_parts.join(" │ ")));
        }

        lines.push(Line::default());
    }

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

    // Breadcrumbs section
    if let Some(breadcrumbs) = &issue.source.breadcrumbs {
        if !breadcrumbs.is_empty() {
            lines.push(Line::from(Span::styled(
                "── Breadcrumbs ──",
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            )));
            lines.push(Line::default());

            // Show last N breadcrumbs (most recent at bottom)
            let max_crumbs = 15;
            let start = breadcrumbs.len().saturating_sub(max_crumbs);
            for crumb in &breadcrumbs[start..] {
                let category = crumb.category.as_deref().unwrap_or("?");
                let timestamp = crumb.timestamp.as_deref()
                    .and_then(|ts| ts.split('T').last())
                    .and_then(|t| t.split('.').next())
                    .unwrap_or("");

                let color = match category {
                    "http" | "fetch" | "httplib" => Color::Blue,
                    "console" => Color::Yellow,
                    "navigation" | "ui.click" => Color::Magenta,
                    "error" | "exception" => Color::Red,
                    "query" => Color::Cyan,
                    "redis" => Color::Green,
                    _ => Color::DarkGray,
                };

                // Build message - prefer data fields for http, fall back to message
                let display_msg = if let Some(data) = &crumb.data {
                    if category == "httplib" || category == "http" {
                        let method = data.http_method.as_deref().unwrap_or("");
                        let url = data.url.as_deref().unwrap_or("");
                        let status = data.status_code.map(|s| format!(" → {}", s)).unwrap_or_default();
                        format!("{} {}{}", method, truncate_str(url, 40), status)
                    } else {
                        crumb.message.as_deref().unwrap_or("").to_string()
                    }
                } else {
                    crumb.message.as_deref().unwrap_or("").to_string()
                };

                lines.push(Line::from(vec![
                    Span::styled(format!("{:>8} ", timestamp), Style::default().fg(Color::DarkGray)),
                    Span::styled(format!("{:<12} ", category), Style::default().fg(color)),
                    Span::raw(truncate_str(&display_msg, 55)),
                ]));
            }
            lines.push(Line::default());
        }
    }

    // Tags section
    if let Some(tags) = &issue.source.tags {
        if !tags.is_empty() {
            lines.push(Line::from(Span::styled(
                "── Tags ──",
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            )));
            lines.push(Line::default());

            let mut tag_spans: Vec<Span> = Vec::new();
            for (key, value) in tags {
                if !tag_spans.is_empty() {
                    tag_spans.push(Span::raw("  "));
                }
                tag_spans.push(Span::styled(format!("{}:", key), Style::default().fg(Color::DarkGray)));
                tag_spans.push(Span::raw(value));
            }
            lines.push(Line::from(tag_spans));
            lines.push(Line::default());
        }
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

/// Truncate a string to max length.
fn truncate_str(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_len.saturating_sub(1)).collect();
        format!("{}…", truncated)
    }
}
