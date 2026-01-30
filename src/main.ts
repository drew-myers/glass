/**
 * @fileoverview Glass TUI application entry point.
 *
 * Initializes the Effect runtime and launches the TUI application.
 */

import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { withRenderer } from "./lib/effect-opentui.js";
import { runApp } from "./ui/app.js";

/**
 * Main program that runs the Glass TUI.
 *
 * Sets up the renderer via Effect Scope, runs the app,
 * and ensures proper cleanup on exit.
 */
const program = withRenderer(runApp);

// Run the application
BunRuntime.runMain(program);
