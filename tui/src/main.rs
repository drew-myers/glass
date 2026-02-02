//! Glass TUI - Terminal interface for issue orchestration
//!
//! Connects to the Glass server and provides a keyboard-driven interface
//! for managing Sentry issues and agent workflows.

mod api;
mod app;
mod escape;
mod logging;
mod screens;
mod server;
mod ui;
mod util;

use anyhow::Result;
use clap::Parser;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;
use std::path::Path;
use tracing::info;

use app::{App, Screen};
use screens::Action;
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
    // Initialize logging first (keep guard alive for entire program)
    let _log_guard = logging::init()?;

    let args = Args::parse();
    info!(?args, "Starting Glass TUI");

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
                eprintln!(
                    "You can start it manually with: glass-server {}",
                    project_path_str
                );
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

        // Update terminal size for text wrapping
        let size = terminal.size()?;
        app.set_terminal_size(size.width, size.height);

        // Draw UI
        terminal.draw(|f| ui::draw(f, app))?;

        // Handle input (with timeout for async polling)
        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                // Only handle key press events (not release)
                if key.kind != KeyEventKind::Press {
                    continue;
                }

                // Get action from input handler
                let action = screens::handle_input(app, key);

                // Execute the action
                execute_action(terminal, app, action).await?;
            }
        }

        // Check if app wants to quit
        if app.state.should_quit {
            return Ok(());
        }
    }
}

/// Execute an action returned by the input handler.
async fn execute_action(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App,
    action: Action,
) -> Result<()> {
    match action {
        Action::None => {}
        Action::Quit => app.state.should_quit = true,

        // Navigation
        Action::MoveSelection(delta) => app.move_selection(delta),
        Action::JumpToTop => app.jump_to_top(),
        Action::JumpToBottom => app.jump_to_bottom(),
        Action::ScrollDetail(delta) => app.scroll_detail(delta),
        Action::ScrollAnalysis(delta) => app.scroll_analysis(delta),
        Action::ScrollProposal(delta) => app.scroll_proposal(delta),

        // Screen transitions
        Action::OpenSelected => {
            app.open_selected();
            app.load_cached_detail().await;
            app.start_detail_refresh();
        }
        Action::BackToList => app.back_to_list(),
        Action::BackToDetail => {
            app.back_to_detail();
            app.refresh_current_issue().await;
        }
        Action::BackFromProposal => app.back_from_proposal(),
        Action::OpenProposal => app.open_proposal(),
        Action::OpenAnalysis => app.state.screen = Screen::Analysis,

        // Data operations
        Action::Refresh => app.start_refresh(),
        Action::RefreshDetail => app.start_detail_refresh(),

        // Agent actions
        Action::AnalyzeFromList => app.analyze_issue_from_list().await,
        Action::AnalyzeFromDetail => app.analyze_issue().await,
        Action::ApproveProposal => {
            app.approve_proposal().await;
            app.back_from_proposal();
        }
        Action::RejectProposal => {
            app.reject_proposal().await;
            app.back_from_proposal();
        }
        Action::CompleteReview => app.complete_review().await,
        Action::RetryError => app.retry_error().await,

        // Interactive Pi escape hatch
        Action::InteractivePi => {
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
    }

    Ok(())
}
