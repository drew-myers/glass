//! Escape hatch to interactive pi session.

use anyhow::Result;
use std::process::Command;

/// Run pi interactively with the given session file.
///
/// This takes over the terminal completely until pi exits.
pub fn run_pi_interactive(session_path: &str) -> Result<()> {
    let status = Command::new("pi")
        .arg("--session")
        .arg(session_path)
        .status()?;

    if !status.success() {
        eprintln!("pi exited with status: {}", status);
    }

    Ok(())
}
