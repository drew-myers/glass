import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import { ActionBar, MinimalActionBar } from "../../../src/ui/components/action-bar.js";
import { colors, heights } from "../../../src/ui/theme.js";
import { findAllText, getNodeAt, getTextContent, getVNodeView } from "../test-utils.js";

describe("ActionBar", () => {
	describe("structure", () => {
		it("renders as a Box with correct layout props", () => {
			const vnode = ActionBar({ keybinds: [] });
			const view = getVNodeView(vnode);

			expect(view.typeName).toBe("BoxRenderable");
			expect(view.props.width).toBe("100%");
			expect(view.props.height).toBe(heights.actionBar);
			expect(view.props.flexDirection).toBe("row");
			expect(view.props.alignItems).toBe("center");
		});

		it("uses panel background color", () => {
			const vnode = ActionBar({ keybinds: [] });
			const view = getVNodeView(vnode);

			expect(view.props.backgroundColor).toBe(colors.bgPanel);
		});

		it("has gap between keybind items", () => {
			const vnode = ActionBar({ keybinds: [] });
			const view = getVNodeView(vnode);

			expect(view.props.gap).toBe(2);
		});
	});

	describe("keybind rendering", () => {
		it("renders no text nodes for empty keybinds", () => {
			const vnode = ActionBar({ keybinds: [] });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			expect(textNodes.length).toBe(0);
		});

		it("renders one text node per keybind", () => {
			const vnode = ActionBar({
				keybinds: [
					{ key: "q", label: "quit" },
					{ key: "r", label: "refresh" },
					{ key: "?", label: "help" },
				],
			});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			expect(textNodes.length).toBe(3);
		});

		it("includes key in brackets and label", () => {
			const vnode = ActionBar({
				keybinds: [{ key: "q", label: "quit" }],
			});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			const content = getTextContent(getNodeAt(textNodes, 0).props.content);
			expect(content).toContain("[q]");
			expect(content).toContain("quit");
		});

		it("handles special key names", () => {
			const vnode = ActionBar({
				keybinds: [
					{ key: "Enter", label: "open" },
					{ key: "↑↓", label: "navigate" },
				],
			});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			const enterContent = getTextContent(getNodeAt(textNodes, 0).props.content);
			expect(enterContent).toContain("[Enter]");

			const arrowContent = getTextContent(getNodeAt(textNodes, 1).props.content);
			expect(arrowContent).toContain("[↑↓]");
		});
	});

	describe("enabled/disabled keybinds", () => {
		it("filters out disabled keybinds", () => {
			const vnode = ActionBar({
				keybinds: [
					{ key: "q", label: "quit" },
					{ key: "a", label: "approve", enabled: false },
					{ key: "r", label: "refresh" },
				],
			});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			expect(textNodes.length).toBe(2);

			const content0 = getTextContent(getNodeAt(textNodes, 0).props.content);
			const content1 = getTextContent(getNodeAt(textNodes, 1).props.content);

			expect(content0).toContain("quit");
			expect(content1).toContain("refresh");
			// "approve" should not be present
			expect(content0).not.toContain("approve");
			expect(content1).not.toContain("approve");
		});

		it("includes keybinds with enabled=true", () => {
			const vnode = ActionBar({
				keybinds: [
					{ key: "q", label: "quit", enabled: true },
					{ key: "a", label: "approve", enabled: true },
				],
			});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			expect(textNodes.length).toBe(2);
		});

		it("includes keybinds with enabled=undefined (default)", () => {
			const vnode = ActionBar({
				keybinds: [{ key: "q", label: "quit" }],
			});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			expect(textNodes.length).toBe(1);
		});
	});
});

describe("MinimalActionBar", () => {
	it("renders quit and help keybinds", () => {
		const vnode = MinimalActionBar();
		const view = getVNodeView(vnode);
		const textNodes = findAllText(view);

		expect(textNodes.length).toBe(2);

		const content0 = getTextContent(getNodeAt(textNodes, 0).props.content);
		const content1 = getTextContent(getNodeAt(textNodes, 1).props.content);

		expect(content0).toContain("[q]");
		expect(content0).toContain("quit");
		expect(content1).toContain("[?]");
		expect(content1).toContain("help");
	});
});
