/**
 * Spike: Headless Pi execution + escape hatch to interactive mode
 *
 * Tests two scenarios:
 * 1. Headless: Run pi programmatically, wait for completion, get result
 * 2. Escape hatch: Shell out to pi CLI for interactive session
 */

import { getModel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  readOnlyTools,
} from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";

// ============================================================================
// Scenario 1: Headless execution
// ============================================================================

async function runHeadless(prompt: string): Promise<string> {
  console.log("\n=== HEADLESS MODE ===");
  console.log(`Prompt: ${prompt}\n`);

  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);

  const model = getModel("anthropic", "claude-sonnet-4-20250514");
  if (!model) throw new Error("Model not found");

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    tools: readOnlyTools,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
    }),
  });

  // Collect the response
  let response = "";

  session.subscribe((event) => {
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        // In headless mode, we might want to show progress or just collect
        process.stdout.write(event.assistantMessageEvent.delta);
        response += event.assistantMessageEvent.delta;
      }
    }
    if (event.type === "tool_execution_start") {
      console.log(`\n[Tool: ${event.toolName}]`);
    }
    if (event.type === "agent_end") {
      console.log("\n[Agent finished]");
    }
  });

  // Run the prompt and wait for completion
  await session.prompt(prompt);

  // Clean up
  session.dispose();

  return response;
}

// ============================================================================
// Scenario 2: Escape hatch - shell out to pi CLI
// ============================================================================

async function runInteractive(sessionFile?: string): Promise<void> {
  console.log("\n=== INTERACTIVE MODE (escape hatch) ===");
  console.log("Shelling out to pi CLI...\n");

  return new Promise((resolve, reject) => {
    const args = sessionFile ? ["--session", sessionFile] : [];

    const child = spawn("pi", args, {
      stdio: "inherit", // Pi takes over the terminal
      cwd: process.cwd(),
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn pi: ${err.message}`));
    });

    child.on("close", (code) => {
      console.log(`\nPi exited with code ${code}`);
      resolve();
    });
  });
}

// ============================================================================
// Scenario 3: Headless with persistent session (for later escape hatch)
// ============================================================================

async function runHeadlessWithSession(
  prompt: string
): Promise<{ response: string; sessionFile: string }> {
  console.log("\n=== HEADLESS MODE (with persistent session) ===");
  console.log(`Prompt: ${prompt}\n`);

  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);

  const model = getModel("anthropic", "claude-sonnet-4-20250514");
  if (!model) throw new Error("Model not found");

  // Create a new persistent session
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    tools: readOnlyTools,
    sessionManager: SessionManager.create(process.cwd()),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
    }),
  });

  const sessionFile = session.sessionFile;
  if (!sessionFile) {
    throw new Error("Expected persistent session but got in-memory");
  }

  console.log(`Session file: ${sessionFile}\n`);

  let response = "";

  session.subscribe((event) => {
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
        response += event.assistantMessageEvent.delta;
      }
    }
    if (event.type === "tool_execution_start") {
      console.log(`\n[Tool: ${event.toolName}]`);
    }
  });

  await session.prompt(prompt);
  session.dispose();

  return { response, sessionFile };
}

// ============================================================================
// Main: Demo both scenarios
// ============================================================================

async function main() {
  const scenario = process.argv[2] || "headless";

  switch (scenario) {
    case "headless": {
      // Simple headless execution
      const result = await runHeadless(
        "List the files in the current directory and tell me what this project is about. Be brief."
      );
      console.log("\n--- Final Result ---");
      console.log(result.slice(0, 500) + (result.length > 500 ? "..." : ""));
      break;
    }

    case "interactive": {
      // Just shell out to pi
      await runInteractive();
      break;
    }

    case "hybrid": {
      // Run headless first, then offer escape hatch
      const { response, sessionFile } = await runHeadlessWithSession(
        "What files are in src/? Give a brief summary."
      );

      console.log("\n--- Headless Complete ---");
      console.log(`Response length: ${response.length} chars`);
      console.log(`Session saved to: ${sessionFile}`);

      // Ask user if they want to continue interactively
      console.log("\nWant to continue this session interactively? (y/n)");

      const answer = await new Promise<string>((resolve) => {
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.once("data", (data) => {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          resolve(data.toString().trim().toLowerCase());
        });
      });

      if (answer === "y") {
        await runInteractive(sessionFile);
        console.log("Back from interactive mode!");
      } else {
        console.log("Done.");
      }
      break;
    }

    default:
      console.log("Usage: bun run spike/headless-pi.ts [headless|interactive|hybrid]");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
