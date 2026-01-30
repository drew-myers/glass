import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";
import {
	AppAction,
	type AppState,
	ScreenState,
	initialAppState,
	reduceAppState,
} from "../../src/ui/app.js";

// ----------------------------------------------------------------------------
// Initial State Tests
// ----------------------------------------------------------------------------

describe("initialAppState", () => {
	it("starts on List screen", () => {
		expect(initialAppState.screen._tag).toBe("List");
	});

	it("starts with shouldQuit false", () => {
		expect(initialAppState.shouldQuit).toBe(false);
	});
});

// ----------------------------------------------------------------------------
// Screen State Tests
// ----------------------------------------------------------------------------

describe("ScreenState", () => {
	it("creates List screen state", () => {
		const state = ScreenState.List();
		expect(state._tag).toBe("List");
	});

	it("creates Detail screen state with issueId", () => {
		const state = ScreenState.Detail({ issueId: "sentry:12345" });
		expect(state._tag).toBe("Detail");
		expect(state.issueId).toBe("sentry:12345");
	});
});

// ----------------------------------------------------------------------------
// App Action Tests
// ----------------------------------------------------------------------------

describe("AppAction", () => {
	it("creates Navigate action", () => {
		const action = AppAction.Navigate({ screen: ScreenState.List() });
		expect(action._tag).toBe("Navigate");
	});

	it("creates Quit action", () => {
		const action = AppAction.Quit();
		expect(action._tag).toBe("Quit");
	});
});

// ----------------------------------------------------------------------------
// Reducer Tests
// ----------------------------------------------------------------------------

describe("reduceAppState", () => {
	describe("Navigate action", () => {
		it("navigates from List to Detail", () => {
			const state: AppState = {
				screen: ScreenState.List(),
				shouldQuit: false,
			};

			const action = AppAction.Navigate({
				screen: ScreenState.Detail({ issueId: "sentry:123" }),
			});

			const newState = reduceAppState(state, action);

			expect(newState.screen._tag).toBe("Detail");
			if (newState.screen._tag === "Detail") {
				expect(newState.screen.issueId).toBe("sentry:123");
			}
			expect(newState.shouldQuit).toBe(false);
		});

		it("navigates from Detail to List", () => {
			const state: AppState = {
				screen: ScreenState.Detail({ issueId: "sentry:123" }),
				shouldQuit: false,
			};

			const action = AppAction.Navigate({ screen: ScreenState.List() });

			const newState = reduceAppState(state, action);

			expect(newState.screen._tag).toBe("List");
			expect(newState.shouldQuit).toBe(false);
		});

		it("preserves shouldQuit when navigating", () => {
			const state: AppState = {
				screen: ScreenState.List(),
				shouldQuit: true,
			};

			const action = AppAction.Navigate({
				screen: ScreenState.Detail({ issueId: "test" }),
			});

			const newState = reduceAppState(state, action);

			expect(newState.shouldQuit).toBe(true);
		});
	});

	describe("Quit action", () => {
		it("sets shouldQuit to true", () => {
			const state: AppState = {
				screen: ScreenState.List(),
				shouldQuit: false,
			};

			const action = AppAction.Quit();

			const newState = reduceAppState(state, action);

			expect(newState.shouldQuit).toBe(true);
		});

		it("preserves screen when quitting", () => {
			const state: AppState = {
				screen: ScreenState.Detail({ issueId: "test" }),
				shouldQuit: false,
			};

			const action = AppAction.Quit();

			const newState = reduceAppState(state, action);

			expect(newState.screen._tag).toBe("Detail");
			if (newState.screen._tag === "Detail") {
				expect(newState.screen.issueId).toBe("test");
			}
		});
	});
});
