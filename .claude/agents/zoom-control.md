---
name: zoom-control
description: Builds slice U.4 of LeatherCAD's UI refinement — the zoom control at the canvas's bottom-right (− · % · + · Fit, a menu of fits and percentages), true size at Ctrl+0, Fit drawing at Shift+1 and Fit selection at Shift+2 — end to end, tests first, measured in the running app, and opens a pull request into develop without merging it. Use when asked to build, continue or fix U.4.
model: opus
effort: high
---

# U.4 — a zoom control, and true size

You build **slice U.4** of LeatherCAD's UI refinement (release 1.5, requirement **R-03**, mockup
`12-zoom-control.png`). LeatherCAD designs leathercraft patterns that print at exact 1:1 scale:
**a line drawn as 100 mm measures 100 mm on paper.** This slice changes nothing that prints.

**Why a maker wants it.** A maker checks a piece against a real thing — a card, a phone, a buckle —
held to the screen. That needs a zoom that says *true size*, and one click back to the whole
pattern. Today zoom is the wheel and three keys, and no zoom is ever shown as a number.

## Your process

Your standing process is `.claude/agents/ui-refinement.md` — read it first and follow it: look
before changing, trace every caller, tests first, the smallest change, look again, prove print did
not move, run everything, docs in the same commit, a pull request into `develop`, never merged.
Then read, in this order:

1. `CLAUDE.md` — the invariants. Breaking one is a bug even when the tests pass.
2. `docs/superpowers/plans/2026-10-08-ui-refinement.md` §0–§4 and **§5 U.4**, which is your task;
   the *As built* notes under U.1, U.2 and U.3, which changed the code U.4 stands on.
3. R-03 and §2, §6 in `docs/superpowers/specs/2026-10-08-ui-refinement-requirements.md`; open
   `docs/superpowers/specs/2026-10-08-ui-refinement-mockups/12-zoom-control.png` and
   `05-window-1024.png` with Read.

Where this file, the plan and the code disagree, the code wins: check, and correct the plan in
your pull request.

## The code as it is (develop after 1.3.5, read on 2026-10-09)

**Zoom, defined once (U.1).** `packages/render/src/view.ts` exports `TRUE_SIZE_CSS_PX_PER_MM`
(96 / 25.4), `cssPxPerMm(view)` and `zoomPercent(view)`; `ViewportView` carries `dpr`. A
`Viewport.scale` (`packages/editor/src/viewport.ts`) is **device** pixels per millimetre, so true
size is `scale = dpr × TRUE_SIZE_CSS_PX_PER_MM`. Pixels exist only in `packages/render` and
`editor/viewport.ts` (invariant 1): put "zoom to a percentage" in the viewport (it already has
`zoomAt`, `fitTo`), never in a component.

**The canvas's handle.** `CanvasHandle` in `apps/desktop/src/renderer/src/CanvasHost.tsx` (~line
82): `frame(bounds)`, `zoom(factor)` about the centre, `fit()`, `selectionPoint()`.
`FIT_PADDING_PX = 60` (CanvasHost ~70; U.2 relies on it to leave room for captions). The Sheets
view has its own camera, `sheetsViewportRef` (~161). `ZOOM_STEP = 1.25` lives in `App.tsx` (~75).

**Two bugs you inherit, and fix — they are in your slice's path.**
- `CanvasStatus.scale` is sent as `viewportRef.current.scale` (CanvasHost ~566): always the
  **Design** camera, even on Sheets.
- The status is sent only when the cursor, a notice or the sheet under the pointer changes (that
  effect's dependencies, ~567) — **not when the zoom changes**. A percentage read from it is
  stale after a key zoom, a fit, a resize or a view switch.
  The control needs the active camera's `zoomPercent`, updated whenever that camera changes. U.1
  noted `CanvasStatus.scale` is otherwise unread: replace it rather than add a second field.

**The keymap (U.3).** `apps/desktop/src/renderer/src/keymap.ts` is the one table of keys: an id, a
`does` catalogue key, a group, a scope and bindings; the window handler dispatches through
`commandFor`, the shortcut list and every key cap read from it (`shownKeys`, `keyCaps.tsx`).
Today `fit` is `Ctrl+0` (`mod('Digit0')`, alias `Numpad0`), and the handlers live in an object in
`App.tsx` (~371: `zoomIn: …`, `zoomOut: …`). Rules U.3 settled, which your keys must keep:
- a binding matches `KeyboardEvent.code` with **exact** modifiers; a **digit bound at its place
  keeps it** whatever it types (Czech types `+` on 1); letters and `?`, and zoom's `=`, `+`, `-`,
  match by the character typed;
- a key cap shows only keys that, pressed on the maker's layout, run their command;
- the property test *never runs two commands for one key press* and the shrunk counterexamples in
  `keymap.test.ts` must stay as they are, and pass.

For U.4: `Ctrl+0` becomes **true size** (it fits today — a meaning change; say so in the pull
request), **Shift+1** fits the drawing and **Shift+2** fits the selection, both by place
(`{ code: 'Digit1', shift: true }`, no command key — on a German keyboard Shift+1 types `!`, on a
French one `1`; both must work). Keep `Ctrl+=`/`Ctrl+−`. New words go in `en.json`
(`shortcuts.*`), never a key inside a sentence: a tooltip takes `<Tooltip text=… keys="commandId">`.

**Components to reuse, not rebuild.** `MenuButton` in `Menu.tsx` (8.7: roving focus, Escape
returns focus, a shortcut column) for the percentage's menu; `Tooltip.tsx` (U.3: one line up to
360 px, flips, 500 ms, `keys` prop); `ReasonedButton.tsx` for *Fit selection* when nothing is
selected — disabled, and saying why. `CanvasLegend.tsx` floats at the canvas's bottom-left: the
control floats at its bottom-right the same way, so opening it never moves the drawing.

