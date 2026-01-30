import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";

const program = Effect.gen(function* () {
	yield* Console.log("Glass - Sentry Issue Orchestration TUI");
	yield* Console.log("Setup complete!");
});

BunRuntime.runMain(program);
