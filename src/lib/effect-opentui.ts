/**
 * @fileoverview Effect/OpenTUI bridge utilities.
 *
 * Provides Effect-based lifecycle management for the OpenTUI renderer,
 * including automatic cleanup via Effect Scope.
 */

import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { Context, Effect, Layer, type Scope } from "effect";

/**
 * Configuration options for the OpenTUI renderer.
 */
export interface RendererConfig {
	/** Target frames per second for the render loop. Default: 30 */
	readonly targetFps?: number;
	/** Enable mouse input and tracking. Default: true */
	readonly useMouse?: boolean;
	/** Use terminal alternate screen buffer. Default: true */
	readonly useAlternateScreen?: boolean;
}

/**
 * Default renderer configuration.
 */
const defaultConfig: Required<RendererConfig> = {
	targetFps: 30,
	useMouse: true,
	useAlternateScreen: true,
};

/**
 * Service tag for the OpenTUI CLI renderer.
 * Provides access to the renderer instance for building terminal UIs.
 */
export class Renderer extends Context.Tag("glass/Renderer")<Renderer, CliRenderer>() {}

/**
 * Creates an Effect that acquires a CliRenderer with the given configuration.
 * The renderer is automatically destroyed when the scope is closed.
 *
 * @param config - Optional renderer configuration
 * @returns A scoped Effect that provides the renderer
 */
export const makeRenderer = (
	config: RendererConfig = {},
): Effect.Effect<CliRenderer, never, Scope.Scope> => {
	const mergedConfig: Required<RendererConfig> = { ...defaultConfig, ...config };

	return Effect.acquireRelease(
		Effect.promise(() =>
			createCliRenderer({
				exitOnCtrlC: false, // We handle Ctrl+C ourselves
				targetFps: mergedConfig.targetFps,
				useMouse: mergedConfig.useMouse,
				useAlternateScreen: mergedConfig.useAlternateScreen,
			}),
		),
		(renderer) =>
			Effect.sync(() => {
				renderer.destroy();
			}),
	);
};

/**
 * Live Layer that provides a scoped Renderer service.
 * The renderer is acquired when the layer is built and destroyed when the scope closes.
 *
 * Uses default configuration. For custom configuration, use `makeRendererLayer`.
 */
export const RendererLive: Layer.Layer<Renderer> = Layer.scoped(Renderer, makeRenderer());

/**
 * Creates a Layer with custom renderer configuration.
 *
 * @param config - Renderer configuration options
 * @returns A Layer that provides the configured Renderer service
 */
export const makeRendererLayer = (config: RendererConfig): Layer.Layer<Renderer> =>
	Layer.scoped(Renderer, makeRenderer(config));

/**
 * Utility to run an effect that requires the Renderer service.
 * Handles proper cleanup of the renderer when the effect completes.
 *
 * @param effect - The effect to run with renderer access
 * @returns An effect with the Renderer and Scope requirements eliminated
 */
export const withRenderer = <A, E, R>(
	effect: Effect.Effect<A, E, Renderer | Scope.Scope | R>,
): Effect.Effect<A, E, R> =>
	Effect.scoped(Effect.provide(effect, RendererLive)) as Effect.Effect<A, E, R>;
