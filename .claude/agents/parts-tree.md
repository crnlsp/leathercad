---
name: parts-tree
description: Builds slice U.8 of LeatherCAD's UI refinement — Parts as a tree of pieces that fold, with thumbnails and Cut, features nested under what they follow, lock and eye on hover, the tree's own keys and ARIA, a canvas selection revealing its row, and "Sheet N, turned" leaving the Design view — end to end, tests first, measured in the running app, and opens a pull request into develop without merging it. Use when asked to build, continue or fix U.8.
model: opus
effort: high
---

# U.8 — the Parts tree

Slice **U.8** of the 1.5 UI refinement: requirement **R-07**, mockups `09-parts-tree.png` and
`01-design-view.png`. Parts is where a maker finds a locked feature, hides a pocket to see beneath
it and checks a piece's Cut: it should read as pieces, with what each is made of nested the way it
is built, and show at rest only the numbers a maker cares about.

## Where your instructions are

- **Your process** is `.claude/agents/ui-refinement.md`. Follow it.
- **Your task** is the plan's §5 **U.8**, in `docs/superpowers/plans/2026-10-08-ui-refinement.md`;
  read §0–§4 first, and the *As built* notes of U.5, U.6 and U.7.
- **This file** adds only what the plan cannot know: the code as it is now, and the traps. Where it
  and the code disagree, the code wins — check, and correct the plan in your pull request.

## Before you start

U.5, U.7 and U.8 run **one at a time, in that order**, and U.8 reuses U.5's thumbnail function and
row height. **Start only when U.5 and U.7 are both ✅ in `docs/roadmap.md` on `origin/develop`**; if
either is not, stop and say so. Then branch `feat/ui-parts-tree` from `origin/develop`.

## The code as it is (develop at 8ac7a52, read on 2026-10-13 — re-read it after U.5 and U.7)

- **The nesting exists.** `featureTree(part)` (`packages/domain/src/featureTree.ts`) already puts a
  derived feature under its source within a part, with drawn features and cross-part followers as
  roots, and survives a cycle. `PartsList.tsx` (~463 lines) draws it with a `depth` (~217). The
  slice's work is the tree's semantics, folding, row layout and keys — not a second nesting.
- **No tree keyboard and no tree roles** exist in `PartsList.tsx` today.
- **One list for both views.** `PartsList` is drawn on Design and on Sheets (it takes the Sheets
  view's hovered part). Its `PrintLine` (~440–463, `part-print-<id>`) says *Sheet 1*, *Sheets 2–3,
  taped* — or *Not printed* with the reason (Q20) — under each part, in both views.
- **Row actions:** each part's ⋯ is a `MenuButton` (`part-menu-<id>`, ~252); the right-click menu is
  `contextMenu.ts` (8.8) through `menus.ts`. The mirror mark's faces come from `icons/arrange.ts`
  (U.6 fixed Lucide's swapped flip icons there).
- **Cut** is the part's `quantity`; U.6's Properties shows it beside *Piece*.

## Traps

- **"Sheet N, turned" leaves Design; *Not printed* is a warning.** A hidden piece, or one with a
  hidden outline, is left off the paper (Q20), and today this line is where Design says so. Keep that
  fact reachable in Design (a mark on the row with the reason in its tooltip, say). Say what you chose
  and why. The Sheets view keeps its line until U.9.
- **`data-testid`s are load-bearing:** `feature-row-<id>` (33 uses), `part-heading-<id>`,
  `part-section-<id>`, `part-menu-<id>` and `part-name` appear across ten E2E specs. Keep them on the
  same elements' meaning, or change every spec that uses them in the same pull request.
- **The tree's keys are the tree's.** Up, Down, Left, Right, Space and F2 act only while focus is in
  the tree, with roving `tabindex`. They must not reach the window's keymap, and the window's keys
  (`Delete`, `Ctrl+Z`, tool letters) must keep working from a focused row as they do today. If U.7
  bound F2 anywhere, make the two agree.
- **Thumbnails and widths** come from U.5 (`packages/render`, and the theme's row height): reuse
  them; do not write a second fit.
- **Revealing a canvas selection** opens the piece and scrolls its row into view without stealing
  focus from the canvas.
- **Performance:** check the list with 30 features, as the plan asks, before and after.
- **Pixel references** change: retake them and look at every image.

## Check, beyond the plan's *Done when*

- A locked feature is still reachable from the tree by mouse and by keyboard — F.2's rule.
- The accessibility scan passes with pieces folded and open.

## Report back

As `ui-refinement.md` says, and also, for U.9: what the Sheets view's list still shows that Design
no longer does.
