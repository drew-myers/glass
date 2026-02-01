/**
 * @fileoverview Tests for ProjectPath service and helper functions.
 */

import * as Os from "node:os";
import * as Path from "node:path";
import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import {
	computeProjectHash,
	getDatabaseDirectory,
	getDatabasePath,
} from "../../src/lib/project.js";

describe("ProjectPath helpers", () => {
	describe("computeProjectHash", () => {
		it("returns a 12-character hex string", () => {
			const hash = computeProjectHash("/some/project/path");

			expect(hash).toHaveLength(12);
			expect(hash).toMatch(/^[0-9a-f]+$/);
		});

		it("returns consistent hash for same path", () => {
			const hash1 = computeProjectHash("/my/project");
			const hash2 = computeProjectHash("/my/project");

			expect(hash1).toBe(hash2);
		});

		it("returns different hash for different paths", () => {
			const hash1 = computeProjectHash("/project/a");
			const hash2 = computeProjectHash("/project/b");

			expect(hash1).not.toBe(hash2);
		});
	});

	describe("getDatabaseDirectory", () => {
		it("returns path under ~/.local/share/glass", () => {
			const dir = getDatabaseDirectory("/my/project");
			const home = Os.homedir();

			expect(dir.startsWith(Path.join(home, ".local", "share", "glass"))).toBe(true);
		});

		it("includes project hash in path", () => {
			const projectPath = "/my/project";
			const hash = computeProjectHash(projectPath);
			const dir = getDatabaseDirectory(projectPath);

			expect(dir).toContain(hash);
		});
	});

	describe("getDatabasePath", () => {
		it("returns path to glass.db file", () => {
			const dbPath = getDatabasePath("/my/project");

			expect(dbPath.endsWith("glass.db")).toBe(true);
		});

		it("is inside the database directory", () => {
			const projectPath = "/my/project";
			const dir = getDatabaseDirectory(projectPath);
			const dbPath = getDatabasePath(projectPath);

			expect(dbPath).toBe(Path.join(dir, "glass.db"));
		});
	});
});