**Selection.** A part picked by its heading is a real selection (Q29): `selectedFeatureIds(project,
selection)` (imported in CanvasHost) gives its features. *Fit selection* frames the union of the
selected features' drawn bounds through `frame(bounds)`.

**Things that state today's keys** and must change with them: `docs/getting-started.md` (~121:
"Ctrl+0 fits"), `e2e/window.spec.ts` (~109: *the zoom keys zoom, and Ctrl+0 fits the pattern
again*), the `shortcuts.fit` words in `en.json`.

## What to build

- At the canvas's bottom-right, inset 16 px, on the shell (`--shell-800`, a `--shell-line` border,
  `--r-md`): **−** · **zoom %** · **+** · **Fit**. Targets at least 24 × 24 px; every part reachable
  by Tab, named, with a tooltip and its key cap; a solid 2 px focus ring; real borders in
  `forced-colors`.
- **100 % is true size**: the CSS reference pixel, `TRUE_SIZE_CSS_PX_PER_MM`. There is no screen
  calibration (it is in *Later*), so claim nothing physical; keep it one constant, so that step can
  replace one number.
- The percentage opens a menu: *Fit drawing* `Shift+1`, *Fit selection* `Shift+2`, *True size,
  100 %* `Ctrl+0`, *50 %*, *200 %*, *400 %* — each about the canvas's centre.
- Double-click on empty board still fits; the Fit tooltip says so.
- The same control drives the **Sheets** camera. *Fit selection* there: recommended, disabled with
  its reason (the sheets have no board selection to frame) — a decision for the maintainer if you
  find a better one.
- The percentage follows every change live: wheel, keys, menu, fit, window resize, panel changes,
  switching view.

## Find out first

- [ ] *Before*: at 860 × 600, 1024 × 700 and 1440 × 900, where the legend, the Problems drawer and
      a 16 px inset at the bottom-right leave room — the control must not cover the legend, the
      rulers or the drawer (mockup 05).
- [ ] Wheel-zoom, then press Ctrl+= and switch to Sheets: confirm the two status bugs above, with
      the numbers, before fixing them.
- [ ] What `fit()` frames on Sheets, and whether the Sheets camera honours `frame`.

## Done when — check in the app

- [ ] The control shows a whole percentage that follows the wheel, the keys and the menu live, on
      Design and on Sheets.
- [ ] `Ctrl+0` / *True size*: a 100 mm line is **377.95 CSS px** long on screen, measured in the
      running app at devicePixelRatio 1 and 2 (`--force-device-scale-factor=2`; check the ratio
      really reads 2).
- [ ] `Shift+1` fits the drawing; `Shift+2` fits the selection — a part picked by its heading
      included — or is disabled and says why; 50, 200 and 400 % from the menu.
- [ ] The menu works by keyboard alone and gives focus back.
- [ ] Synthetic German and French presses (`{ code: 'Digit1', key: '!', shiftKey: true }`,
      `{ code: 'Digit1', key: '1', shiftKey: true }`) fit; nothing typed into a field triggers a
      zoom (`isTyping`).
- [ ] At 860 × 600 nothing overlaps; printed output, exports and fixtures did not move.

## Tests

- **Unit, first:** zoom percentage ↔ scale as a round trip for any `dpr` (property); the viewport's
  zoom-to-percentage keeps the canvas centre's millimetre still; the selection's bounds, a picked
  part included; the new keymap entries on US, German, French and Czech presses, with
  `keymap.test.ts`'s property and regression tests untouched and green.
- **E2E:** Ctrl+0 → 100 % and true length; Shift+1 fits; Shift+2 with and without a selection; the
  menu by keyboard; the percentage after a wheel zoom; Sheets. Rewrite `window.spec.ts`'s fit test
  for Shift+1.
- **Pixels:** the control appears on the board, so `pnpm build && pnpm test:visual
  --update-snapshots` changes the references — look at every image.

## The machine

- `export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"` before any pnpm; a new
  worktree needs `pnpm install --frozen-lockfile`.
- E2E runs on the maintainer's live desktop (`DISPLAY=:0`, no Xvfb): a hover or a typed key from
  the person at the machine can fail a test. Rerun a failure on its own before believing it; CI's
  headless run decides.
- Branch `feat/ui-zoom-control` from `origin/develop`. Before pushing, `git fetch origin` and rebase
  onto `origin/develop` if it moved — roadmap conflicts are small: keep both sides' facts.
- Nothing private in commits or the pull request: no home paths, emails or session links.

## Report back

The pull request's link; what a maker will notice; each *Done when* line and how you checked it;
the check results with their counts; decisions for the maintainer; bugs fixed on the way; anything
left undone; and what U.5 (panels fold, focus mode) should know.
