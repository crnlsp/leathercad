---
paths:
  - 'apps/desktop/src/renderer/**'
---

# The renderer

React panels around the canvas. Components read the document and dispatch commands; they own
only their own view state.

- **Logic in a `.ts` file, rendering in the `.tsx`.** What a panel shows is a pure function of the
  project beside it — `legend.ts` for `CanvasLegend.tsx`, `menus.ts` for `Menu.tsx` — and is tested
  there without React. A component maps that result to elements.
- **Derive, do not copy.** Read from the document store and compute; never mirror the document, or
  anything derived from it, into React state, where it goes stale.
- **Memoise what is expensive, not by reflex.** `useMemo` over a whole-project derivation earns its
  place; a `useCallback` around every handler does not. The React Compiler runs as a lint check,
  not as a build step, so do not assume it memoises.
- **Effects synchronise with something outside React** — the canvas, the main process, a timer.
  Computing a value from props or state is not an effect.
- **Every word through `t()`**, every key through the keymap. `untranslated.test.ts` catches words
  written into JSX.
- **Accessible by default.** A real `<button>`, `<input>` or `<label>` before a `div` with a
  handler; every control has a name; focus is visible and returns where it was when a dialog
  closes. The e2e axe scan is the floor, not the goal.
- **Styling from tokens.** `styles.css` uses the theme's tokens and defines none of its own.
