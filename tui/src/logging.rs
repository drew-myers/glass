//! Logging setup for Glass TUI.
//!
//! Logs to `$XDG_STATE_HOME/glass/tui.log` (typically `~/.local/state/glass/tui.log`).

use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// Initialize logging to file.
///
/// Returns a guard that must be kept alive for the duration of the program
/// to ensure logs are flushed.
pub fn init() -> Result<WorkerGuard> {
    let log_dir = get_log_dir()?;
    fs::create_dir_all(&log_dir)?;

    let log_file = log_dir.join("tui.log");

    // Create file appender (will append to existing file)
    let file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)?;

    let (non_blocking, guard) = tracing_appender::non_blocking(file);

    // Set up subscriber with file output
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("glass_tui=debug,reqwest_eventsource=debug"));

    tracing_subscriber::registry()
        .with(
            fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false)
                .with_target(true)
                .with_thread_ids(false)
                .with_file(true)
                .with_line_number(true),
        )
        .with(filter)
        .init();

    tracing::info!("Glass TUI logging initialized to {:?}", log_file);

    Ok(guard)
}

/// Get the log directory path.
fn get_log_dir() -> Result<PathBuf> {
    // Use XDG state directory (for logs and other state)
    // Falls back to ~/.local/state if XDG_STATE_HOME is not set
    let state_dir = dirs::state_dir()
        .or_else(|| {
            dirs::home_dir().map(|h| h.join(".local").join("state"))
        })
        .ok_or_else(|| anyhow::anyhow!("Could not determine state directory"))?;

    Ok(state_dir.join("glass"))
}

/// Get the path to the log file (for display purposes).
pub fn log_file_path() -> Option<PathBuf> {
    get_log_dir().ok().map(|d| d.join("tui.log"))
}
