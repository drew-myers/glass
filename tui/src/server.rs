//! Server lifecycle management.
//!
//! Handles finding, starting, and stopping the glass-server process.

use anyhow::{anyhow, Result};
use std::env;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

const SERVER_PORT: u16 = 7420;
const SERVER_BINARY: &str = "glass-server";

/// Manages the glass-server process lifecycle.
pub struct ServerProcess {
    child: Child,
}

impl ServerProcess {
    /// Start the server, or return None if it's already running.
    pub async fn start(project_path: &str) -> Result<Option<Self>> {
        // Check if server is already running
        if is_server_running().await {
            return Ok(None);
        }

        // Find the server binary
        let server_path = find_server_binary()?;

        // Start the server
        let child = Command::new(&server_path)
            .arg(project_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| anyhow!("Failed to start server at {:?}: {}", server_path, e))?;

        let server = ServerProcess { child };

        // Wait for server to be ready
        server.wait_for_ready().await?;

        Ok(Some(server))
    }

    /// Wait for the server to respond to health checks.
    async fn wait_for_ready(&self) -> Result<()> {
        let client = reqwest::Client::new();
        let url = format!("http://localhost:{}/health", SERVER_PORT);

        for _ in 0..50 {
            // 5 seconds max
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    return Ok(());
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        Err(anyhow!("Server failed to start within 5 seconds"))
    }
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        // Kill the server when TUI exits
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Check if a server is already running on the expected port.
async fn is_server_running() -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .unwrap();

    let url = format!("http://localhost:{}/health", SERVER_PORT);

    client
        .get(&url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Find the server binary in various locations.
fn find_server_binary() -> Result<PathBuf> {
    // 1. Same directory as the TUI binary
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let server_path = exe_dir.join(SERVER_BINARY);
            if server_path.exists() {
                return Ok(server_path);
            }
        }
    }

    // 2. Check PATH
    if let Ok(path) = which::which(SERVER_BINARY) {
        return Ok(path);
    }

    // 3. Common install locations
    let home = env::var("HOME").unwrap_or_default();
    let common_paths = [
        format!("{}/.local/bin/{}", home, SERVER_BINARY),
        format!("/usr/local/bin/{}", SERVER_BINARY),
        format!("/opt/homebrew/bin/{}", SERVER_BINARY),
    ];

    for path in common_paths {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    Err(anyhow!(
        "Could not find '{}'. Install it or place it in the same directory as the TUI.",
        SERVER_BINARY
    ))
}
