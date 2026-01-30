---
id: gla-fvc3
status: closed
deps: [gla-cu9p]
links: []
created: 2026-01-30T17:04:43Z
type: task
priority: 1
assignee: Drew Myers
parent: gla-uyi9
tags: [foundation, ui]
---
# Basic TUI shell with OpenTUI

Create the basic TUI application shell with OpenTUI renderer and screen routing

## Design

- Effect + OpenTUI integration (effect-opentui.ts bridge)
- Main app component with screen state (list vs detail)
- Theme constants (colors matching opencode/lazygit aesthetic)
- Basic keyboard handling (q to quit, navigation)
- Status bar and action bar components
- Renderer lifecycle management with Effect Scope

## Acceptance Criteria

- App starts and displays empty shell
- Can quit with 'q'
- Proper cleanup on exit
- Theme colors applied

## Notes

Completed 2026-01-30.

### Files Created

- `src/lib/effect-opentui.ts` - Effect/OpenTUI bridge with scoped renderer lifecycle
- `src/ui/theme.ts` - Theme constants (Tokyo Night-inspired colors, status icons)
- `src/ui/keybinds.ts` - Keybind types and utilities (vim-style navigation support)
- `src/ui/components/status-bar.ts` - Top bar component showing app name
- `src/ui/components/action-bar.ts` - Bottom bar showing context-sensitive keybinds
- `src/ui/app.ts` - Main app component with screen state routing via Effect Ref
- `test/ui/app.test.ts` - Tests for app state/action reducer
- `test/ui/theme.test.ts` - Tests for theme constants and helpers
- `test/ui/keybinds.test.ts` - Tests for keybind utilities
- `test/ui/test-utils.ts` - VNode inspection utilities for component testing
- `test/ui/components/status-bar.test.ts` - Structure tests for StatusBar component
- `test/ui/components/action-bar.test.ts` - Structure tests for ActionBar component

### Files Modified

- `src/main.ts` - Updated to wire up renderer and run app
- `biome.json` - Added `src/ui/**/*.ts` to noBannedTypes override (for Data.TaggedEnum)

### Architecture Decisions

1. **Declarative UI** - Used OpenTUI Construct API (`Box`, `Text`, etc.) for React-like composition
2. **Effect Ref for state** - Screen state managed via Effect Ref for reactive updates
3. **Component-owned keybinds** - Each component handles its own keys via `renderer.keyInput`
4. **Scoped renderer** - Used `Effect.acquireRelease` for automatic cleanup on exit
5. **Match.value().pipe()** - Used Effect's Match module for exhaustive pattern matching on tagged enums

### Acceptance Criteria Verification

- [x] App starts and displays empty shell with "No issues loaded" placeholder
- [x] Can quit with 'q' (or Ctrl+C)
- [x] Proper cleanup on exit via Effect Scope
- [x] Theme colors applied (Tokyo Night-inspired dark theme)

### Component Testing Approach

Components are pure functions returning VNodes (data structures), enabling lightweight structural tests without a renderer:

```typescript
const vnode = StatusBar({ organization: "my-org", project: "my-project" });
const view = getVNodeView(vnode);
const textNodes = findAllText(view);
expect(getTextContent(getNodeAt(textNodes, 1).props.content)).toBe("my-org/my-project");
```

Test utilities in `test/ui/test-utils.ts` provide VNode inspection helpers.
