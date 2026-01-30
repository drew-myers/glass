/**
 * @fileoverview Test utilities for OpenTUI component testing.
 *
 * Provides helpers for inspecting VNode structures returned by component functions.
 */

import type { VNode } from "@opentui/core";

/**
 * Represents a simplified view of a VNode for testing purposes.
 */
export interface VNodeView {
	/** The renderable type name (e.g., "BoxRenderable", "TextRenderable") */
	readonly typeName: string;
	/** Props passed to the component */
	readonly props: Record<string, unknown>;
	/** Child VNodes */
	readonly children: VNodeView[];
}

/**
 * Extracts a testable view from a VNode.
 *
 * @param vnode - The VNode to inspect
 * @returns A simplified view of the VNode tree
 */
export const getVNodeView = (vnode: VNode): VNodeView => {
	const typeName = vnode.type?.name ?? "Unknown";
	const props = { ...vnode.props } as Record<string, unknown>;
	const children = (vnode.children ?? [])
		.filter((child): child is VNode => child != null)
		.map(getVNodeView);

	return { typeName, props, children };
};

/**
 * Finds a child VNode by its id prop.
 *
 * @param view - The VNodeView to search
 * @param id - The id to find
 * @returns The matching VNodeView or undefined
 */
export const findById = (view: VNodeView, id: string): VNodeView | undefined => {
	if (view.props.id === id) {
		return view;
	}
	for (const child of view.children) {
		const found = findById(child, id);
		if (found) return found;
	}
	return undefined;
};

/**
 * Finds all VNodes matching a predicate.
 *
 * @param view - The VNodeView to search
 * @param predicate - Function to test each node
 * @returns Array of matching VNodeViews
 */
export const findAll = (view: VNodeView, predicate: (v: VNodeView) => boolean): VNodeView[] => {
	const results: VNodeView[] = [];
	if (predicate(view)) {
		results.push(view);
	}
	for (const child of view.children) {
		results.push(...findAll(child, predicate));
	}
	return results;
};

/**
 * Finds all Text nodes in the tree.
 *
 * @param view - The VNodeView to search
 * @returns Array of TextRenderable VNodeViews
 */
export const findAllText = (view: VNodeView): VNodeView[] =>
	findAll(view, (v) => v.typeName === "TextRenderable");

/**
 * Finds all Box nodes in the tree.
 *
 * @param view - The VNodeView to search
 * @returns Array of BoxRenderable VNodeViews
 */
export const findAllBoxes = (view: VNodeView): VNodeView[] =>
	findAll(view, (v) => v.typeName === "BoxRenderable");

/**
 * Extracts plain text content from a Text node's content prop.
 * Handles both plain strings and styled text objects.
 *
 * @param content - The content prop value
 * @returns Plain text string
 */
export const getTextContent = (content: unknown): string => {
	if (typeof content === "string") {
		return content;
	}
	// Styled text has a chunks array
	if (content && typeof content === "object" && "chunks" in content) {
		const chunks = (content as { chunks: Array<{ text: string }> }).chunks;
		return chunks.map((c) => c.text).join("");
	}
	return "";
};

/**
 * Gets a VNodeView from an array at the specified index, throwing if not found.
 * Useful for tests where we expect the node to exist.
 *
 * @param nodes - Array of VNodeViews
 * @param index - Index to retrieve
 * @returns The VNodeView at that index
 * @throws Error if index is out of bounds
 */
export const getNodeAt = (nodes: VNodeView[], index: number): VNodeView => {
	const node = nodes[index];
	if (!node) {
		throw new Error(`Expected node at index ${index}, but array has ${nodes.length} items`);
	}
	return node;
};
