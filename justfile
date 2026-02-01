# Glass - Issue Orchestration System
# Run `just` to see available commands

# Default: show help
default:
    @just --list

# === Development ===

# Run the server
server:
    cd server && bun run dev

# Run the TUI (connects to server at localhost:7420)
tui:
    cd tui && cargo run

# Run both server and TUI (server in background)
dev:
    #!/usr/bin/env bash
    set -e
    
    # Start server in tmux
    tmux new-session -d -s glass-server "cd {{justfile_directory()}}/server && bun run dev"
    echo "Server started in tmux session 'glass-server'"
    
    # Wait for server to be ready
    echo "Waiting for server..."
    for i in {1..30}; do
        if curl -s http://localhost:7420/health > /dev/null 2>&1; then
            echo "Server ready!"
            break
        fi
        sleep 0.2
    done
    
    # Run TUI in foreground
    cd tui && cargo run
    
    # Cleanup: kill server when TUI exits
    tmux kill-session -t glass-server 2>/dev/null || true
    echo "Server stopped"

# Stop the background server
stop:
    tmux kill-session -t glass-server 2>/dev/null || echo "No server running"

# === Building ===

# Build the server (compiled binary)
build-server:
    cd server && bun build --compile src/main.ts --outfile dist/glass-server

# Build the TUI (release mode)
build-tui:
    cd tui && cargo build --release

# Build everything
build: build-server build-tui
    @echo "Build complete"
    @echo ""
    @echo "Binaries:"
    @ls -lh server/dist/glass-server tui/target/release/glass-tui

# Create distribution package
dist: build
    #!/usr/bin/env bash
    set -e
    mkdir -p dist
    cp server/dist/glass-server dist/
    cp tui/target/release/glass-tui dist/glass
    echo ""
    echo "Distribution package:"
    ls -lh dist/
    echo ""
    echo "Total size:"
    du -ch dist/* | tail -1

# === Testing ===

# Run server tests
test-server:
    cd server && bun run test

# Run TUI tests
test-tui:
    cd tui && cargo test

# Run all tests
test: test-server test-tui

# === Code Quality ===

# Type check server
check-server:
    cd server && bun run typecheck

# Check TUI compiles
check-tui:
    cd tui && cargo check

# Check everything
check: check-server check-tui

# Lint server
lint-server:
    cd server && bun run lint

# Lint TUI
lint-tui:
    cd tui && cargo clippy

# Lint everything
lint: lint-server lint-tui

# Format server code
fmt-server:
    cd server && bun run format

# Format TUI code
fmt-tui:
    cd tui && cargo fmt

# Format everything
fmt: fmt-server fmt-tui

# === Utilities ===

# Install dependencies
install:
    cd server && bun install
    cd tui && cargo fetch

# Clean build artifacts
clean:
    cd server && rm -rf node_modules dist
    cd tui && cargo clean
    rm -rf dist
