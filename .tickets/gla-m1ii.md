---
id: gla-m1ii
status: closed
deps: []
links: []
created: 2026-01-30T22:15:37Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [ui]
---
# Migrate UI to Solid.js bindings

Refactor the UI layer to use OpenTUI's Solid.js bindings for proper reactive updates instead of the current clear-and-rebuild approach which has poor performance.

## Problem

The current implementation in `src/ui/app.ts` clears all children from `renderer.root` and rebuilds the entire component tree on every state change. This is inefficient and causes visual flicker.

## Solution

Use OpenTUI's Solid.js bindings which provide proper reactive updates:
- https://opentui.com/docs/bindings/solid

## Design

1. Add `@opentui/solid` dependency
2. Convert `src/ui/app.ts` to use Solid.js signals for state
3. Convert screen components to Solid.js components
4. Use Solid's fine-grained reactivity for efficient updates

## Scope

- `src/ui/app.ts` - Main app component
- `src/ui/screens/list.ts` - Issue list screen  
- `src/ui/components/` - StatusBar, ActionBar
- `src/main.ts` - Entry point wiring

## Acceptance Criteria

- UI updates without rebuilding entire tree
- No visual flicker on state changes
- Navigation (j/k) feels responsive
- Spinner animation is smooth
- All existing functionality preserved

## Notes

**Completed 2026-01-30**

Migrated entire UI layer from imperative `@opentui/core` to reactive `@opentui/solid`. Key changes:

- Added `solid-js` and `@opentui/solid` dependencies
- Created `src/ui/state.ts` with Solid signals for fine-grained reactivity
- Converted all components to .tsx: `app.tsx`, `list.tsx`, `status-bar.tsx`, `action-bar.tsx`, `main.tsx`
- Removed `src/lib/effect-opentui.ts` (no longer needed - Solid's render() manages lifecycle)
- Updated `tsconfig.json` for JSX and `bunfig.toml` for Bun preload
- All 260 tests pass, app runs smoothly with no flicker

Deferred: Snapshot tests for components (requires vitest preload setup for Solid).
