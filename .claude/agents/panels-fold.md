---
name: panels-fold
description: Builds slice U.5 of LeatherCAD's UI refinement — Parts and Properties fold to 40 px strips with `[` and `]`, `\` is focus mode, the status bar always has three chips, §5's widths at every window size, the maker's choices remembered — end to end, tests first, measured in the running app, and opens a pull request into develop without merging it. Use when asked to build, continue or fix U.5.
model: opus
effort: high
---

# U.5 — panels fold, and focus mode

Slice **U.5** of the 1.5 UI refinement: requirement **R-04** and §5's responsive table, mockups
`10-panel-collapse.png` and `05-window-1024.png`. On a laptop the board is a narrow slot between two
panels; folding them gives the drawing the room, and nothing may ever become unreachable.

## Where your instructions are

- **Your process** is `.claude/agents/ui-refinement.md`: the loop, how to think, the rules that bite,
  the machine, commits and the pull request, and what to report. Follow it.
- **Your task** is the plan's §5 **U.5**, in `docs/superpowers/plans/2026-10-08-ui-refinement.md`,
  with its *Find out first* and *Done when*. Read §0–§4 first, and the *As built* notes of U.4, U.6
  and U.13, which changed what U.5 stands on.
- **This file** adds only what the plan cannot know: the code as it is now, and the traps. Where it
  and the code disagree, the code wins — check, and correct the plan in your pull request.

## Before you start

U.5, U.7 and U.8 run **one at a time, in that order**: all three change `App.tsx`, `styles.css`,
`keymap.ts`, `en.json` and the pixel references, and U.8 reuses U.5's thumbnail. U.5 needs only U.3,
which is merged. Branch `feat/ui-panels-fold` from `origin/develop`. If another session already has a
U.5 or U.7 branch in progress (`git branch -a`, `gh pr list`), stop and say so instead of starting a
second.

## The code as it is (develop at 8ac7a52, read on 2026-10-13)

- **The grid** is `.workspace` in `styles.css` (~119–175): `rail | Parts | canvas | Properties`,
  with `--parts-w: 220px` and `--properties-w: 288px` (264 below 1280) **written in `styles.css`**, not
  in the theme. The rail's widths are the theme's `RAIL_PX = { expanded: 152, collapsed: 52 }`
  (`packages/render/src/theme/tokens.ts`), emitted as `--rail-w-*` by `theme/css.ts`. §5 wants 152
  / 56, 224, 264 and a 40 px strip: put them all in the theme, the way `RAIL_PX` is.
- **Overlays today:** `propertiesOverlay` below 1024 and `partsOverlay` below 900 are media queries in
  `App.tsx` (~225), as classes on `.workspace` (~715); their chips exist only then (~810–830).
- **The rail's pattern to copy:** `railAutoCollapsed` / `railExpandedWhileNarrow` (`App.tsx`
  ~202–213) — an automatic fold never overwrites the maker's choice.
- **Preferences:** `Preferences` (`packages/platform/src/host.ts`) and `parsePreferences` /
  `validChanges` (`apps/desktop/src/main/preferences.ts`). U.13 added fields there and made the store
  read every change back through `fromRecord`; add the panels' flags the same way, each falling back
  on its own.
- **Keys:** no command is bound to `[`, `]` or `\` yet. They are punctuation, which U.3 matches **by
  place** (`BracketLeft`, `BracketRight`, `Backslash`, and `IntlBackslash` on ISO keyboards) and
  shows as the local character: on a German layout `[` is the key labelled Ü. Escape is the `cancel`
  command, scoped to the canvas (`keymap.ts` ~159).
- **The drawing stays put:** `CanvasHost.tsx` (~560–600) reframes from a `ResizeObserver` on the
  canvas's container, shifting by how far its left and top edges moved (F.3). A fold changes the
  container's width, so it should reframe; measure it before relying on it.
- **What floats on the board:** the zoom control at the bottom-right, `z-index: 4`, inset 16 px
  (U.4); the legend at the top-right below the ruler (until U.10). An overlay or strip must sit above
  `z-index: 4`, or leave them uncovered.

## Traps

- **Focus.** U.4 set the rule in `Menu.tsx`: a close by keyboard returns focus to the opener; a close
  by pointer leaves it where the press put it. An overlay opened from a strip follows the same rule.
- **Escape has owners before focus mode:** a drawing in progress, an open menu (the zoom menu stops
  Escape while open), a field being edited (`NumberField` stops it during an edit, U.13), an open
  overlay. Focus mode takes Escape only when none of them does.
- **Properties' footer** (U.6): Delete sits alone at the panel's foot and stays in view while the
  panel scrolls. It must still do so in the overlay, and at 860 × 600.
- **Thumbnails** fit an outline into a box of pixels: that arithmetic goes in `packages/render`,
  returning an SVG path, never in a component (invariant 1). U.8 reuses it; write it for both.
- **E2E tests that state today's layout:** the narrow-window chips in `shell.spec.ts` and
  `top-bar.spec.ts`, and every spec that clicks a Parts row at a narrow size. Rewrite what states
  the old behaviour; keep the `data-testid`s other specs use.
- **Pixel references** change with the widths: retake them and look at every image.

## Check, beyond the plan's *Done when*

- The zoom control and the legend are uncovered with every combination of folds, at every width.
- With both panels folded, Tab reaches every panel's strip and the status bar's chips.
- A folded Parts strip still offers what F.2 promised: a way to every piece, including a locked one.

## Report back

As `ui-refinement.md` says, and also: the five canvas widths measured before and after; and for U.7
and U.8, the tokens, the thumbnail function and the preference flags you added, by name.
