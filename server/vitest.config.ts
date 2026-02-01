import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Use Bun to run tests - required for @effect/sql-sqlite-bun
		pool: "forks",
		poolOptions: {
			forks: {
				execArgv: [],
			},
		},
		// Include test files
		include: ["test/**/*.test.ts"],
		// Enable globals for vitest
		globals: false,
	},
});
