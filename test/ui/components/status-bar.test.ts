import { describe, it } from "@effect/vitest";
import { expect } from "vitest";
import { StatusBar } from "../../../src/ui/components/status-bar.js";
import { colors, heights } from "../../../src/ui/theme.js";
import { findAllText, getNodeAt, getTextContent, getVNodeView } from "../test-utils.js";

describe("StatusBar", () => {
	describe("structure", () => {
		it("renders as a Box with correct layout props", () => {
			const vnode = StatusBar({});
			const view = getVNodeView(vnode);

			expect(view.typeName).toBe("BoxRenderable");
			expect(view.props.width).toBe("100%");
			expect(view.props.height).toBe(heights.statusBar);
			expect(view.props.flexDirection).toBe("row");
			expect(view.props.justifyContent).toBe("space-between");
		});

		it("uses panel background color", () => {
			const vnode = StatusBar({});
			const view = getVNodeView(vnode);

			expect(view.props.backgroundColor).toBe(colors.bgPanel);
		});

		it("has two Text children (app name and context)", () => {
			const vnode = StatusBar({});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			expect(textNodes.length).toBe(2);
		});
	});

	describe("app name", () => {
		it("always displays 'Glass' on the left", () => {
			const vnode = StatusBar({});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			// First text node should be the app name
			const appNameContent = getTextContent(getNodeAt(textNodes, 0).props.content);
			expect(appNameContent).toBe("Glass");
		});
	});

	describe("context display", () => {
		it("shows empty string when no props provided", () => {
			const vnode = StatusBar({});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			// Second text node should be empty
			const contextContent = getTextContent(getNodeAt(textNodes, 1).props.content);
			expect(contextContent).toBe("");
		});

		it("shows organization/project when both provided", () => {
			const vnode = StatusBar({ organization: "my-org", project: "my-project" });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			const contextContent = getTextContent(getNodeAt(textNodes, 1).props.content);
			expect(contextContent).toBe("my-org/my-project");
		});

		it("shows only project when organization not provided", () => {
			const vnode = StatusBar({ project: "my-project" });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			const contextContent = getTextContent(getNodeAt(textNodes, 1).props.content);
			expect(contextContent).toBe("my-project");
		});

		it("shows team in brackets when provided", () => {
			const vnode = StatusBar({
				organization: "my-org",
				project: "my-project",
				team: "my-team",
			});
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			const contextContent = getTextContent(getNodeAt(textNodes, 1).props.content);
			expect(contextContent).toBe("my-org/my-project [my-team]");
		});

		it("shows only team when no org/project", () => {
			const vnode = StatusBar({ team: "my-team" });
			const view = getVNodeView(vnode);
			const textNodes = findAllText(view);

			const contextContent = getTextContent(getNodeAt(textNodes, 1).props.content);
			expect(contextContent).toBe("[my-team]");
		});
	});
});
