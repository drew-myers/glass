import { describe, it } from "@effect/vitest";
import type { KeyEvent } from "@opentui/core";
import { expect } from "vitest";
import {
	formatKeybinds,
	getNavigationDirection,
	globalKeybinds,
	isQuitKey,
	listScreenKeybinds,
	matchesCtrl,
	matchesKey,
} from "../../src/ui/keybinds.js";

// ----------------------------------------------------------------------------
// Mock KeyEvent Factory
// ----------------------------------------------------------------------------

const createKeyEvent = (overrides: Partial<KeyEvent> = {}): KeyEvent =>
	({
		name: "",
		sequence: "",
		ctrl: false,
		shift: false,
		meta: false,
		option: false,
		...overrides,
	}) as unknown as KeyEvent;

// ----------------------------------------------------------------------------
// matchesKey Tests
// ----------------------------------------------------------------------------

describe("matchesKey", () => {
	it("returns true when key name matches", () => {
		const event = createKeyEvent({ name: "q" });
		expect(matchesKey(event, "q")).toBe(true);
	});

	it("returns false when key name does not match", () => {
		const event = createKeyEvent({ name: "a" });
		expect(matchesKey(event, "q")).toBe(false);
	});

	it("ignores modifiers", () => {
		const event = createKeyEvent({ name: "q", ctrl: true });
		expect(matchesKey(event, "q")).toBe(true);
	});
});

// ----------------------------------------------------------------------------
// matchesCtrl Tests
// ----------------------------------------------------------------------------

describe("matchesCtrl", () => {
	it("returns true when Ctrl+key matches", () => {
		const event = createKeyEvent({ name: "c", ctrl: true });
		expect(matchesCtrl(event, "c")).toBe(true);
	});

	it("returns false when Ctrl not pressed", () => {
		const event = createKeyEvent({ name: "c", ctrl: false });
		expect(matchesCtrl(event, "c")).toBe(false);
	});

	it("returns false when key does not match", () => {
		const event = createKeyEvent({ name: "x", ctrl: true });
		expect(matchesCtrl(event, "c")).toBe(false);
	});
});

// ----------------------------------------------------------------------------
// isQuitKey Tests
// ----------------------------------------------------------------------------

describe("isQuitKey", () => {
	it("returns true for 'q' key", () => {
		const event = createKeyEvent({ name: "q" });
		expect(isQuitKey(event)).toBe(true);
	});

	it("returns true for Ctrl+c", () => {
		const event = createKeyEvent({ name: "c", ctrl: true });
		expect(isQuitKey(event)).toBe(true);
	});

	it("returns false for other keys", () => {
		const event = createKeyEvent({ name: "a" });
		expect(isQuitKey(event)).toBe(false);
	});

	it("returns false for 'c' without Ctrl", () => {
		const event = createKeyEvent({ name: "c" });
		expect(isQuitKey(event)).toBe(false);
	});
});

// ----------------------------------------------------------------------------
// getNavigationDirection Tests
// ----------------------------------------------------------------------------

describe("getNavigationDirection", () => {
	it("returns 'up' for up arrow", () => {
		const event = createKeyEvent({ name: "up" });
		expect(getNavigationDirection(event)).toBe("up");
	});

	it("returns 'up' for 'k' key (vim)", () => {
		const event = createKeyEvent({ name: "k" });
		expect(getNavigationDirection(event)).toBe("up");
	});

	it("returns 'down' for down arrow", () => {
		const event = createKeyEvent({ name: "down" });
		expect(getNavigationDirection(event)).toBe("down");
	});

	it("returns 'down' for 'j' key (vim)", () => {
		const event = createKeyEvent({ name: "j" });
		expect(getNavigationDirection(event)).toBe("down");
	});

	it("returns 'left' for left arrow", () => {
		const event = createKeyEvent({ name: "left" });
		expect(getNavigationDirection(event)).toBe("left");
	});

	it("returns 'left' for 'h' key (vim)", () => {
		const event = createKeyEvent({ name: "h" });
		expect(getNavigationDirection(event)).toBe("left");
	});

	it("returns 'right' for right arrow", () => {
		const event = createKeyEvent({ name: "right" });
		expect(getNavigationDirection(event)).toBe("right");
	});

	it("returns 'right' for 'l' key (vim)", () => {
		const event = createKeyEvent({ name: "l" });
		expect(getNavigationDirection(event)).toBe("right");
	});

	it("returns null for non-navigation keys", () => {
		const event = createKeyEvent({ name: "q" });
		expect(getNavigationDirection(event)).toBe(null);
	});
});

// ----------------------------------------------------------------------------
// formatKeybinds Tests
// ----------------------------------------------------------------------------

describe("formatKeybinds", () => {
	it("formats keybinds correctly", () => {
		const keybinds = [
			{ key: "q", label: "quit" },
			{ key: "Enter", label: "open" },
		];
		expect(formatKeybinds(keybinds)).toBe("[q] quit  [Enter] open");
	});

	it("filters out disabled keybinds", () => {
		const keybinds = [
			{ key: "q", label: "quit" },
			{ key: "a", label: "approve", enabled: false },
			{ key: "r", label: "refresh" },
		];
		expect(formatKeybinds(keybinds)).toBe("[q] quit  [r] refresh");
	});

	it("includes keybinds with enabled=true", () => {
		const keybinds = [
			{ key: "q", label: "quit", enabled: true },
			{ key: "r", label: "refresh", enabled: true },
		];
		expect(formatKeybinds(keybinds)).toBe("[q] quit  [r] refresh");
	});

	it("handles empty array", () => {
		expect(formatKeybinds([])).toBe("");
	});
});

// ----------------------------------------------------------------------------
// Keybind Groups Tests
// ----------------------------------------------------------------------------

describe("globalKeybinds", () => {
	it("includes quit keybind", () => {
		expect(globalKeybinds.some((kb) => kb.key === "q")).toBe(true);
	});

	it("includes help keybind", () => {
		expect(globalKeybinds.some((kb) => kb.key === "?")).toBe(true);
	});
});

describe("listScreenKeybinds", () => {
	it("includes navigation keybinds", () => {
		expect(listScreenKeybinds.some((kb) => kb.label === "navigate")).toBe(true);
	});

	it("includes open keybind", () => {
		expect(listScreenKeybinds.some((kb) => kb.key === "Enter")).toBe(true);
	});

	it("includes refresh keybind", () => {
		expect(listScreenKeybinds.some((kb) => kb.key === "r")).toBe(true);
	});
});
