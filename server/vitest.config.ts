import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Include test files
		include: ["test/**/*.test.ts"],
		// Enable globals for vitest
		globals: false,
	},
});
