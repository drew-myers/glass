//! Glass TUI - Terminal interface for issue orchestration
//!
//! Connects to the Glass server and provides a keyboard-driven interface
//! for managing Sentry issues and agent workflows.

mod api;
mod app;
mod escape;
mod server;
mod ui;

use anyhow::Result;
use clap::Parser;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io::{self, Write};
use std::path::Path;

use app::{App, Screen};
use server::ServerProcess;

/// Glass TUI - Issue orchestration interface
#[derive(Parser, Debug)]
#[command(name = "glass")]
#[command(about = "Terminal UI for Glass issue orchestration")]
struct Args {
    /// Server URL (if not specified, will start server automatically)
    #[arg(short, long, default_value = "http://localhost:7420")]
    server: String,

    /// Project path
    #[arg(default_value = ".")]
    project: String,

    /// Don't automatically start the server
    #[arg(long)]
    no_server: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Resolve project path to absolute
    let project_path = Path::new(&args.project)
        .canonicalize()
        .unwrap_or_else(|_| Path::new(&args.project).to_path_buf());
    let project_path_str = project_path.to_string_lossy().to_string();

    // Start server if needed (keep handle alive to maintain server process)
    let _server = if args.no_server {
        None
    } else {
        match ServerProcess::start(&project_path_str).await {
            Ok(server) => server,
            Err(e) => {
                eprintln!("Failed to start server: {}", e);
                eprintln!("You can start it manually with: glass-server {}", project_path_str);
                return Err(e);
            }
        }
    };

    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app state
    let mut app = App::new(args.server);

    // Initial data fetch: load cached first (fast), then refresh from Sentry in background
    app.load_cached().await;
    app.start_refresh();

    // Main loop
    let res = run_app(&mut terminal, &mut app).await;

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        eprintln!("Error: {err:?}");
    }

    Ok(())
}

async fn run_app(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App,
) -> Result<()> {
    loop {
        // Poll for background task completions
        app.poll_background();

        // Draw UI
        terminal.draw(|f| ui::draw(f, app))?;

        // Handle input (with timeout for async polling)
        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                // Only handle key press events (not release)
                if key.kind != KeyEventKind::Press {
                    continue;
                }

                match app.screen {
                    Screen::List => match key.code {
                        KeyCode::Char('q') => return Ok(()),
                        KeyCode::Char('j') | KeyCode::Down => app.move_selection(1),
                        KeyCode::Char('k') | KeyCode::Up => app.move_selection(-1),
                        KeyCode::Char('g') => app.jump_to_top(),
                        KeyCode::Char('G') => app.jump_to_bottom(),
                        KeyCode::Char('r') => app.start_refresh(),
                        KeyCode::Enter => {
                            app.open_selected();
                            app.load_cached_detail().await;
                            app.start_detail_refresh();
                        }
                        _ => {}
                    },
                    Screen::Detail => match key.code {
                        KeyCode::Char('q') | KeyCode::Esc => app.back_to_list(),
                        KeyCode::Char('j') | KeyCode::Down => app.scroll_detail(1),
                        KeyCode::Char('k') | KeyCode::Up => app.scroll_detail(-1),
                        KeyCode::Char('r') => app.start_detail_refresh(),
                        KeyCode::Char('i') => {
                            // Escape hatch to interactive pi
                            if let Some(session_path) = app.get_session_path().await {
                                // Restore terminal before exec
                                disable_raw_mode()?;
                                execute!(
                                    terminal.backend_mut(),
                                    LeaveAlternateScreen,
                                    DisableMouseCapture
                                )?;
                                terminal.show_cursor()?;

                                // Run pi interactively
                                escape::run_pi_interactive(&session_path)?;

                                // Restore TUI
                                enable_raw_mode()?;
                                execute!(
                                    terminal.backend_mut(),
                                    EnterAlternateScreen,
                                    EnableMouseCapture
                                )?;

                                // Refresh state after returning
                                app.refresh_current_issue().await;
                            }
                        }
                        KeyCode::Char('a') => app.analyze_issue().await,
                        KeyCode::Char('A') => app.approve_proposal().await,
                        KeyCode::Char('x') => app.reject_proposal().await,
                        KeyCode::Char('d') => app.complete_review().await,
                        KeyCode::Char('R') => app.retry_error().await,
                        _ => {}
                    },
                }
            }
        }

        // Check if app wants to quit
        if app.should_quit {
            return Ok(());
        }
    }
}
