//! Analysis event handling - processes SSE events into display lines.

use crate::api::{AnalysisEvent, IssueState};
use crate::app::state::{ActivityLine, ActivityStyle, AppState, Screen};
use crate::util::word_wrap;

/// Handle an analysis event from the SSE stream.
pub fn handle_analysis_event(state: &mut AppState, event: AnalysisEvent) {
    match event {
        AnalysisEvent::Backfill { events } => {
            for e in events {
                handle_analysis_event(state, e);
            }
        }
        AnalysisEvent::Thinking => {
            state.analysis_lines.push(ActivityLine {
                icon: "◐",
                text: "Thinking...".to_string(),
                style: ActivityStyle::Thinking,
            });
        }
        AnalysisEvent::TextDelta { delta } => {
            state.current_text_buffer.push_str(&delta);

            // Flush periodically for real-time feel
            if state.current_text_buffer.contains('\n')
                || state.current_text_buffer.len() > 200
            {
                flush_text_buffer(state);
            }
        }
        AnalysisEvent::ToolStart { tool, args } => {
            flush_text_buffer(state);

            let wrap_width = (state.terminal_width as usize).saturating_sub(6).max(40);

            let args_str = if let Some(obj) = args.as_object() {
                obj.iter()
                    .map(|(k, v)| {
                        let v_str = match v {
                            serde_json::Value::String(s) => s.clone(),
                            _ => v.to_string(),
                        };
                        format!("{}={}", k, v_str)
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
            } else {
                String::new()
            };

            let full_text = format!("{} {}", tool, args_str);

            let wrapped = word_wrap(&full_text, wrap_width);
            for (i, line) in wrapped.into_iter().enumerate() {
                state.analysis_lines.push(ActivityLine {
                    icon: if i == 0 { "🔧" } else { "  " },
                    text: line,
                    style: ActivityStyle::Tool,
                });
            }
        }
        AnalysisEvent::ToolOutput { output } => {
            let wrap_width = (state.terminal_width as usize).saturating_sub(6).max(40);
            if !output.trim().is_empty() {
                for line in output.lines().take(5) {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    for wrapped in word_wrap(trimmed, wrap_width) {
                        state.analysis_lines.push(ActivityLine {
                            icon: "  ",
                            text: wrapped,
                            style: ActivityStyle::Dimmed,
                        });
                    }
                }
            }
        }
        AnalysisEvent::ToolEnd { tool: _, is_error } => {
            if is_error {
                state.analysis_lines.push(ActivityLine {
                    icon: "  ",
                    text: "(error)".to_string(),
                    style: ActivityStyle::Error,
                });
            }
        }
        AnalysisEvent::Complete { proposal } => {
            flush_text_buffer(state);

            state.analysis_lines.push(ActivityLine {
                icon: "✓",
                text: "Analysis complete".to_string(),
                style: ActivityStyle::Success,
            });

            state.is_streaming_analysis = false;

            // Update the issue state with the proposal
            if let Some(ref mut issue) = state.current_issue {
                if let IssueState::Analyzing { analysis_session_id } = &issue.state {
                    issue.state = IssueState::PendingApproval {
                        analysis_session_id: analysis_session_id.clone(),
                        proposal,
                    };
                }
            }

            // Automatically transition to proposal screen
            state.screen = Screen::Proposal;
            state.proposal_scroll = 0;
        }
        AnalysisEvent::Error { message } => {
            flush_text_buffer(state);

            state.analysis_lines.push(ActivityLine {
                icon: "✗",
                text: message,
                style: ActivityStyle::Error,
            });

            state.is_streaming_analysis = false;
        }
    }
}

/// Flush accumulated text buffer to analysis lines.
pub fn flush_text_buffer(state: &mut AppState) {
    if state.current_text_buffer.is_empty() {
        return;
    }

    let text = state.current_text_buffer.trim();
    if !text.is_empty() {
        let wrap_width = (state.terminal_width as usize).saturating_sub(6).max(40);

        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            for wrapped in word_wrap(trimmed, wrap_width) {
                state.analysis_lines.push(ActivityLine {
                    icon: "  ",
                    text: wrapped,
                    style: ActivityStyle::Normal,
                });
            }
        }
    }
    state.current_text_buffer.clear();
}
