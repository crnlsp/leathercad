# The window, refined — the plan for 1.5 (U.1 – U.20)

> **For agentic workers:** one slice per session. Start one with `/slice U.n`, or hand it to the
> `ui-refinement` agent ([`.claude/agents/ui-refinement.md`](../../../.claude/agents/ui-refinement.md)),
> which follows this document. Cite the requirement ids (`R-01` …) in commits and pull requests.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** a maker gets more done at the bench: the pattern reads at every zoom, the board gets the
room, the sizes sit where the eye already is, and the next step is one click away — while not one
printed line moves.

**What this is:** the UI/UX final audit's requirements, checked against the code and cut into
vertical slices. A refinement pass, not a redesign.

**Spec:** [`2026-10-08-ui-refinement-requirements.md`](../specs/2026-10-08-ui-refinement-requirements.md)
(R-01 … R-16 and the ground rules) and its
[mockups](../specs/2026-10-08-ui-refinement-mockups/). The mockups are not pixel specs: where an
image and the text disagree, the text wins.

**Roadmap:** [1.5 — the window, refined](../../roadmap.md#15--the-next-release), the next release.

**Stack:** React in `apps/desktop/src/renderer`; tokens in `packages/render/src/theme/`; the
canvas2d and svg screen backends in `packages/render`; Playwright for the E2E and pixel tests.

---

## 0. What to work on first

| Order | What | Waits on | Who |
|---|---|---|---|
| 1 | ✅ **1.4, released as 1.3.5** on 2026-10-09, with U.1 to U.3: [the record](../../history/roadmap-1.3.5.md) | — | — |
| 2 | **U.1 Pieces read as pieces** | nothing | the `ui-refinement` agent, from 2026-10-08 |
| 3 | U.2 → U.19, in this document's order, which puts U.20 in Phase 2 | the slices named under each | one session per slice |

**Why U.1 comes first:**

- **Nothing left in 1.4 needs building.** Q27 needs two tools, R1 paper and a steel
  rule. An agent's hours go furthest in 1.5.
- **It is the smallest change with the largest visible effect.** Every piece reads as leather on
  the board, at every zoom, and only the screen backends change, so printed output cannot move.
- **It settles what *zoom* means for every later slice.** Today the zoom bands and the grid tiers
  compare *device* pixels per millimetre, and every screen-constant width is in device pixels, so
  on a 2× display the grid and the stitch detail switch at half the zoom and every line draws half
  as thick. R-01's "below 40 %", R-03's percentage and its *true size* all need one definition of
  zoom, and U.1 writes it.

**The order of phases is the spec's, with two moves.** R-10 (tooltips) and the keys of §2 and §6
come forward into Phase 1 as U.3, because U.4, U.5 and U.7 add controls whose tooltips show a key,
and `Shift+1`, `[`, `]` and `\` cannot be bound until keys are matched by where they are on the
keyboard. And R-15 (My tools) leads Phase 3, because R-14 and R-16 read its defaults.

**Merging.** An agent opens a pull request into `develop` and never merges it. A 1.5 slice merged
before 1.4 is cut ships in 1.4: either cut 1.4 first, or move that slice's line into 1.4 when it
merges.

---

## 1. How every slice here is done

The project's loop ([`CONTRIBUTING.md`](../../../CONTRIBUTING.md#a-change-is-a-vertical-slice) and
the `vertical-slice` skill), with the parts this pass leans on hardest.

1. **Look before changing.** Run the app at the sizes the slice names, take *before* screenshots,
   and write down the numbers it is about — a zoom, a width, a contrast ratio. Then answer the
   slice's ***Find out first*** list from the running app and the code. Several of those questions
   exist because reading the code turned up something that looked wrong: settle each with evidence,
   and say in the pull request what you found.
2. **Trace the real flow.** Read the files the slice names, then grep every caller of what you will
   change. A fix goes where all the callers route through, not into the one path the slice names.
3. **Test first where there is logic.** A pure function — a layout, a placement, a parser, a key
   matcher — or a command gets its unit and property tests before any component uses it
   (`docs/testing.md`). Then the component.
4. **Build the smallest change** that meets the acceptance criteria.
5. **Look again.** The same screenshots, beside the mockups the slice names. Adjust until it reads as
   the text says: the mockups give proportions, order and states, not pixels.
6. **Prove print did not move.** Nothing in this pass changes printed output (spec §1). The export
   tests, the golden fixtures and the `.lcp` fixtures pass unchanged — quote the output.
7. **Run everything.** `pnpm check`; `pnpm test:e2e`; and when the canvas or the chrome changed,
   `pnpm build && pnpm test:visual --update-snapshots`, then look at **every** changed image before
   committing it.
8. **Docs in the same commit.** Tick the slice in `docs/roadmap.md` and write under it what the
   slice found; grep the docs for the old numbers and correct them; record a decision where it will
   be read.
9. **Land it** as `/slice` says: a branch, the commit, a push (the hook runs `pnpm check`), and
   `gh pr create --base develop`. Never merge.

**Fix what you find on the way.** A bug or a plain gap inside the area being worked on is fixed in
the same slice, with a regression test, not recorded for later to keep the diff small. Only a real
product decision is raised: write it under *Decisions for the maintainer* in the pull request,
take the default this document recommends, and keep going.

**When something looks wrong, debug it** — the `superpowers:systematic-debugging` skill: reproduce
it, find the cause, then fix the cause. A screenshot that disagrees with a mockup is a question
("why?"), not a number to nudge.

### Looking at the app

- `pnpm dev` runs it with hot reload. Help › *Open sample project* (or the empty Parts panel's offer
  of it) loads the bifold wallet the mockups show.
- **Repeatable screenshots:** a scratch Playwright spec beside the E2E tests, never committed. Run it
  with `pnpm build && pnpm exec playwright test e2e/look.spec.ts`, then open the PNGs.

  ```ts
  // e2e/look.spec.ts — scratch, delete before committing
  import { test } from '@playwright/test';

  import { launchApp } from './launchApp.js';

  const SIZES = [
    [1920, 1080],
    [1440, 900],
    [1280, 800],
    [1024, 700],
    [860, 600],
  ] as const;

  test('look', async () => {
    // A Chromium switch after the app's directory reaches Chromium; '2' for a HiDPI pass.
    const app = await launchApp({ args: ['--force-device-scale-factor=1'] });
    const window = await app.firstWindow();
    console.log('devicePixelRatio', await window.evaluate(() => devicePixelRatio));
    await window.getByTestId('open-sample').click();
    for (const [width, height] of SIZES) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setSize(size[0], size[1]),
        [width, height] as const,
      );
      await window.waitForTimeout(300);
      await window.screenshot({ path: `test-results/look-${String(width)}.png` });
    }
    await app.close();
  });
  ```

- **A 2× display:** `--force-device-scale-factor=2`, and check the logged `devicePixelRatio` reads
  2 — if it does not, say so rather than trusting the picture.
- **High contrast and reduced motion:** `await window.emulateMedia({ forcedColors: 'active' })`, and
  `{ reducedMotion: 'reduce' }`.
- **Another keyboard layout:** unit-test the matcher with synthetic events — German
  `{ code: 'BracketLeft', key: 'ü' }`, French `{ code: 'KeyQ', key: 'a' }`. To try it for real,
  switch the system's layout and press the keys.
- **Contrast is computed, not judged:** a test in `packages/render/src/theme/theme.test.ts` for each
  token pair a slice promises a ratio for.
- **A true-size check:** in devtools, a 100 mm line at 100 % is 377.95 CSS px long (96 ÷ 25.4 px per
  mm).

---

## 2. Global constraints

Every slice's acceptance criteria include these: the spec's §1–§3 and `CLAUDE.md`, values verbatim.

- **Printed output must not change.** The model stays in millimetres. Everything added on screen
  (fills, labels, chips, the selection bar) never prints.
- **Keep:** the layout — rail | Parts | canvas (options row above, Problems drawer below) |
  Properties; Design and Sheets as separate views; the rail's icon + name + key, grouped Draw /
  Place / Modify; the dark shell around the cream drafting ground, with a mm grid, rulers and Y up;
  the right-click menu, the Print dialog, the Problems drawer, the empty-window guidance, and
  disabled controls that say why.
- **Wording:** sentence case and the app's own words — Outline, Stitch line, Stitch holes, Fold,
  Cut-out, Marking, Hardware, Seam allowance. *Pitch* is the iron's nominal spacing; *Spacing* is
  what the fit achieved. Labels stay short and allow 30 % longer translations. No words inside
  icons, and no uppercase with letter-spacing.
- **Every word on screen is in `apps/desktop/src/locales/en.json`,** reached through `t()`, plurals
  as CLDR keys; no package below `apps/desktop` holds a sentence (ADR 0018).
- **Style:** IBM Plex Sans 400/500/600 only; a 4 px spacing rhythm; radii of 3 px, 5 px and pill;
  only dialogs cast a shadow; motion of 120 ms or less, on colour only. Never gradients, blur,
  textures, emoji, large radii or dashboard cards.
- **Tokens live in `packages/render/src/theme/`** and reach the stylesheet through `cssVariables()`;
  `styles.css` defines no value of its own, and an audit test holds it to that.
- **Sizes:** desktop only, from 1920 down to the 860 × 600 minimum.
- **Keyboard:** every action works from the keyboard. `:focus-visible` shows a solid 2 px ring:
  `accent` on the shell, `accent-ground` on the canvas. No keyboard traps.
- **Shortcuts:** `CmdOrCtrl`, shown as ⌘ on macOS; bound by physical key (`KeyboardEvent.code`) and
  shown as the local character; every one listed in Settings › Keyboard shortcuts, and rebindable
  from U.12.
- **Contrast:** WCAG 2.2 AA. Text 4.5:1; marks, borders and focus rings 3:1. Severity always shows
  as a colour **and** a glyph.
- **Names and announcements:** every icon-only control has an accessible name and a tooltip with its
  key. Changes in status (the problem count, the save state) are announced politely, once.
- **Targets** at least 24 × 24 px. **Reduced motion** honoured. In **`forced-colors`**, two-tone
  buttons, the mode switch and chips get real borders.
- **Pixels exist only in `packages/render` and `packages/editor/viewport.ts`** (invariant 1). A
  thumbnail's fit, a chip's position, a pinned caption: the millimetre-to-pixel arithmetic is in
  `render`; a component places what it returns.
- **No float equality and no local epsilon** (invariant 7); **user input is quantised** to 1e-4 mm
  before it is stored (invariant 8).
- **No new dependency without an ADR.** None should be needed: the menu, tooltip, dialog and tab
  list exist.

---

## 3. The spec's names in this codebase

The spec names tokens the way its mockup tool did. Sampled from the mockups' pixels on 2026-10-08,
they map onto the theme as below. A new value goes into `palette.ts`, `tokens.ts` or `canvas.ts`,
and `css.ts` projects it onto `:root`.

| Spec | In the code today | Value | |
|---|---|---|---|
| `shell-0` … `shell-3` | `SHELL[900]` … `SHELL[600]`; `--shell-900` … `--shell-600` | #14161A · #1B1D21 · #22252A · #2A2E34 | exists. The status bar is shell-0; bars, panels and the selection bar shell-1; Export PDF's main half shell-3 |
| `accent` / `accent-ground` | `ACCENT.tan` / `ACCENT.tanInk`; `--tan` / `--tan-ink` | #C9A227 / #A8810E | exists |
| `ground` · `ink` | `GROUND.ground` · `GROUND.ink` | #F1EEE8 · #1D2126 | exists |
| `text-dim` / `text-muted` | `SHELL.textDim` / `SHELL.textMute`; `--text-dim` / `--text-mute` | #8B929B / #6B7079 | exists. `text-muted` only for disabled controls and placeholders; never `text-dim` on `shell-3` (4.3:1) |
| `warning` / `error` | `STATE.shell`; `--warning` / `--error` | #D9891F / #E5675F | exists |
| `geo-measure` | `ROLE_STYLES.annotation.colour` | #8A5A2B | exists: dimensions and their numbers |
| `piece-fill` / `piece-fill-selected` | — | #FAF8F4 / #F7F1DE | **new**, U.1 |
| `outline-stroke` | `ROLE_STYLES.cut.widthPx` = 1.75 | 1.5 px | **changed**, U.1. Grid lines stay 1 px |
| `canvas-label` | `CANVAS.caption` = `GROUND.inkDim` #6E695E | #5E5950, 6.0:1 on the ground | **new**, U.2 ✅: `GROUND.label`, `--ground-label`; replaces the light grey for canvas text |
| `canvas-name` · `canvas-meta` · `canvas-value` | — | 12/16 at 600 · 400 · 500 | **new** type tokens, U.2 ✅: `CANVAS.text.name` · `.meta` · `.value`, with `CANVAS.text.haloPx` 4 |
| `canvas-text-min` | — | 12 px | **new**, U.2 ✅: `CANVAS.text.minPx` |
| `primary` | `GO.go` #46B46B | **#F1EEE8** | **changed**, U.7 ✅: `ACTION.primary`, `--primary`; Print's main half, in the paper colour. Green is retired from actions: it reads as the fold colour. `GO` is gone |
| `primary-side` | — | #D2CBBD (the value of `GROUND.major`) | **new**, U.7 ✅: `ACTION.primarySide`, `--primary-side` |
| `secondary-side` | — | #3A3F47 | **new**, U.7 ✅: `ACTION.secondarySide`, `--secondary-side` |
| `on-primary` | `GO.onGo` #1D2126 | #14161A | **changed**, U.7 ✅: `ACTION.onPrimary`, `--on-primary`; AA on `primary`, `primary-side`, `warning` and `error` |
| `rail-wide` / `rail-narrow` | `RAIL_PX` 152 / 52 | 152 / **56** px | **changed**, U.5 ✅: `RAIL_PX`, `--rail-w-expanded` / `--rail-w-collapsed` |
| `parts-width` / `properties-width` | `--parts-w` 220 and `--properties-w` 288 (264 below 1280), written in `styles.css` | 224 / 264 px | **changed**, U.5 ✅, into the theme: `PANEL_PX.parts` / `.properties`, `--parts-width` / `--properties-width`; and `PANEL_PX.partsNarrow` 208 below 1280, `--parts-width-narrow` |
| `panel-strip` · `row-height` | — | 40 px · 28 px (a Parts row was 34) | **new**, U.5 ✅ (`PANEL_PX.strip`, `--panel-strip`) and U.8 ✅ (`DENSITY.*.row`, `--row-height`: 28, 24 compact) |
| `sheets-desk` · `paper` · `sheet-margin` | `SHEET`, `theme/sheets.ts` | #D6D1C7 · #FFFFFF · #D9579B | unchanged, recorded |

---

## 4. The spec's questions, answered from the code

The spec's §7 asks for five checks before building.

1. **Do the new keys clash?** `Ctrl+E` is already *Export PDF*, `Ctrl+P` *Print*, `Ctrl+1` and
   `Ctrl+2` the views, `Ctrl+,` Settings, `Ctrl+=` and `Ctrl+−` zoom (`renderer/src/shortcuts.ts`,
   `App.tsx` 345–406). **One real change: `Ctrl+0` fits the drawing today (8.4b) and becomes *true
   size*;** fitting moves to `Shift+1`. `[`, `]`, `\`, `Shift+1`, `Shift+2`, `F1` and `F6` are free;
   `?` and `Ctrl+/` already open the shortcut list. `T` is Rotate in Design, and would have been Turn
   on Sheets, which goes (3). `Space` and `F2` are new and belong to the Parts tree alone.
2. **Is the window frameless?** No. 8.7 decided the window keeps the system's title bar
   ([top-bar spec](../specs/2026-09-29-top-bar-and-settings-design.md) §2), so §2's title-bar rule
   does not apply. Its edited flag does: `BrowserWindow.setDocumentEdited` is never called (U.7).
3. **Can a piece be turned by hand on Sheets?** No. The sheet plan is derived from the export scene
   and the page setup alone and is never stored (`packages/export/src/sheetPlan.ts`); 7.8's packer
   turns a piece only to save a sheet. A hand turn would be a new, persisted placement — a new
   feature. **So the Turn button and the rail's Turn are dropped, and *Turned 90°* stays as a
   read-out** (U.9).
4. **Job totals in empty Properties?** Yes, in U.6. Mockup 01 shows them, every number already
   exists — the parts and their Cut, the hole counts from evaluation, the sheet plan — and *pieces
   to cut, holes to punch, sheets to print* is what a maker plans a session at the bench from.
5. **Icons and the shadow:** keep the app's own icons (Lucide for generic verbs, ADR 0017, and the
   eleven LeatherCAD marks), and the dialogs' `--elevation-raised`.

**Found while reading the code**, each given to the slice it belongs to:

| What | Where | Slice |
|---|---|---|
| The zoom bands and grid tiers compare **device** pixels per millimetre, and display-list widths are device pixels: on a 2× display the grid and the stitch detail switch at half the zoom, and every line, halo and slit is half as thick | `CanvasHost.tsx` 465 passes `view.scale`; `renderGrid` compares it; `canvas2d/backend.ts` sets `lineWidth = widthPx / perMm`; the backing store is `width × dpr` (`CanvasHost.tsx` 517); `ViewportView` has no `dpr` | U.1 ✅ |
| One function words a piece for screen and paper, in English, below the app (`describePart`); R-01 changes only the screen's words | `render/src/captions.ts`, `buildDisplayList.ts` `captionsFor`, `export/src/scene.ts` | U.2 ✅ |
| Keys are matched by `event.key`, so `[`, `]`, `\` and `Shift+1` fail on layouts where they need AltGr or type another character | `App.tsx` 345–406 | U.3 |
| Keys are written into catalogue strings — "Settings (Ctrl+,)", "(Ctrl+E)", "(Ctrl+2)" — so macOS reads *Ctrl*, and no rebinding could reach them | `en.json` `projectBar.*Tooltip`, the view switch's tooltips | U.3 |
| The thin-column tooltip (mockup 16): it is laid out at the anchor's left, shrinks to the gap left before the window's edge, and only then is measured and clamped. It never flips above | `Tooltip.tsx`, its `ref` callback; `.tooltip { max-width: 280px }` | U.3 |
| The rail folds below 1200 px to 52 px; Properties becomes an overlay below 1024 | `App.tsx` 161 and 184; `.workspace` in `styles.css` | U.5 |
| A piece's thumbnail is a millimetre-to-pixel fit, which only `packages/render` may do | — | U.5 |
| Every existing `preferences.json` already stores `legendOpen: false`: the whole object is written on any change, a recent file included, so a new default reaches new installs only | `main/preferences.ts` `replace` | U.10 |
| The legend's "collapsed by default" was a deliberate F.7 decision, which R-09 reverses | `CanvasLegend.tsx` header comment | U.10 |
| No tool acts on the Sheets view, so R-08's Measure would be new behaviour | `CanvasHost.tsx` 742 | U.9 |
| The irons are a hard-coded list of three makers' brands | `renderer/src/irons.ts` `IRON_PRESETS` | U.13 |
| Fold thickness is stored and consumed by nothing | `domain/src/feature.ts` `FoldLine.materialThicknessMm` | U.13 |

---

## 5. The slices

Each slice is roughly 200–600 lines of production code; bigger is two slices. Sizes are the
spec's, or an estimate where a slice joins requirements. Every slice's *Done when* includes §2.

### Phase 1 — the canvas, the keys and the frame

#### U.1 Pieces read as pieces — R-02 · S · mockups 07, 01

**For the maker.** On today's board a piece is a line on a gridded ground: the inside of a pocket
and the ground around it look the same, and on a busy board it takes a second look to tell what is
leather. Filled pieces with the grid lifted out of them read like cut pieces on a cutting mat, at
any zoom — and on a 2× display the lines stop being half as thick as they should be.

**Today.**
- The grid: `CANVAS.grid` in `theme/canvas.ts` — 1 mm from 4 px/mm, 10 mm from 0.6, 100 mm always
  — drawn first by `renderGrid` (`render/src/canvas2d/grid.ts`), under everything.
- The cut line: `ROLE_STYLES.cut.widthPx` 1.75 (`theme/roles.ts`). Export prints `widthMm`.
- `buildDisplayList` already emits `fill` items — the seam allowance's band — collected per part in
  `beneath` and spliced in at `partStart`; the canvas fills them even-odd (`canvas2d/backend.ts`).
  The SVG screen backend draws the same list.
- The Sheets view is drawn by `packages/export/src/sheetsDisplay.ts`, and print by the export scene:
  neither calls `buildDisplayList` (its only other caller is `export.bench.ts`). A fill added there
  is the Design canvas's alone.
- Zoom is device pixels per millimetre everywhere (*Found while reading*, above).

**Build.**
- Tokens `piece-fill` #FAF8F4 and `piece-fill-selected` #F7F1DE (`GROUND.pieceFill`,
  `GROUND.pieceFillSelected`, `--ground-piece-fill…` through `css.ts`'s existing loop), and the cut
  line at 1.5 px on screen.
- **One fill per piece**, beneath every part's bands, hatches, halos and lines — *as built, all the
  pieces' fills come first in the list, not first in each part, so a piece laid over another never
  hides its lines*: the piece's closed outer contour, with its closed cut-outs, filled even-odd
  — a slot shows the ground through it, as a hole in leather does, and keeps its hatch. *As built:
  a piece with a seam allowance has one outer contour, not two — the edge grown from the stitch
  line is the outline (S5 refuses a second) — so the fill is that edge and the band draws over
  it.* No closed outer contour, no fill; a hidden outline, no fill; a hidden cut-out is filled
  over.
- **The selected piece** takes `piece-fill-selected` when any of its features is in the `selected`
  set the halo already reads — which covers a part picked by its heading, since `CanvasHost` passes
  its features. Never compute a second notion of selection.
- **Zoom, defined once.** `ViewportView` gains `dpr`; `view.ts` gains
  `TRUE_SIZE_CSS_PX_PER_MM = 96 / 25.4`, `cssPxPerMm(view)` and `zoomPercent(view)`. Then:
  - the grid tiers are thresholds in CSS px per mm: the 1 mm grid from 6 (≈ 160 %), the 10 mm grid
    from 1.5 (≈ 40 %), the 100 mm grid always; colours unchanged;
  - the zoom bands (`CANVAS.bands`) and the slit floor read CSS px per mm too — `CanvasHost` passes
    `pxPerMm: cssPxPerMm(view)` (*as built*: the division stays in `render`);
  - the backend multiplies every screen-constant width (strokes, halos, hatches, ticks, slits,
    markers) by `view.dpr`, in one place in each screen backend.
- Since the fill is opaque and drawn after the grid, no grid line shows inside a piece: no clipping
  is needed.

**Find out first.**
- [x] *Before* screenshots of the sample at 23 %, 60 %, 160 % and 300 % (mockup 07's four) at
      `devicePixelRatio` 1 and 2. Write down where each grid tier appears: by the code today, the
      1 mm grid at 106 % and the 10 mm at 16 % on a 1× display, and 53 % and 8 % on a 2× one.
- [x] Every place that multiplies by `dpr` before handing something to a backend — the rulers'
      style in `CanvasHost.tsx` 484–491, `tapeJoins(…, { dpr })`, anything else grep finds. Once
      the backend scales by `view.dpr`, each of these would scale twice: decide each one.
- [x] Which `beneath`/`items` order the SVG screen backend keeps, and whether it fills even-odd.
- [x] What `pnpm test:perf` measures for the display list (the 636-hole strap took 87 µs). One fill
      path per piece should not move it; check.

**Done when — check in the app.**
- [x] Every piece is filled #FAF8F4; the one being worked on — any of its features selected, or
      picked by its heading — #F7F1DE. A cut-out shows the ground and keeps its hatch. A piece with
      a seam allowance is filled to its outer edge, the allowance band still visible.
- [x] No grid line is visible inside a piece at any zoom.
- [x] The 1 mm grid appears from 160 % and the 10 mm grid from 40 %, at the same percentage on a 1×
      and a 2× display.
- [x] Cut lines are 1.5 CSS px and grid lines 1 CSS px — on a 2× display, 3 and 2 device px. The
      other lines, the halos and the slits have the same CSS width at 1× and 2×.
- [x] Print did not move: the export tests, the golden fixtures and the `.lcp` fixtures pass
      unchanged, and nothing under `packages/export` changed but what a test needed.
- [x] Mockups 07 and 01 beside the *after* screenshots, in the pull request.

**Tests.** `buildDisplayList`: the piece fill, its colour and order, cut-outs, the seam-allowance
case, an open outline, a hidden outline, the selected piece. `view.ts`: `zoomPercent` is 100 at
`scale = dpr × 96 / 25.4` for any `dpr`, as a property. The grid: which tiers are drawn depends on
CSS px per mm alone, for any `dpr`, as a property. The backend: a width is multiplied by `view.dpr`
exactly once. Then the pixel baselines.

**Watch for.** A test fixture building `ViewportView` by hand now needs `dpr`: give it 1, never a
default that hides a missing one. The export bench calls `buildDisplayList` too — fine, it measures.

**Docs.** The UI Foundations spec states the old grid thresholds (§9.1): grep for `4 px/mm` and
`0.6`, and correct them where they are stated as current. The roadmap's U.1 line.

**Not here.** Caption and dimension text (U.2). The zoom control (U.4).

**As built (2026-10-08).** What the plan above did not know:

- `pnpm test:perf` measures the domain's regeneration budget only. The display list is in
  `pnpm bench`'s export bench: 85 µs before, 81 µs after on one machine — the fill costs nothing.
- Two more sites multiplied by `dpr` before a backend: `sheetsView(…, { dpr })` (the Sheets view's
  labels and the printable area's dash) besides `tapeJoins`. Both lost the option: the backends
  scale now. The rulers draw in CSS pixels themselves; `CanvasHost` passes the plain style.
- The editor had the same fault four more times — the snap glyph, Edit Points' handles, the
  polyline's close radius and the drag threshold were device pixels. `Viewport.pxToMm` and
  `pickToleranceMm` now go through `render`'s `pixelsToMm`, which is CSS pixels; the unused
  `Viewport.mmToPx` went.
- Thresholds as measured in the app: the 1 mm grid from 158.75 %, the 10 mm from 39.7 % (6 and
  1.5 CSS px per mm exactly), on a 1× and a 2× display alike.


**Steps.**

- [x] **1. Branch.** `git switch -c feat/ui-pieces-read-as-pieces` from the branch carrying this
      plan, or from `develop` once the plan is merged.
- [x] **2. Before.** The screenshots and the numbers in *Find out first*.
- [x] **3. Zoom, test first.** In `render/src/view.test.ts`, which already imports `fc` and has a
      `view` fixture (give it `dpr: 1`), add `TRUE_SIZE_CSS_PX_PER_MM`, `cssPxPerMm` and
      `zoomPercent` to the `./view.js` import, and:

  ```ts
  describe('zoom as the maker reads it', () => {
    it('is 100 % at true size, whatever the display', () => {
      fc.assert(
        fc.property(fc.constantFrom(1, 1.25, 1.5, 2, 3), (dpr) => {
          const view = {
            centreMm: { x: 0, y: 0 },
            scale: dpr * TRUE_SIZE_CSS_PX_PER_MM,
            widthPx: 800,
            heightPx: 600,
            dpr,
          };
          expect(zoomPercent(view)).toBeCloseTo(100, 9);
          expect(cssPxPerMm(view)).toBeCloseTo(96 / 25.4, 9);
        }),
      );
    });
  });
  ```

  Run `pnpm test view` — it fails: `zoomPercent` does not exist. Add `dpr` to `ViewportView`
  (*as built*: `Viewport` has `dpr`, but `toView()` did not hand it over), then the constant and the two functions in `view.ts`,
  exported from `render/src/index.ts`. Run it again: it passes; `pnpm typecheck` names every
  fixture that needs `dpr: 1`.
- [x] **4. The grid by CSS pixels, test first.** In `canvas2d/grid.test.ts`, with the file's own
      `recorder()`: at `dpr` 2 and `scale` 2 × 5.9 the 1 mm grid's colour is not stroked, at
      2 × 6.0 it is; the same at `dpr` 1 with 5.9 and 6.0; the 10 mm grid's at 1.49 and 1.5. Then
      the property: for any `dpr` and any CSS px per mm, the strokes recorded at that CSS density are
      the same set. Change `CANVAS.grid` to CSS thresholds (`minCssPxPerMm: 6`, `1.5`, `0`) and
      `renderGrid` to compare `cssPxPerMm(view)`. *As built: the key stays `minPxPerMm`, like
      every other `…PxPerMm` in `CANVAS`, whose doc says they are all CSS pixels now.*
- [x] **5. Widths times `dpr`, test first.** In `canvas2d/backend.test.ts`: a path item with
      `widthPx` 1.5 strokes at `lineWidth × perMm = 3` when `view.dpr` is 2, and at 1.5 when it is 1.
      Make the backend multiply in one place; do the same in `svg/backend.ts`. Then fix each
      double-scaling site found in step 2, with `CanvasHost` passing `pxPerMm: cssPxPerMm(view)`.
- [x] **6. The piece fill, test first.** In `buildDisplayList.test.ts`, with its `outline` fixture
      and `resolved()` helper:

  ```ts
  const fills = (items: readonly DisplayItem[]) => items.filter((item) => item.kind === 'fill');

  it('fills a piece with the paper-pale piece colour, before anything else in it', () => {
    const list = buildDisplayList(resolved([outline]));
    expect(fills(list.items)).toEqual([
      expect.objectContaining({ colour: GROUND.pieceFill, paths: [expect.anything()] }),
    ]);
    expect(list.items.findIndex((item) => item.kind === 'fill')).toBeLessThan(
      list.items.findIndex((item) => item.kind === 'path'),
    );
  });

  it('fills the piece being worked on in the selected colour', () => {
    const list = buildDisplayList(resolved([outline]), { selected: new Set(['cut-1']) });
    expect(fills(list.items)[0]).toMatchObject({ colour: GROUND.pieceFillSelected });
  });
  ```

  Add the cut-out case (a closed `role: 'inner'` contour is the fill's second path), the seam
  allowance case (only the outermost outer contour is filled), an open outline and a hidden one
  (no fill). Then the tokens, and the fill in `buildDisplayList`.
- [x] **7. The cut line at 1.5 px** in `ROLE_STYLES.cut.widthPx`. `widthMm` does not move.
- [x] **8. Look again.** The same screenshots at 1× and 2×, beside mockups 07 and 01.
- [x] **9. Prove print did not move**, then `pnpm check`, `pnpm test:e2e`, and the pixel baselines:
      `pnpm build && pnpm test:visual --update-snapshots`, every image looked at.
- [x] **10. Docs and roadmap**, then commit —
      `feat(desktop): pieces are filled on the board, and the grid and lines keep their size on any display (U.1)`
      — push, and open the pull request into `develop`.

---

#### U.2 Captions and dimension numbers readable at every zoom — R-01 · M · mockups 07, 01

**For the maker.** At 60 % — the zoom a whole wallet fits at — a piece's name is about 6 px tall
and a dimension's number cannot be read, so a maker zooms in just to read what they drew. Names and
numbers should read at a glance at every zoom; the printed caption stays the true size it is on the
pattern.

**Today.**
- Captions are document text: glyph outlines laid out in millimetres — `CAPTION_SIZE_MM` 2.8 and
  `STITCHING_CAPTION_SIZE_MM` 2.2 in `render/src/captions.ts` — placed above the part's drawn bounds
  by `captionsFor` in `buildDisplayList.ts`, in `CANVAS.caption` (#6E695E). They grow with the zoom.
- A dimension's number is the placed layout evaluation made, in millimetres, drawn as glyphs.
- The words: `describePart` ("Card pocket — cut 2") and `describeStitching` ("52 holes · 3.85 mm ·
  KS Blade"), English, in `packages/render`. Paper prints `describePart` (`export/src/scene.ts`);
  the iron line is the screen's alone.
- The rulers already draw screen-constant text in the vendored face (`vendoredFamily()`,
  `canvas2d/grid.ts`): the model to follow.

**Build.**
- **Screen text**: a display item anchored at a millimetre point and set at a pixel size, drawn by
  both screen backends in the vendored IBM Plex Sans: `canvas-name` (600), `canvas-meta` (400) and
  `canvas-value` (500), all 12/16, never under `canvas-text-min` 12 px — 24 device px on a 2×
  display. A 4 px `ground` halo behind each, so it reads over the grid, a piece or a line.
- **Captions:** the name in `ink` and `canvas-name`; the detail line in `canvas-label` #5E5950 and
  `canvas-meta`. **Below 40 %** (`zoomPercent`, U.1) the name only. **When a piece's top is above
  the canvas** while the piece is still on screen, its caption pins to the canvas's top-left.
- **The words** read "Card pocket ×2" over "52 holes · 3.85 mm" on screen — no ×1 for a piece cut
  once. They are interface text now, so they come from `en.json` (`×{{count}}`, a plural for the
  holes) and reach `buildDisplayList` as data the app supplies — for example a
  `captionFor(part) → { name, detail }` option — never written in `packages/render` (ADR 0018). The
  detail drops the iron's name; a piece stitched with two pitches lists both.
- **Paper keeps** `describePart` and its millimetre sizes: "Card pocket — cut 2" at 2.8 mm.
- **Dimension numbers** draw at `canvas-value` in `geo-measure` (#8A5A2B) at the anchor the
  evaluated layout gives, on screen only; a printed dimension keeps its glyphs.

**Find out first.**
- [x] The text size today at 23, 60, 160 and 300 %: 2.8 mm × CSS px per mm. Note it.
- [x] How the part's caption avoids a dimension above the piece today (the number's millimetre box
      counts towards the part's extent). With screen-sized numbers, decide how the two stay apart
      — the conversion happens in `render`.
- [x] Whether anything hit-tests a caption or a number's box (`packages/editor/src/hitTest.ts`). If
      so, it follows the screen-sized box.
- [x] The vendored outlines are Regular only (ADR 0011), so 600 and 500 come from the DOM's
      `@font-face`. Check the canvas has the face loaded before the first paint, or the first frame
      draws a fallback.

**Done when — check in the app.**
- [x] At 23, 60, 160 and 300 %, every caption and dimension number is 12 px, crisp, and readable
      over the grid, a piece or a line.
- [x] On a 2× display it is the same size to the eye.
- [x] Below 40 % captions show the name only.
- [x] A long strap scrolled until its top leaves the canvas keeps its caption at the canvas's
      top-left until the strap itself leaves the screen.
- [x] Captions read "Card pocket ×2" / "52 holes · 3.85 mm".
- [x] A printed sheet still reads "Card pocket — cut 2" at 2.8 mm, and the export tests and
      fixtures pass unchanged.
- [x] `pnpm test locales` passes, and no screen caption word is left in `packages/render`.

**Tests.** `buildDisplayList`: screen text items, their tokens, name only below 40 %, the pinned
position, the words passed in. Contrast: `canvas-label` on `ground` ≥ 6.0:1, `geo-measure` on
`ground` ≥ 4.5:1. Locales.

**Docs.** UI Foundations §13 (the caption), ADR 0018's note on what stays English (paper still
does), the roadmap.

**Not here.** Chips on dimension lines (U.14). The Sheets view's captions (U.9).

**As built (2026-10-08).** What the plan above did not know:

- **Measured before**, from the canvas's own `fillText` calls on the sample wallet: the name
  (2.8 mm) was 2.43 / 6.35 / 16.93 / 31.75 CSS px at 23 / 60 / 160 / 300 %, the iron line (2.2 mm)
  1.91 / 4.99 / 13.30 / 24.94, the dimension's number (3 mm) 2.61 / 6.80 / 18.14 / 34.01 — the
  same CSS size at 2×, twice the device pixels. **After**, 12 CSS px at every zoom: 24 device px
  at 2×, in 600, 400 and 500.
- **The board's words are `overlay-text`** with three optional fields — `weight`, `halo` and
  `rotationRad` — rather than a new item kind; `boardTextItem` makes one in a `CANVAS.text` voice.
  Both backends draw the halo as a stroke of the ground under the glyphs, 2 × 4 px wide, round
  joined, and turn a number through `worldToCss`, so neither has a flip of its own.
- **`buildDisplayList` takes `caption: (part) => { name, detail }`** in place of `captions: boolean`
  — without it, no caption — and **`view`**, from which it reads the zoom and the canvas inside the
  rulers (`CANVAS.ruler` now holds the rulers' thicknesses). `describeStitching` and its iron-name
  trimming went; `stitchingOf(part)` is the facts — holes per nominal pitch, grouped with
  `approxEq` — and `renderer/src/captionWords.ts` says them from `caption.*` in `en.json`.
- **The dimension's number is centred on its line's middle**, its baseline half a capital below,
  so the figures sit on the line and their halo breaks it, as mockup 07 draws "—95.0—". Its screen
  box, halo included, counts towards the part's extent at the current zoom, so the caption clears
  it at any zoom (a property test). Nothing hit-tests a caption or a number's glyphs:
  `hitTest` reads `entry.path`, the dimension and extension lines.
- **Pinned sooner than the requirement says**: once the caption would run under the ruler, not only
  once the piece's top is off. Otherwise a piece whose top is within 36 px of the ruler has its name
  hidden — at 60 % on the sample, the Outer's. Pinned at the canvas's top-left exactly, 12 px in, as
  mockup 07 draws it; two pinned captions stack instead of overprinting. Fit's 60 px margin leaves
  every caption above its piece.
- **The weights were not loaded for the canvas**: `CanvasHost` loaded Regular only, and the Medium
  and SemiBold the DOM loaded on its own. It now loads all three before repainting.
- **"Tape join" on the board was 11 px**, under `canvas-text-min`; it is 12. The rulers stay at
  `--t-num-micro`'s 11 px: they are the frame, not the drawing's words.
- `pnpm test:visual`: only `stitched-panel.png` changed — its caption. The Sheets view's reference
  did not move.

---

#### U.3 Keys by where they are, shown as caps, and tooltips that fit — §2 *Shortcuts*, §6, R-10 · M · mockups 16, 12

**For the maker.** A maker with a German, French or Polish keyboard cannot press `[`, `\` or
`Shift+1` the way a US keyboard names them, and on a Mac every tooltip says *Ctrl*. Every key
should work by where it is on the keyboard, be shown as the maker's keyboard prints it, and every
tooltip should be one readable line that stays inside the window.

**Today.**
- One window `keydown` handler, `App.tsx` 345–406, matches `event.key`: Ctrl+S, O, N, E, P, 1, 2,
  `/`, `,`, `=`/`+`, `-`, `0`; `?`; then the tool letters from `ALL_TOOLS` (`tools.ts`). The tools
  handle their own keys (Shift, Enter, Backspace, A and L mid-polyline, R while editing points).
- `SHORTCUT_GROUPS` (`shortcuts.ts`) lists keys as Electron accelerators (`CmdOrCtrl+S`); `keysFor`
  shows ⌘ ⌥ ⇧ on macOS. Settings › Keyboard shortcuts shows it, read-only.
- `Tooltip.tsx`: 400 ms, placed under the anchor's left edge, then clamped once it has a width —
  but by then it has already shrunk to the gap before the window's edge: the thin column of mockup
  16. It never flips above. `max-width: 280px`.
- Keys inside catalogue sentences (*Found while reading*, above).

**Build.**
- **One keymap**, `renderer/src/keymap.ts`: every command the window answers to — an id, its
  default binding as `KeyboardEvent.code` (`KeyS`, `Digit1`, `BracketLeft`, `Backslash`, `Equal`,
  `Minus`, `Slash`, `Comma`, `F1`, `F6`) with modifiers (`mod` is Ctrl, ⌘ on macOS; `shift`;
  `alt`), and its scope (window, canvas, the Parts tree). `matches(event, binding)` reads
  `event.code` and the modifiers, never `event.key`. The window handler dispatches through it, and
  `SHORTCUT_GROUPS` is derived from it, so the list cannot describe a key the app does not have
  (the existing shortcut-map test keeps holding the menus to it).
- **Letters keep their letter.** By position alone, the French layout would put Arc on the key that
  prints Q and Measure on the one that prints a comma. So a default that is a letter — the tool
  keys — or `?` is resolved once, at start, to the key that types it on this layout
  (`navigator.keyboard.getLayoutMap()`, reversed); punctuation and digits keep their US position.
  Either way it is matched by `code`. *Recommended default; a decision for the maintainer if
  anyone disagrees.* *As built: a letter is matched by the letter the press typed — the freshest
  word on the layout there is, which follows a layout switched mid-session and needs no
  asynchronous start — and found at its US place only on a keyboard whose key there types no
  Latin letter (Cyrillic, Greek). The layout map is read for showing keys only. See As built.*
- **Shown as the local character:** the layout map turns a code into what this keyboard prints
  (`BracketLeft` → `ü` in German); the US name when the API or the key is missing; ⌘ ⌥ ⇧ on macOS.
- **A key cap** component (the rail's `kbd` look) and `Tooltip` gains a key: it shows the caps after
  the text. Every "(Ctrl+…)" leaves `en.json`; keys come from the keymap.
- **Tooltips (R-10):** one line up to 360 px, then wrapping at that width, never narrower — measured
  off-screen at `width: max-content; max-width: 360px` before it is placed. It flips above when
  there is no room below and shifts to stay 8 px inside the window. 500 ms on hover; at once on
  keyboard focus; Esc hides it.
- New keys are bound by the slices that need them (U.4, U.5, U.7, U.8, U.17): each adds its command
  to the keymap.

**Find out first.**
- [x] Every key handler: grep `keydown`, `onKeyDown` and `addEventListener` in the renderer and
      `packages/editor`. Which are window commands (the keymap's) and which a tool's own (they stay,
      and are listed)? *Window commands: `App.tsx`'s handler (Ctrl+S, O, N, E, P, 1, 2, `/`, `,`,
      `=`/`+`, `-`, `0`, `?`, the tool letters) and `CanvasHost`'s Ctrl+Z / Ctrl+Shift+Z — now all
      through the keymap. The main process's F11 and Ctrl+Q (`windowKeyFor`) stay there, matched
      through the keymap too — Ctrl+Q did not quit on a Cyrillic layout. A tool's own, matched in `packages/editor` and listed: Escape (every
      tool), Delete/Backspace (Select, Edit Points), Enter, Backspace, A and L (polyline), Backspace
      (arc), R (Edit Points). Native roles stay as they are: dialogs' Escape, `NumberField`'s Enter,
      Escape and arrows, menus' arrows, Home, End and Tab, the Settings tab list.*
- [x] Whether `navigator.keyboard.getLayoutMap()` answers in this Electron, in the sandboxed renderer
      — try it in `pnpm dev`'s devtools — and what it returns for `BracketLeft` and `KeyQ`. *Yes, in
      the built app's sandboxed renderer: 48 keys; `[` and `q` on a US layout. With the system's
      layout switched (`setxkbmap de`, the app on X11) it answers `ü` for `BracketLeft`, `z` for
      `KeyY`, `ß` for `Minus` — and `'` for `Equal`, Chromium's stand-in for the dead acute.*
- [x] Reproduce the thin column: hover *Sheets* at the window's right edge at 860 px. *A 68 × 126 px
      column, five lines, flush with the window's edge (0 px inside, not 8).*

**Done when — check in the app.**
- [x] With a German layout — the system's, or synthetic events in the tests — every window key does
      what it did with a US one.
- [x] Every key shown anywhere — tooltips, the rail, menus, the shortcut list — comes from the
      keymap, as caps; on macOS Ctrl shows as ⌘; no `en.json` string contains a key.
- [x] A tooltip at the window's right edge is one line up to 360 px and 8 px inside the window; near
      the bottom it opens above.
- [x] Hover shows after 500 ms; Tab shows it at once; Esc hides it.

**Tests.** The keymap: matching by `code` with the modifiers, `mod` as Meta on macOS and Ctrl
elsewhere, no two commands bound alike in one scope, every binding in the derived list. Tooltip
placement as a pure function — `placeTooltip(anchor, bubble, window) → { left, top, above }` — with
the property that it stays 8 px inside whenever it fits and is never narrower than
`min(360, natural width)`. E2E: the right-edge tooltip at 860 px is one line. `isTyping` unchanged.

**Watch for.** Zoom in is `=` or `+` as typed, and also `NumpadAdd` (see *As built*). On a layout where `?` is Shift with another
key, the hint must still read `?` — it is bound by character. Tooltips on disabled controls stay
with `ReasonedButton`.

**Docs.** `docs/getting-started.md`'s keys; `docs/architecture.md` if it describes key handling;
the roadmap.

**As built (2026-10-09).** What the plan above did not know:

- **Letters by what the press typed.** `matches` reads `event.code` and exactly the modifiers held
  — Ctrl+Alt+S, which is AltGr+S on Windows, is not Ctrl+S — except for a letter key, which is
  the key that *typed* that letter: French `{ code: 'KeyQ', key: 'a' }` is Arc. Reading the press
  rather than a map resolved at start follows a layout switched while the app runs (a maker
  switching between French and English would otherwise have A and Q swapped until a restart) and
  works in the main process too, which has no layout map: `windowKeyFor` matches F11 and Ctrl+Q
  through the keymap. A keyboard with no Latin letters there
  (`к`, `λ`) finds the letter at its US place; a Latin letter with a mark (`ą`, AltGr+A in Polish)
  never does. A key that types a letter is that letter's and never the punctuation key at its
  place — Dvorak types z where a US keyboard has `/`, and Ctrl there undoes — so one press is never
  two commands, which a property holds. `?` is the one character binding.
- **The tools hear the same letter.** `CanvasHost` hands a tool `keyForTools(event)`, so on a
  Cyrillic keyboard the polyline claims A mid-run on the key the window would otherwise take for
  the Arc tool and throw the run away — a fault the keymap would have brought in.
- **Exactly the modifiers.** Today's handler ignored Shift on every Ctrl key and took Meta for Ctrl
  everywhere, so Ctrl+Shift+P printed and Super+S saved on Linux. Now a key is its binding: `mod` is
  ⌘ on macOS and Ctrl elsewhere, Shift and Alt as written. The twins that did work are kept as
  `aliases` — heard, never shown: Ctrl+Shift+= (`+`) and the numeric keypad's +, −, 0, 1 and 2.
- **Shown, not matched, by the layout map**, read at start and whenever the window regains focus
  (Chromium has no layout-change event): punctuation as this keyboard prints it, letters and
  digits as themselves — every keyboard prints the digit on its key — and the US character
  without a map. ⌥⇧⌘ in macOS's order, joined.
- **The keymap's scopes** are `window` (dispatched through `commandFor`) and the tools' own
  (`canvas`, `polyline`, `points`), listed so the list is whole and so a sentence can name them.
  The shortcut list is the keymap plus three rows that are the pointer's, not keys: scroll to zoom,
  middle- or Alt-drag to pan, Shift held while drawing.
- **Keys in sentences** — the tools' how-to lines, the empty Parts and Properties, a drawn path's
  note, the text-scaling refusal — are `{{placeholders}}` filled from the keymap; a test holds
  `en.json` to it. The key catalogue names Delete *Del* and Escape *Esc*, as keyboards print them.
- **Zoom follows its + and −, on review.** By position, a German keyboard's Ctrl+- opened the
  shortcut list (it is where a US keyboard has `/`), Ctrl+ß and the dead ´ zoomed, and Ctrl++ did
  nothing; a French one lost Ctrl+- (its − is on the 6 key). Before U.3 the window matched what a
  key types, and all of those zoomed. §2 binds by place *so that* `[ ] \ Shift+1` work where they
  need AltGr; + and − need none on any layout, and are named by their symbols as a tool by its
  letter. So zoom's `=`, `+` and `-` are bindings by character, with the command key, Shift aside.
  A digit bound at its place keeps it — Ctrl+1 is Design where that key types `+` (Czech) — and a
  key that types a bound character is not the punctuation at its place. The caps show a command's
  keys as pressed on this layout through the same matching, so the list never offers a key that
  does something else: on a German keyboard *Zoom in* reads `Ctrl++` and the list is reached by `?`.
  Ctrl+, stays by place (French `Ctrl+;`): rare, and the gear is beside it.
- **Found on the way:** the problem badge's tooltip was English written into the code — "2
  problems, worst: error" — in a template literal the untranslated-words audit did not read. It is
  in the catalogue now, and the audit reads strings and templates in a said attribute's
  expression, though not a key handed to `t()`.

**Not here.** Changing a key in Settings (U.12).

---

#### U.4 A zoom control, and true size — R-03 · S · mockup 12

**Needs** U.1 (`zoomPercent`) and U.3 (the keymap).

**For the maker.** A maker checks a piece against a real thing — a card, a phone, a buckle — held
against the screen. That needs a zoom that can say *true size*, and one click back to the whole
pattern. Today zoom is the wheel and three keys, and no zoom is ever shown as a number.

**Today.** `CanvasHandle` (`CanvasHost.tsx` 78) has `zoom(factor)`, `fit()` and `frame(bounds)`.
Ctrl+= and Ctrl+− zoom by `ZOOM_STEP`; **Ctrl+0 fits**; a double-click on empty board fits. No
percentage; `CanvasStatus.scale` is device px per mm. No *fit selection*. No screen calibration
(*Later*).

**Build.**
- At the canvas's bottom-right, inset 16 px, on the shell: − · zoom % · + · Fit.
- **100 % is true size:** `TRUE_SIZE_CSS_PX_PER_MM` from U.1. There is no calibrated *actual size*
  (the screen-calibration step is in *Later*), so 100 % is the CSS reference pixel; keep it one
  constant, so that step replaces one number. Nothing here claims a physical measurement.
- The percentage opens a menu (the existing `Menu`): Fit drawing `Shift+1`, Fit selection `Shift+2`,
  True size, 100 % `Ctrl+0`, 50 %, 200 %, 400 % — about the canvas's centre.
- Keys: `Ctrl+=`, `Ctrl+−`, `Shift+1`, `Shift+2`, and **`Ctrl+0` becomes true size**. Fit selection
  frames what is selected — a part picked by its heading included — and with nothing selected it is
  disabled and says why.
- Double-click on empty canvas still fits, and the Fit tooltip says so.
- The same control drives the Sheets camera (mockup 04).

**Find out first.**
- [x] `ZOOM_STEP`, `FIT_PADDING_PX`, and what `fit()` frames on Sheets. *1.25 and 60 CSS px. On
      Sheets, `fit()` frames the sheets' whole extent on the Sheets camera; `frame(bounds)` always
      moves the Design camera, which its one caller, going to a problem, switches to first.*
- [x] At 860 × 600 the control, the legend (bottom-left) and the Problems drawer share the canvas's
      foot: check nothing overlaps (mockup 05). *The legend is at the canvas's top-right until U.10
      moves it; the drawer is the canvas's sibling below it, so it shrinks the canvas and cannot
      overlap. At 860 × 600 with the drawer open the canvas is 355 px tall and the open menu fits
      above the control with 185 px to spare.*

**Done when — check in the app.**
- [x] The control shows a whole percentage that follows the wheel live.
- [x] Ctrl+0 or *True size*: a 100 mm line is 377.95 CSS px long, measured in devtools, at 1× and 2×.
- [x] Shift+1 fits the drawing; Shift+2 the selection, or is disabled with its reason; 50, 200 and
      400 % from the menu. Works on Sheets.
- [x] Every part reachable by Tab, named, with a tooltip and its key; the menu works from the
      keyboard and gives focus back.

**Tests.** Percentage and scale as a round trip (property); the selection's bounds, a picked part
included (unit); E2E for Ctrl+0, Shift+1 and the menu.

**Docs.** `docs/getting-started.md` (Ctrl+0 no longer fits), the shortcut list, the roadmap.

**As built (2026-10-09).** What the plan above did not know:

- **The status carried the wrong zoom.** `CanvasStatus.scale` was the Design camera's device
  pixels per millimetre, sent only when the pointer, a notice or the sheet under the pointer
  changed. Measured: after a wheel zoom and `Ctrl+=` it said 124.5 % for a board at 155.6 %; on
  Sheets it said the board's zoom for paper at 27.6 %. It is `zoomPercent` now, read off whichever
  camera is painted as each frame is — every change to a camera repaints, so the wheel, a key, the
  menu, a fit, a resize, the Sheets view framing its paper and a change of view all reach it.
- **One extent for both fits**: `drawnBounds(resolved, only?)` in `packages/document`, beside
  `selectedFeatureIds` — every visible feature that resolved, or those selected. The double-click
  fit used to frame hidden features too, which the board does not draw; and *Fit selection* of a
  feature that failed to build, which has no path, is refused like an empty selection.
- **The zoom lives in the camera**: `scaleAtZoomPercent` in `render/view.ts` (the inverse of
  `zoomPercent`) and `Viewport.zoomToPercent`, which keeps the canvas centre's millimetre still.
  `CanvasHandle` gains `zoomTo(percent)` and `fitSelection()`; `App` runs each zoom command
  through one table, for its key and the control alike.
- **Keys**: `fit` is `Shift+1` (`{ code: 'Digit1', shift: true }`), `fitSelection` `Shift+2`, and
  `trueSize` `Ctrl+0` with the keypad's 0. No keypad twin for Shift+1: with Num Lock on, Windows
  turns Shift with the keypad's 1 into End. The digits keep their place, so `?` typed on a 1 key is still Fit.
- **Fit selection on Sheets is refused**, with its reason, rather than framing the picked piece's
  placement: a piece can sit on two sheets, or twice, and the sheets have no such query yet.
- **Choosing from a menu by keyboard dropped focus** to the page. `MenuButton` gives it back to the
  button, as Escape did, unless the item moved it — a dialog it opened keeps it.
- **The menu opens upwards** (`MenuButton`'s `above`): the canvas clips what runs below it.
- **A press with the mouse leaves the keys to the board** (review, 2026-10-12): a control button
  kept focus after a click, so the Enter that finishes a polyline — or a Space — pressed it again
  (80 % became 64 %). Its buttons let go of focus after a pointer press, and a menu item chosen by
  the pointer leaves focus with the page, as before U.4; from the keyboard, focus stays.
- **The zoom survives a change of display ratio**: `Viewport.resize` kept device pixels per
  millimetre, so a window moved from a 1× to a 2× screen went from 100 % to 50 % (measured with
  the page's zoom factor at 2). It now scales the camera by the ratio's change.
- **− and + step along a ladder**, not ×1.25 (`ZOOM_STEP` is gone): `ZOOM_STOPS` and
  `nextZoomStop` in `render/view.ts`, `Viewport.stepZoom`, and `CanvasHandle.step` in place of
  `zoom(factor)`. The stops are 1, 2, 5, 10, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400,
  600, 800, 1200, 1600, 3200, 6400 and 10 000 %. Up and down are judged on the whole percentage
  the control shows (`shownZoomPercent`), so 99.6 % is on the 100 stop. Buttons and keys zoom
  about the centre; the wheel stays continuous.
- **The zoom limits are percentages**, `ZOOM_LIMITS` 1 % and 10 000 %, the same on every display.
  `Viewport.MIN_SCALE` and `MAX_SCALE` were device pixels per mm: 1.3 % to 10 583 % at 1×, and
  0.66 % to 5 291 % at 2×.
- `pnpm test:visual`: all three references changed, each only inside the control's 175 × 30 px box.
  The visual test's deselecting click and the README's Sheets picture moved to the bottom-left
  corner, which the control does not cover.

---

#### U.5 Panels fold, and focus mode — R-04, §5 · M · mockups 10, 05

**Needs** U.3.

**For the maker.** On a laptop the board is a 490 px slot between two panels, and most of the time
the maker needs the board. A panel folded to a 40 px strip — or both, with `\` — gives the drawing
the room, and nothing ever becomes unreachable.

**Today.** `.workspace` in `styles.css` (about lines 118–175): rail | Parts 220 | canvas |
Properties 288 (264 below 1280). Properties becomes an overlay below 1024 (`propertiesOverlay`),
Parts below 900 (`partsOverlay`), each opened by a status-bar chip that exists only then
(`App.tsx` 749–770). The rail folds itself below 1200 px, to 52 px (`App.tsx` 161). Panel headers
have no toggle; there is no focus mode; only `legendOpen`, `toolRailCollapsed` and `language` are
remembered. F.2's rule stands: no panel is ever removed — the tree is the only way to a locked
feature.

**Build.**
- The tokens: `rail-wide` 152 / `rail-narrow` 56, `parts-width` 224, `properties-width` 264,
  `panel-strip` 40, into the theme.
- **A toggle in each panel header**, with its key: `[` Parts, `]` Properties. **`\` is focus mode:**
  both panels hide and the rail shows keys only; `\` again, or Esc when nothing else claims it — a
  drawing in progress, an open menu or overlay go first — restores exactly what was there.
- **A folded panel is a 40 px strip,** icons only, no rotated text. Parts: one thumbnail per piece —
  a click selects the piece, the tooltip names it, a ×N badge. Properties: the selection's icon,
  with a tooltip naming the selection.
- **From a strip, a panel opens as a non-modal overlay:** it takes focus, gives it back when it
  closes, and closes on Esc or a click on the canvas. Tab can leave it.
- **The status bar always has three chips:** Parts `[`, Focus `\`, Properties `]`; a hidden panel's
  chip has the accent border. **Nothing may become unreachable.**
- **§5's table:** the rail drops its names below 1280; Properties folds to a strip below 1280 (was
  an overlay below 1024); Parts becomes an overlay below 900; at 1024 Parts is docked at 208. The
  maker's own choices are remembered; a narrow window's automatic folding never overwrites them —
  the rail's `railExpandedWhileNarrow` is the pattern.
- **Thumbnails** are an outline fitted into a box of pixels, so the fit is a function in
  `packages/render` returning an SVG path; U.8's tree reuses it.
- **The drawing stays put** when a panel folds: F.3's `reframe`.

**Find out first.**
- [x] The canvas's width today at 1920, 1440, 1280, 1024 and 860 — the spec says 1260, 780, 620,
      about 490 and 804. Confirm or correct the *today* column with the numbers you measure.
      *Measured at 1×: 1260, 780, 620, 488 and **808** — at 860 the rail was 52 px, not the 56 the
      spec's 804 assumed.*
- [x] Fold a panel and watch a point of the drawing: does `reframe` run when the grid's columns
      change, or only on a window resize? *On any change of the canvas's box: `CanvasHost`'s
      `ResizeObserver` watches the canvas's container and reframes by how far its left and top
      edges moved, so a column changing width is the same to it as the window's. Measured: the
      millimetre under a window point is the same with Parts folded, in focus mode and back.*

**Done when — check in the app.**
- [x] The canvas is 1280, 800 (1384 in focus mode), 640, 720 and 804 px wide at 1920, 1440, 1280,
      1024 and 860.
- [x] `[`, `]`, `\` and Esc out of focus mode work, on a German layout too.
- [x] Strips: Parts' thumbnails select their pieces; Properties' icon names the selection; the
      overlay takes focus, gives it back, and closes on Esc or a canvas click.
- [x] Three chips, always; every panel reachable at every size, by mouse and by keyboard.
- [x] Choices survive a restart, and an automatic fold does not change them.
- [x] Folding a panel does not move the drawing.

**Tests.** A pure `layoutFor(width, height, choices, focus)` → each panel docked, strip or overlay,
with the property that every panel is reachable at every size. The preferences' new flags, read
and validated as the existing ones are. E2E at the five widths.

**Docs.** UI Foundations' layout rules, the shortcut list, the roadmap.

**As built (2026-10-13).** What the plan above did not know:

- **One function decides the frame**: `layoutFor(room, choices, focus)` in
  `renderer/src/panelLayout.ts`, where `room` is `roomAt(width)` — `wide` from 1280 px, `narrow`
  from 900, `cramped` below — and each panel is `docked`, `strip` or `hidden` (only its chip). The
  window says it to the stylesheet as classes on `.workspace`; the widths are the theme's. The
  property test: every panel not docked is shown by its toggle, at every width, with any choices,
  in or out of focus mode.
- **What a toggle does depends on the room**, one rule for its key, its header's button, its
  strip's and its chip (`toggleOf`): where the panel can take a column — Properties from 1280,
  Parts from 900 — it folds or unfolds it, which is the maker's choice and remembered; where it
  cannot, or in focus mode, it opens the panel over the board for now. So a narrow window's
  folding never writes a choice, and widening it again brings back what the maker had. In focus
  mode `[` and `]` open a panel over the board rather than ending it.
- **The overlay is the panel itself**, kept in its place in the DOM (F.2) and shown absolutely
  over the board beside its strip, `z-index` 8, above the zoom control and the legend. It takes
  focus as a whole (`tabIndex` −1) rather than on its first button, which would take the Enter
  that finishes a polyline; Tab goes on into it and out of it. Esc pressed in it closes it first;
  a field being typed in, or a menu open in it, keeps Esc. A keyboard close gives focus back to the
  opener; a press on the board closes it and leaves focus where the press put it (U.4's rule).
  One at a time, and a change of room or of focus mode closes it.
- **Esc has one owner per press.** The tools never claimed Escape — none needed to, with nothing
  else on it — so one press would have cancelled a drawing and left focus mode. A tool now claims
  it when it gives something up (a gesture, a picked point, or Select's selection), and the window
  takes it after: an open overlay, then focus mode. With a piece selected in focus mode, the first
  Esc clears the selection and the second brings the panels back.
- **Keys:** `toggleParts` `[`, `toggleProperties` `]` and `focusMode` `\` (`BracketLeft`,
  `BracketRight`, `Backslash`), by place, so a German keyboard folds on `ü`, `+` and `#`. Focus mode
  has `IntlBackslash` as a twin, heard and never shown: it is where a British keyboard prints `\`.
  The rail has no toggle in focus mode.
- **Thumbnails:** `thumbnailPath(outline, box, insetPx = 1)` in `packages/render` (`thumbnail.ts`),
  an SVG path in the box's pixels, fitted by `thumbnailView` through `worldToScreen`, so Y is up as
  on the board and no flip is derived. The strip draws each piece's outer contour
  (`materialOf(…).outer`) at 24 × 16, and a piece that has none the piece mark. **U.8 reuses it.**
- **Preferences:** `partsFolded` and `propertiesFolded`, read and validated as the other flags,
  each falling back on its own. Focus mode is the session's.
- **The German `+` key, bare, folds Properties**: it is where a US keyboard has `]`. With the
  command key it still zooms in, as U.3 decided.
- **Found on the way:** `linkTickOn` took the longest run with a bare `>`, so of a rectangle's
  equal top and bottom the last bit of a float chose — the pixel reference's panel, drawn 10 px
  further right on the wider board, wore its tick at the bottom. Longer by more than `EPS_LENGTH`
  now, so the first of equal runs keeps it.
- **The chips** — Parts `[` · Focus `\` · Properties `]` — sit by the cursor readout, 24 px
  targets in a bar of a fixed 28 px, its height before U.5: `BAR_PX.status` (`--status-bar-h`),
  beside the work bar's 36, which moved into the theme with it (`BAR_PX.work`, `--work-bar-h`).
  Set by its content, the bar had grown a pixel with the chips, and 37 px below 1024 with the old
  narrow-window chips.
- **Rows stay as they were at 208 px.** At 220 "Stitch holes" fitted one line; at 208, with the
  tree scrolling at 1024 × 700, it had 58 px of its 65 and wrapped. Parts takes Properties' thin
  scrollbar and a 12 px right padding, and has 67. Names still wrap rather than truncate (F.6):
  "Cut-out mirrored" wrapped at 220 too, and is U.8's. A chip whose panel is not open has the accent border
  (`Highlight` in forced colours). A button pressed by the pointer lets go of focus, as the zoom
  control's do.

---

#### U.6 Properties: order, weight and job totals — R-05, §7 question 4 · S/M · mockups 02, 11, 01

**Needs** U.3; U.5 for the 264 px width.

**For the maker.** The stitch-holes panel is where a maker chooses iron, pitch and fit, then reads
whether the spacing came out right. Today those sit among six equal Flip, Mirror and Delete
buttons. The order should follow the work — set the iron, read the result, name it, arrange it,
and delete it last — and with nothing selected the panel should say what the job is: pieces to cut,
holes to punch, sheets to print.

**Today.** `PropertyPanel.tsx`: header; the feature editor — for a hole set `StitchHoleSetEditor`
(Iron from `IRON_PRESETS`, Pitch, Fit, Corners, then Holes, Spacing, Runs); problems; a Flip
section of two buttons; Mirror ↔, Mirror ↕ and *Mirror across fold*; Delete. `PartFields` (Name,
Cut) for a part.

**Build.**
- **A hole set, top to bottom:** Iron, Pitch, Fit, Corners · Holes, Spacing and Runs as 17/22
  readouts (`--t-num-lg`) · one line comparing spacing with pitch, with a glyph ("Spacing matches
  the pitch" with a check; "Spacing is stretched 1.8 %" with the warning glyph, the words R-14
  uses) · Name, Follows · Arrange · Delete.
- **"Matches" is decided by what is shown:** the difference rounds to 0.0 % at the precision
  displayed. No new epsilon (invariant 7).
- **Arrange:** Flip ↔ ↕ and Mirror ↔ ↕ as icon pairs with tooltips, plus *Across fold* with its
  label. The existing disabled reasons stay.
- **Delete alone in a footer under a rule:** red, with its glyph and the `Del` cap; undoable. At 600
  px tall Properties scrolls and Delete stays fixed at its foot.
- **A feature's subtitle** names the piece and its Cut: "Outer · Cut ×1 › Stitch line › Stitch
  holes". Name and Cut fields show only when the piece or its outline is selected.
- **Field labels 68 px** wide, so "A hole on each corner" fits.
- **Room for a third readout line** (hole matching, thread length — not built; no placeholder).
- **Empty Properties: the job.** The project's name; *Pieces* 3 · 4 to cut; *Holes* 250 · 146 + 52
  ×2; *Sheets* 2 · A4, portrait. Pieces that do not print (hidden) are not counted to cut — say how
  you decided in the pull request.

**Find out first.**
- [x] Where Holes, Spacing and Runs come from, and whether the domain already reports spacing
      against pitch. *The domain's `StitchHoles`: `count`, `achievedPitchMm` over the whole set
      (length ÷ gaps) and each run's own. The domain judges spacing only past a quarter of the
      pitch (`HOLE_SPACING_DEVIATION`, a problem) and runs that differ by 5 %
      (`HOLE_SPACING_UNEVEN`): rules worth a problem, not the number. First built
      to a tenth of a percent, finer than the Spacing readout's 0.01 mm, the line read *stretched
      0.1 %* under *3.85 mm*; it now matches when the readout shows the Pitch field's number. Its
      warning glyph is Problems' own verdict (`HOLE_SPACING_DEVIATION`), so the two cannot
      disagree.*
- [x] Which panels share the Flip and Mirror buttons — the part's and the feature's — so both move.
      *The feature's has Flip, Mirror and Across fold; the part's (`PartProperties`) Flip alone.
      Both have Arrange and the footer now. The right-click menu's Flip shares the icons.*

**Done when — check in the app.** Mockup 02's order for a hole set; mockup 11's Arrange and
Delete; the subtitle; mockup 01's totals with nothing selected; at 860 × 600 Properties scrolls with
Delete pinned; every disabled button still says why.

**Tests.** The comparison line's rule (unit, with the rounding edge); the totals from a project
(unit: Cut, hidden pieces, several irons); E2E for the order and the footer.

**As built (2026-10-09).** What the plan above did not know:

- **The order for every kind**, R-05's kinds of thing: what it is made of and what that came out
  as (the editor, then *Measured*, then its problems); its name, what it follows and the notes
  about that, and — for an outline only — the piece's name and Cut, its field labelled *Piece* so
  it is never a second *Name* beside the outline's own; what to make next (*Add stitch
  line*, *Add holes*, *Add seam allowance*, in the order the work goes); Arrange; Delete. A rule
  edge to edge between those groups. The feature-kind heading went: the trail ends with the kind.
- **The trail** is the piece and its Cut, the names of what the feature follows, root first, and
  the feature's kind — "Outer · Cut ×1 › Stitch line › Stitch holes". The piece's own outline is left
  out (the piece's name stands for it), another piece's outline is named by its piece, and the last
  word is the kind rather than the name, so a set renamed "Main seam" still says it is stitch holes
  (`trailOf`, `renderer/src/propertyFacts.ts`).
- **"Matches" means the Spacing readout shows the Pitch field's number** (`spacingAgainstPitch`,
  `renderer/src/spacing.ts`; the maintainer's decision on the pull request, option C). Both are
  shown by `formatSpacing` at `SPACING_DECIMALS` (2), and the decision compares those two strings:
  no epsilon, and the line can never contradict the two numbers above it. Built first to a tenth
  of a percent, the sample's outer — 562.57 mm over 146 gaps, 3.8532 mm, 0.08 % over — read
  *stretched 0.1 %* under *3.85 mm*, where mockup 02 draws a check; it now reads *Spacing matches
  the pitch*. Otherwise the difference is said to the tenth of a percent, and readouts that differ
  by less than that (a 20 mm pitch's hundredth is 0.05 %) read *less than 0.1 %*, never 0.0 %.
- **The glyph is Problems' verdict, not the line's** (`spacingGlyph`): the warning glyph only when
  Problems reports `HOLE_SPACING_DEVIATION` for the set (past a quarter of the pitch), and then at
  the problem's own severity; otherwise a check when it matches, and a plain stretch or squeeze
  mark (Lucide's unfold and fold) when it does not. The Build line above asked for the warning
  glyph at any difference: that put a warning on the sample's 0.003 mm while Problems said
  *Nothing to fix*. R-14's selection bar should take the same functions — `spacingAgainstPitch`,
  `spacingGlyph`, `describeSpacing` and `formatSpacing` for its own spacing number — so the bar,
  Properties and Problems say one thing. Fewer than two holes show
  no line: there is no spacing, and Problems says why.
- **Properties' scrollbar is thin** and its selects end at the chevron: at 264 px a scrolling panel
  (1024 × 700) left the Corners select 140 px for "A hole on each corner"'s 147.
- **Totals count what prints** (`jobTotals`): every piece towards *Pieces*, but only those on the
  sheet plan — not hidden, not failed — towards *to cut* and the holes, each set times its piece's
  Cut, a hidden set left out. *Holes* lists each set ("146 + 52 ×2"), and only when that adds
  something to the total. An empty project shows no totals.
- **Lucide 1.x's flip aliases are swapped**: `FlipHorizontal2` is now
  `TrianglesCenterlineDashedHorizontal`, a level line with a shape above and below — a
  top-to-bottom flip — and the right-click menu's *Flip horizontal* and the parts list's mirror
  mark showed it. Flip and Mirror's faces are picked by drawing, once, in
  `icons/arrange.ts`, with a test reading what each draws.
- **The 68 px column wraps *Edge margin*** onto two lines; every other label fits. "A hole on each
  corner" fits whole at 264 px (it was clipped at 860 px, beside 88 px).
- At 288 px with a scrollbar — the overlay below 1024 px — *Across fold* wraps under Mirror's
  icons; the row wraps rather than scrolls sideways.
- Naming a piece drawn in *Stitch + allowance* takes a click on its outline or its heading: that
  mode leaves the stitch line selected, which no longer shows Name and Cut.

---

#### U.7 The top bar in three zones — R-06, §2 *edited flag* and *announcements* · M · mockup 08

**Needs** U.3; the token changes of §3.

**For the maker.** The top bar should answer three questions at a glance: is my work saved, am I
designing or checking the sheets, and is the pattern ready to print — with its problems shown on
Print itself, before paper and leather are wasted.

**Today.** `ProjectBar.tsx`: the Project menu button and the name; the save state; Save; the sheet
indicator (`SheetIndicator.tsx`: sheet glyphs and a select, "2 sheets of A4, portrait"); *Export
PDF* with a chevron menu (*Export SVG…*); *Print*, green (`--go`); a rule; Settings and Help. The
Design | Sheets switch (`ViewSwitch.tsx`) sits at the work bar's right (`App.tsx` 657). The problem
count is only in the status bar. Tooltips carry their keys in their sentences.

**Build.**
- **Left:** the Project menu and the name are one control; a long name truncates with an ellipsis,
  its tooltip the full name. Then the save state — saved: a check, "Saved", Save disabled with the
  tooltip "Nothing to save"; unsaved: an open dot, "Unsaved changes", Save enabled with its cap.
- **Centre:** Design | Sheets as a pill switch on a dark track, moved here from the work bar: a pen
  nib for Design; stacked sheets and the sheet count for Sheets; the active tab raised, with an
  accent outline and an accent icon. A tab list: arrow keys move, `Ctrl+1` / `Ctrl+2` switch.
- **Right:** a quiet paper button, "2 × A4 portrait", opening a popover — Paper, Portrait/Landscape,
  "2 sheets · scale 100 %, locked · nothing taped", *See the sheets* (`Ctrl+2`). It replaces the
  sheet indicator. Then two **two-tone split buttons**, no icons on their main halves and no borders,
  each half its own button with its own accessible name:
  - **Export PDF:** the main half (`shell-3`) does what *Export PDF* does today (`Ctrl+E`); the
    narrow half (`secondary-side`) holds the chevron and opens the export menu.
  - **Print**, the only primary button: the main half `primary` with "Print" in `on-primary`
    (`Ctrl+P`). The narrow half is **the problems indicator** — a check on `primary-side` when there
    is nothing to fix; △ and the count on `warning`; the error glyph and the count on `error`, which
    outranks warnings, with a tooltip listing both. A click opens the Problems drawer. Print stays
    enabled, and **the Print dialog lists the problems first** (it does not mention them today).
  - Hover lightens the main half; focus rings the whole button.
- **Far right:** a hairline, Settings (`Ctrl+,`) and Help (`F1`, new) as quiet icon buttons.
- **At 1024 px:** "2 × A4", "Unsaved", Save without its cap. **At 860 px:** the paper button shows
  "2" and the save state only its dot; both split buttons keep their labels.
- **§2:** the window's edited flag (`BrowserWindow.setDocumentEdited`, through a new `PlatformHost`
  method, its IPC channel and the fake); the save state and the problem count announced politely,
  once each, from an `aria-live` region; in `forced-colors`, the split buttons and the switch get
  real borders.
- **Green leaves the actions.** `GO` goes from the palette if nothing else uses it (grep, `pnpm
  knip`).

**Find out first.**
- [x] Is the project's name renamed in place today? If the name becomes part of the menu button,
      renaming must stay reachable — a *Rename…* item, or F2 on the name. A decision if neither fits.
      *Yes: an `<input>` in the bar dispatched `setProjectName` on every keystroke, so each letter
      was an undo step of its own. Per the roadmap's decision, *Rename…* in the Project menu turns
      the name back into that field; F2 stays the Parts tree's (§4).*
- [x] What *Export PDF* does on a second press: is anything remembered ("the last settings")?
      *Nothing: every press asks where, suggesting `<name>.pdf`. The paper and the way up are the
      project's own (`setPageSetup`), so "the last settings" are already what it exports with; the
      main half does what Export PDF did.*
- [x] Where severities are counted, so the indicator and the drawer can never disagree.
      *Twice, then neither: `exportReadiness` counted errors, warnings and infos in a loop of its
      own, `badgesOf` folds only the worst, and the drawer said a total. Now `countBySeverity` in
      `packages/domain/src/badges.ts`, read by the indicator, the drawer and the export notice.*

**Done when — check in the app.** Mockup 08's rows at 1920, 1024 and 860, nothing clipped or wrapped
at 860 (the existing E2E holds it); each half named on its own (the accessibility scan); the
indicator's three states with the drawer opening; the Print dialog listing problems first; the
switch by arrows and by `Ctrl+1`/`Ctrl+2`; `F1` opens Help; one announcement per change; the edited
flag set and cleared (checkable on a Mac only — say whether it was).

**Tests.** The indicator's state from a list of problems (unit); the split buttons and switch by
keyboard and their names (E2E); the 860 px fit (E2E); the edited flag through the fake host.

**Docs.** The top-bar spec's successor note, `docs/getting-started.md`, the roadmap; 7.6's text
calls Print green.

**As built (2026-10-14).** What the plan above did not know:

- **Every *Done when* line was checked in `e2e/top-bar.spec.ts`**: the bar at 1920, 1024 and 860
  px, one row, every control inside it, the words as R-06 says them at each; each half's name; the
  indicator clear, warning and error with the drawer opening and saying the same; the Print
  preview's list, the drawer's rows in the drawer's order, first in its options; the switch by the
  arrows, Home, `Ctrl+1` and `Ctrl+2`; F1; one announcement per change; the edited flag.
- **The edited flag was checked on Linux, not on a Mac**: the e2e replaces the window's
  `setDocumentEdited` in the main process and watches it go true on an edit and false on Save,
  through the real IPC channel (`platform:setDocumentEdited`). `InMemoryPlatformHost` keeps it
  too. Electron ignores it off macOS.
- **Renaming** (`NameField` in `ProjectBar.tsx`): Enter or leaving keeps the name, Escape puts it
  back, and the whole name is one undo step. From the keyboard, focus goes back to the menu's
  button. A menu item's `onChoose` now hears how it was chosen (`'keyboard' | 'pointer'`), optional,
  so U.4's rule can follow an item that replaces its own menu.
- **The indicator has a fourth state**, *to note*: the drawer lists infos (an empty part, uneven
  runs), so a check beside them would contradict it. Infos show the dot and their count on
  `primary-side` (`indicatorOf`, `renderer/src/problemsIndicator.ts`). Its count is of the worst
  severity alone, as R-06 draws it; the tooltip and its name say all of them ("1 error, 2
  warnings"), in the words the drawer's verdict and the export notice now share
  (`problems.counts.*`, `describeCounts`).
- **The paper popover splits the list in two**, as R-06 draws it: a paper list whose entries say
  their sheet count at the current way up ("A4 · 2 sheets"), and Portrait | Landscape, each
  tooltip saying what that way up takes ("1 sheet of A4, landscape") — so 7.4a's "see the result
  before choosing" holds. What is taped moved to the summary line. The popover takes focus,
  closes on Escape (giving focus back), a press outside or focus leaving.
- **Announcements**: one polite region in the bar with two spans, the save state's words and the
  problems'. Text that does not change is not touched, so it is not said again; and the problems
  hold still while a gesture is under way (`store.inTransaction`), so a drag does not read out
  every count it passes through.
- **Tokens**: `ACTION` in `palette.ts` — `primary` (`GROUND.ground`), `primaryHover`
  (`GROUND.pieceFill`), `primarySide` (`GROUND.major`), `secondarySide` #3A3F47, `onPrimary`
  (`SHELL[900]`) — as `--primary`, `--primary-hover`, `--primary-side`, `--secondary-side`,
  `--on-primary`. `GO` is gone; the print preview's *No scaling* check took `--text`. Contrast:
  `on-primary` ≥ 4.5 on all three fills and the shell's warning and error; `--text` ≥ 4.5 on both
  of Export's halves (`theme.test.ts`).
- **Rooms**: the bar's words follow U.5's `roomAt`: full from 1280, short ("2 × A4", *Unsaved*,
  Save without its cap) from 900, minimal below — so "at 1024" and "at 860" are the narrow and
  cramped rooms.
- **Print's dialog button** is in the paper's colour too: `.tool.primary` is that one button.
- **The pixel references**: only `empty-window.png` changed, and only inside the two bars; the
  other two clip to the board.
- **A resize races the room** (found on CI): `innerWidth` changes with the window, but the frame
  learns its room from media queries, which Chromium evaluates only when it next renders. U.5's
  860 px test pressed Enter on the Parts chip in between, so the key was heard by the wide
  layout and folded Parts instead of opening it over the board — 4 runs in 10 under CPU load
  on `develop` too, and every time on CI's runner for this branch. `e2e/windowSize.ts`'s
  `resizeWindow` now waits for the frame's own `data-room` as well; the specs that resize and
  then press or measure use it. A maker cannot press a key in that frame, so the app is
  unchanged but for the attribute.

---

### Phase 2 — panels, lists and small fixes

#### U.8 The Parts tree — R-07 · M · mockups 09, 01

**Needs** U.3; U.5 (the thumbnail and `row-height`).

**For the maker.** Parts is where a maker finds a locked feature, hides a pocket to see beneath it,
and checks a piece's Cut. It should read as pieces with what they are made of nested the way it is
built — outline, stitch line, holes — and show at rest only the numbers a maker cares about.

**Today.** `PartsList.tsx`: each part with its feature rows; lock and visibility toggles; a ⋯ menu;
the right-click menu (8.8); under each part a print line ("Sheet 1, turned"), in Design too. No
tree semantics or tree keyboard.

**Build.**
- Pieces fold open and closed: a chevron, a 24 × 16 outline thumbnail, the name, a `×N` pill when
  Cut is more than 1.
- Features indent under what they follow (Outline › Stitch line › Stitch holes), joined by thin
  elbows; 28 px rows; hole counts at the right.
- Lock and eye show on hover or keyboard focus, and stay visible while on (hidden, locked); the
  mirror mark always shows.
- Every row action is also on the right-click menu.
- "Sheet N, turned" leaves the Design view (it is Sheets' — U.9).
- Keys, scoped to the tree: Up and Down move; Right opens a piece; Left closes it or goes to its
  parent; Space toggles visibility; F2 renames. ARIA `tree` / `treeitem` with roving focus.
- Selecting on the canvas opens the piece and scrolls its row into view.

**Find out first.**
- [x] How features are ordered today, and whether a feature can follow two others. *Document
      order, nested by `featureTree`: a derived feature under its source within the part, drawn
      ones and followers of another part's features as roots. A feature follows at most one
      (`source.sourceId`); a dimension names two features, but as references, not sources, so
      it is a root.*
- [x] Which row actions the right-click menu lacks. *None: a piece's eye is the menu's Hide on
      every feature in it, its ⋯ holds Duplicate and Delete, and a feature's lock and eye are
      Lock and Hide. F2's rename is new and not on the menu — a decision below.*
- [x] How the list behaves with 30 features. *The sample with five copies of the lining, 32
      features: a click on a row changes the list in 3.0 ms on `develop` and 4.5 ms here (median
      of 60, click to the DOM's change), each piece's thumbnail fitted once per evaluation.*

**Done when — check in the app.**
- [x] Mockup 09's three states — at rest, hover and keyboard focus, the states that stay
      (`e2e/parts-tree.spec.ts`, and screenshots at 1440 and 1024).
- [x] The keys, with a screen reader's announcements sensible: rows are `treeitem`s named by
      their names, with level, position, expanded and selected, and *Hidden*, *Locked* or *Not
      printed* as their description; the scan passes with pieces open, closed and on Sheets.
- [x] A canvas click reveals its row: the piece opens, the row scrolls into view, focus stays.

**Tests.** The nesting from the derivation graph (unit); keyboard movement as a pure function over
the visible rows (unit); E2E for keys and reveal.

**As built (2026-10-14).** What the plan above did not know:

- **Rows as a function**: `treeRows(parts, closed)` and `treeMove(rows, at, key)` in
  `renderer/src/partsTree.ts`, with properties: Down from the first row reaches every row shown
  and Up comes back; Left from any feature reaches its piece one level at a time. A row's key is
  `part:<id>` or `feature:<id>`, since a piece and a feature may share an id. `revealed` is the
  selection's opening of its piece.
- **One flat tree**: `role="tree"` holds every row, `aria-level` says the nesting, and each
  piece's `section` (`part-section-<id>`, `role="none"`) only groups its rows. Nested groups would
  have named each piece by every feature in it. A row is named by its name alone; its state is
  its description. The Sheets view's print line and an empty piece's *Delete part* are inside the
  piece's row, where a tree allows them.
- **Selection follows focus**: ↑ and ↓ select the row they reach, so Delete acts on the row the
  maker is on; Enter selects, as the row's button did, and lets the key go on. Space, F2 and the
  arrows stop at the tree. Space and F2 are the keymap's (`scope: 'tree'`, group *In Parts*), so
  the shortcut list shows them and U.12 can change them; the window hears neither.
- **The row's buttons are out of the Tab order** (one Tab stop for the tree); the keyboard reaches
  what they do by Space and the right-click menu. Pressed by the pointer they let go of focus.
  `MenuButton` took a `tabIndex` for the piece's ⋯.
- **Lock and eye keep their room** at every row's end (on review, after #89; first built as an
  overlay that covered the hole count on hover): faded out at rest, shown on hover or keyboard
  focus, and nothing moves between the three — the row, the name and the count keep their boxes
  (`e2e/parts-tree.spec.ts`). A toggle that is on (hidden, locked) stays in sight at rest. The
  marks — mirror, *Not printed* — follow them. To pay for the 40 px, a level is 12 px and a row's
  parts 4 px apart (the mockup's 16 and 6), so at 208 px the fourth level's *Stitch holes* has 47
  px and wraps between its words rather than inside "Stitch" (29 px at the mockup's spacing). At
  224 and 208 px the deepest *Stitch holes* and *Cut-out mirrored* take two lines, and *Card
  pocket ×2* keeps its name on one but puts its marks on a line below; every other row keeps
  one. A piece's row holds the most, and hidden at 208 px — the crossed eye and the crossed
  printer both kept, as decided — it broke "Card pock / et": its marks now go below rather than
  the name breaking inside a word (`flex-wrap` on a piece's row, the name at least its longest
  word).
- **Not printed, in Design**: the print line is the Sheets view's, and since U.9 its own panel's. Design marks a piece
  that does not print with a crossed printer in the warning colour, its tooltip the reason
  (*Not printed. It is hidden.*), and says it in the row's description. A printing piece's hidden
  features are told by their own marks.
- **Pieces start open** and a fold is the session's; a selection on the board opens its piece,
  sets the tree's Tab stop on its row and scrolls it into view (`block: 'nearest'`), focus staying
  on the board. Tabbing into the tree selects nothing: focus lands on the selected row, or the
  first (checked from the rail with nothing selected and with a stitch line selected).
- **Fixed on the way**: the piece's ⋯ menu, inside the faded actions, faded with them as the
  pointer left the row for it; forced colours drew every row's transparent border; a rename
  outlived its row — undone away from macOS's Edit menu while the field had focus, which never
  blurs it — and its field came back uninvited on redo, so a rename now ends when its row is no
  longer among the rows shown, committing nothing; the tree's
  print line was 4.3:1 on a hovered row's fill and takes `--text` there, as the hole count does
  now; a squeezed row shrank its thumbnail and marks — they keep their size, and the name gives
  way.

---

#### U.9 The Sheets view gets its own panels — R-08, §7 question 3 · M · mockup 04

**Needs** U.2 (screen text), U.5, U.8.

**For the maker.** On Sheets the maker is checking paper, not drawing: which sheet each piece lands
on, whether anything is taped, and the reminder to measure the gauge before cutting leather. The
drawing tools are noise there, and that information is spread across three places.

**Today.** The Sheets view keeps the Design rail, though no tool acts on the sheets
(`CanvasHost.tsx` 742); a piece can be picked (`pickOnSheets`). Parts shows each part's print line;
Properties shows the Design selection; the work bar shows `SheetsSummary`.

**Build.**
- **Rail:** Select, and the note "Drawing tools are in Design · `Ctrl+1`". **Turn is dropped** — no
  hand turn exists (§4 above). **Measure:** nothing measures on the sheets today, so it would be new
  behaviour. *Decision for the maintainer — recommended: leave it out of U.9 and add "Measure on the
  sheets" to Later.*
- **Parts:** pieces grouped by sheet, "Sheet 1 of 2 · 2 pieces", each with a turned mark, and a
  *Taped across sheets* list ("None. Every piece fits on one sheet.").
- **Properties:** Paper, Orientation, Sheets and *Scale 100 % · locked*; then the selected piece's
  sheet, placement and fit ("1 of 2", "Turned 90°", "Fits one sheet, no tape"); then "After
  printing, measure the 100 × 5 mm box at the foot of a sheet."
- Sheet labels and screen-only piece captions readable ("Outer, turned 90°") with U.2's screen text.
  The printed sheets are unchanged.
- The options row: "Click a piece to see where it prints · `?` all keys".

**Done when — check in the app.** Mockup 04, less Turn; every number read from the sheet plan, not
computed again (7.4a: there is no second pagination); the PDF unchanged.

**As built (2026-10-17).** Rail, Parts, Properties and the options-row hint as above, less Turn and
Measure (§4: *Measure on the sheets* is in *Later*). Three things differ from the text. (1) The
*Parts* panel is a component of its own, `SheetsParts`, not the tree with a different order: the
Sheets view's rows are buttons in sheet groups, not a tree, and `PartsList` lost its `view`,
hover and print-line parts, which only Design remains to use. (2) The work bar's sheet summary is
kept as a polite announcement, hidden to the eye, since its facts are now in Parts and
Properties. (3) A sheet's label and the *turned* names below it are `GROUND.label` on the sheets'
ground — not the furniture magenta, 3.5:1 there — in the app's words (`SheetsViewOptions.words`);
no caption is laid over a turned piece, because at fit zoom it runs several times wider than the
piece. *Decision for the maintainer — recommended and taken: the mockup's caption inside the
piece waits for a zoom-aware text fit in the screen backends, if it is wanted at all.*

---

#### U.10 The legend — R-09 · S · mockup 15

**For the maker.** The legend is how a new maker learns that dashes are stitching and dash-dots are
folds. Today it starts as a strip of seven unnamed icons; it should start open with the names, and
fold to a chip once learned.

**Today.** `CanvasLegend.tsx`, collapsed by default by an F.7 decision ("a key that opened on every
launch would cost an experienced maker a click"); `legendOpen` defaults to false
(`platform/src/host.ts`); Settings › Appearance has *Name the marks in the canvas legend*.

**Build.** At the canvas's bottom-left; open with names by default, and *Name the marks…* defaults
to on; it folds to a chip, and the choice is remembered; at 1024 px and narrower, or below 720 px
tall, it starts folded, without overwriting the choice.

**Decision for the maintainer — recommended default given.** Every existing `preferences.json`
already says `legendOpen: false`, written out whenever any preference changed, so it cannot tell a
choice from the old default. Recommended: preferences version 2, which resets `legendOpen` to the
new default once, since version 1 never recorded a choice.

**Done when.** A new install and an upgraded one both open with names; folding is remembered across
a restart; the narrow and short windows start folded.

**As built (2026-10-16).** Moved to the canvas's bottom-left, as this slice's Build says (U.4 left
it at the top-right), opening with a down chevron and growing upward. Folded, it is a chip reading
*Legend* with a list icon and an up chevron — not the old strip of marks — its tooltip naming the
marks drawn, as mockups 01, 05 and 15 draw it. `preferences.json` version 2 resets `legendOpen`
once; the small-window fold is the session's, and it is read at every size rather than only at
start-up, so a window resized small folds it and one resized back opens it. The toggle follows the
legend's shown state, not the stored preference, so opening it by hand in a small window holds it
open.

---

#### U.11 Options-row hints — R-11 · S · mockup 17

**Needs** U.3; U.7 (the switch has left the row).

**For the maker.** The work bar's one long sentence is cut off at most widths. Short hints with the
keys as caps teach the keys as the maker works.

**Today.** One sentence per tool (`tools.<id>.howTo` in `en.json`) plus "· scroll zooms ·
middle-drag pans", in `.work-hint` (`App.tsx` 650).

**Build.** Per tool and state, three to five hints — a key, a few words, a rank. The lowest-ranked
drop first as the row narrows; "`?` all keys" never drops. The row holds Undo/Redo, the tool's
options and the hints. Keys from the keymap.

**Done when.** Mockup 17's wide and narrow rows; no hint is ever cut mid-word; every tool and state
has its hints.

**Tests.** Which hints fit a width, as a pure function (unit, with the property that `?` is always
kept).

**As built (2026-10-17).** `optionHints.ts` holds the sets (`hintsFor`: tool, whether anything is
selected, whether an outline's sizes open on the board, whether a shape is between its clicks)
and `fitHints` (widths, ranks, room, gap). `OptionHintsRow.tsx` measures an unseen copy of the row
and keeps what fits. `Tool.underway` is new. The plan's "Today" cited `App.tsx` 650; the sentence
was `ToolHowTo`, gone now, and the Sheets view's own `SheetsHint` is the same component.

---

#### U.12 Change a key in Settings › Keyboard shortcuts — §2 · M

**Needs** U.3.

**For the maker.** A maker whose system takes a key (F1, `Ctrl+Space`), or who works one-handed with
the other on the mouse, needs to move a key — and to see every key in one list.

**Today.** The list is read-only (top-bar spec §5.2: "rebinding keys would change this pane").

**Build.** Every command from the keymap, with its binding as caps; *Change* takes the next key
combination, by `code`; a clash in the same scope names the command that has it and offers to swap
or cancel; reset one, reset all. Stored in `preferences.json`, validated as the other preferences
are — an unknown command or a malformed binding is dropped, never fatal. Applied at once, and every
cap in the window follows. Esc, Tab and Enter keep their native roles and cannot be taken.

**Done when.** A key changed, used, shown everywhere as changed, and still changed after a restart;
a clash explained; *Reset all* restores the defaults.

**As built (2026-10-17).** One registry still: `KEYMAP` is the defaults, and `applyBindings`
(`keymap.ts`) makes the maker's keys the map every function reads — `matches`, `commandFor`,
`shownKeys`, `keysOf`, `keysInSentences`, and the new `commandsHearing` each take the keymap as a
defaulted last argument. The renderer applies the preferences before its first render and on every
change; the main process applies them at start and on every change, so `windowKeyFor` (Full
screen, Quit) and macOS's menu accelerators — now derived from the keymap, `accelerator()` in
`menu.ts` — follow. The rules are pure, in `rebind.ts`, with property tests over US, German,
French, Czech, Dvorak and Russian keyboards. What the plan did not know:

- **The capture has to store what `matches` agrees with for the same press.** `matches` reads a
  letter by what it types (U.3), so storing `event.code` would bind AZERTY's `a` key as Q. A key
  that types a Latin letter is stored as that letter (`KeyA`), anything else by its place; and a
  press the stored binding would not match — Polish AltGr+A typing `ą`, macOS's Option+A typing
  `å` — is refused rather than binding the plain letter. A property test holds every capture to it.
- **Tools heard keys by name**, outside the keymap: `selectTool` (Delete, Backspace),
  `polylineTool` (Backspace, A, L), `arcTool` (Backspace), `editPointsTool` (R, Delete). `KeyInput`
  carries `means` now — the commands the press is, from the keymap — and only Escape and Enter
  are still read by name, which no one can move. Shift held while drawing still counts, as it did.
- **A tool's claimed key still ran the window's command**: App skipped a prevented key only for
  `tool.*`. Focus mode given A would have arced *and* toggled focus mode mid-polyline. Every
  command skips a key something before the window claimed now (a tool, a Parts row, a menu's or a
  tab list's arrows); and on the board the tool hears a key before undo does.
- **`arcOrStraight` held two keys with two meanings by index**: it is `arc` (A) and `straight`
  (L), each movable on its own.
- **The defaults are not clash-free on every layout, by design**: German types − where US has `/`,
  so Ctrl+/ there is Zoom out's. A clash is found from the real press and from the very same keys
  (which a layout may hide), so giving Save that key on German names Zoom out and offers no swap,
  since the list holds Ctrl+/ too. `preferences.json` is checked for a key two commands share in
  the same place, not against a layout it was not made on.
- **Fixed rows**: Esc (`cancel`), Enter (`finishPolyline`, `editSizes`), a field's Cut, Copy, Paste
  and Select all, and the menu key — Chromium's, or a role. Esc, Tab, Enter and NumpadEnter are
  refused with any modifier, and the arrows, Home and End without one (a list's, a tree's and a
  menu's own).
- **Full screen and Quit are heard by the main process before any field**, so a bare letter there
  would never be typed: they take a function key or keys held with a modifier, and they clash with
  a field's own keys. While Settings listens, it tells the main process (`setKeyCapture`), which
  acts on none of its window keys (`windowKeyFor`'s `capturing`), so F11 and Ctrl+Q can be
  captured for another command and name the clash with Full screen or Quit. Fixed after U.12.
- **Space on a focused button is the button's** (`pressesControl`), once a window command may
  have Space. The `?` comes first in the list's keys, so the work bar's "all keys" is the list's
  first key, and follows a change.
- Swap gives the command being changed the key and the other its previous keys; a reset goes
  through the same clash path; *Reset all* empties the map. Only what differs is stored, and the
  file stays version 2.

**On review (2026-10-17)**, five holes, each fixed where every caller routes through:

- **A tool claims every key it acts on.** Take back (polyline, arc) and the Select tool's Delete
  acted and returned false, so take back given Ctrl+Z also undid, and given R also chose Rectangle.
  That is the rule that lets the polyline and Edit Points shadow the window at all; it is written
  where `clashScopes` is defined, and each tool's tests hold it.
- **One hearing rule.** A board's tool hears its key with Shift held, but finding a clash matched
  Shift exactly, so Circle on Shift+Delete was taken and deleted *and* switched tools. `hears`
  (`keymap.ts`) is now the one rule, for dispatch and for clashes, and a key bound as pressed wins
  over a tool's Shift-held reading (a Czech Ctrl+Shift+1 types `+`, Zoom in's). A property presses
  every bound key on six layouts, alone and with Shift, after any steps, and finds no press heard
  twice in one place.
- **A digit, `.` or `,` alone types a size on the board** (U.16), so it is refused, by the press and
  by its place, and dropped from the file; with a modifier held it is a key like any other.
- **Quit is fixed on macOS**, where it is the app menu's ⌘Q and no other key reaches it
  (`isChangeable(id, isMac)`).
- **Both processes read the maker's keys through `readBindings`**, the renderer before applying
  them too; a press with no `code` is refused, since `{code: ''}` would match every other such press.

---

#### U.20 What Chromium still draws itself — §2 *Keyboard*, UI Foundations §6.5 · M

Added 2026-10-15 from a pass over the running app. It cites no `R-` id: the requirements assume a
dark window, and these are where Chromium and Electron left their defaults in it. Numbered last
because it was found last; it lands before U.19, which walks the window as one thing and retakes
the pixel baselines.

**Needs** nothing.

**For the maker.** The window is dark, but every control Chromium draws itself is still in its
light theme: a white scrollbar with arrow buttons beside Properties, Parts, the tool rail and every
dialog; white radio dots; a blue checkbox in Print. A stray Ctrl+A paints the whole window blue. A
name field underlines *Gusset* in red and offers nothing to do about it. And Electron's
spellchecker downloads a dictionary from Google on first launch, when `SECURITY.md` tells the maker
the app makes no network connections.

**Today** (measured 2026-10-15 on Linux, KDE, at 1100 and 1400 px wide).

- **Nothing declares `color-scheme`.** Not `styles.css`, not the tokens `theme.ts` writes at
  startup, not `index.html`, and the main process sets no `nativeTheme.themeSource`. So Chromium
  draws its own controls light:
  - **Scrollbars**, light and with arrows, wherever the shell scrolls: `.rail`, `.panel` (Parts and
    Properties, thin since U.6), `.dialog`, `.settings-pane` (My tools shows it), `.print-sheets`,
    `.print-options`, `.print-problem-rows`, `.drawer-body` and a long `.menu`. Only
    `.panel-strip` hides its own.
  - **Radios.** Print's orientation (`PrintPreview.tsx` 325) has no `accent-color`, so it is
    Chromium's blue; My tools' are tan when chosen and a white disc when not.
  - **Checkboxes.** Print's *include this sheet* (`PrintPreview.tsx` 229) is Chromium's blue;
    Settings' is tan, and white when clear. Both Print controls show only with a printer listed.
  - **Copies** (`PrintPreview.tsx` 342) is the window's only `type="number"`, with Chromium's spin
    buttons. Every other number is a `NumberField`.
  - **Thirteen `<select>`s.** The closed box is styled (`.field select`); the open list is
    Chromium's, and was not looked at.
- **Focus.** Twelve tab stops in the main window have no `:focus-visible` rule and fall back to
  Chromium's `outline: auto`, in the desktop's accent colour — KDE's orange here, not `--tan`:
  `.chip` (*Draw as*, and the status bar's Parts, Focus and Properties), `.panel-toggle` (both
  folds) and `.drawer-handle`. The dialogs were not walked.
- **Text.** Nothing sets `user-select`. Ctrl+A outside a field selects the whole window in
  Chromium's blue (1,192 characters); a double-click selects a label.
- **The spellchecker** is Electron's default: on, in `en-US` whatever the interface language. On
  Linux it fetched `en-US-10-1.bdic` from Google into `<userData>/Dictionaries/` on first launch.
  `index.html`'s CSP holds the renderer, not the main process's session, so it does not stop it.
- **No right-click menu in a field.** Electron ships none, and `App.tsx` 701 opens the board's menu
  only for the keyboard's menu key. The keys work: Ctrl+C, V, X and A in a field (8.7's E2E).
- **The notices window.** `openNotices()` (`main/index.ts` 159) loads `THIRD_PARTY_NOTICES.txt`
  bare in a second window: white, a system monospace face — a system font, which the project never
  uses — a light scrollbar, and no `backgroundColor`.
- **One native message box.** *A recent project is gone* (`main/index.ts` 221) is
  `dialog.showMessageBox`; every other message is the app's own dialog. The open and save dialogs
  stay the system's, as they should.

**Find out first.**

- [x] Add `color-scheme: dark` on `:root` alone, then look at each item above again. Count what
      it fixed before writing anything else: it may be most of the list.
- [x] With it set, open Paper, Follows, Iron and Language. Is the open list readable, its
      highlight the shell's rather than the system's blue? Only if not, `appearance: base-select`
      (Electron 44's Chromium has it).
- [x] With a printer listed, Print's checkbox and Copies.
- [x] Tab through Settings, Print, Delete, Unsaved changes and Recovery: which stops still ring
      with `auto`?
- [x] In `forced-colors`, native controls take the system's colours: check no new rule fights
      `styles.css`'s three `forced-colors` blocks.
- [x] How the renderer would read the notices, if they move into a dialog: the file is emitted at
      build by `notices/thirdPartyNotices.ts`, and the renderer is sandboxed.

**Build.** Every colour from the theme: `theme.test.ts` refuses one written in `styles.css`.

- **`color-scheme: dark`** for the shell. The board and the sheet previews are canvases and do not
  read it.
- **Scrollbars:** thin, `scrollbar-color` from the shell's tokens, said once for the shell rather
  than per panel.
- **`accent-color: var(--tan)`** on every radio and checkbox, said once.
- **Copies** becomes a `NumberField`, as the dimension's *Decimals* is (`MeasurementEditor.tsx`): a
  count, no unit, no sums.
- **Focus:** UI Foundations §6.5's ring — 2 px `--tan` at 1 px offset, on `:focus-visible` only —
  on every stop that lacks one.
- **Text:** `user-select: none` on the shell. Fields stay selectable, and so does what a maker might
  paste into a bug report: a problem's words, About's version and log folder.
- **The spellchecker off,** with `spellcheck: false` in the window's `webPreferences`, so no
  dictionary is ever fetched and `SECURITY.md`'s sentence is true again (decision in the roadmap).
- **A field's right-click menu:** Cut, Copy, Paste and Select all, in the app's own `Menu.tsx`,
  words from `en.json` and keys from the keymap. Nothing outside fields (decision in the roadmap).
- **The notices** in the app's look: a dialog from About with the text in the vendored face, or the
  window given the theme's background and the same face. No monospace face is vendored; the
  notices' `===` rules read well enough in Plex Sans.
- ***A recent project is gone*** said by the renderer, in the app's own dialog. Its two keys move
  from `main.` to the renderer's.

**Done when.**

- At 1400 × 600 and at 1024: no light scrollbar, no blue or white control, no spin button,
  anywhere in the window or a dialog.
- Every tab stop, in the window and in every dialog, shows the tan ring.
- Ctrl+A outside a field selects nothing; inside one, its text.
- A fresh profile (an empty `XDG_CONFIG_HOME`) has no dictionary in `Dictionaries/` after typing in
  a name. *As built: Chromium makes the folder, empty, at startup.*
- A right-click in the project name offers Cut, Copy, Paste and Select all, in the interface's
  language.
- The notices and *a recent project is gone* in the app's look.
- Printed output did not move (§1, step 6).

**Tests.** An E2E that tabs through the window and each dialog and finds no computed
`outline-style: auto`; the spellchecker's state read from the main process
(`session.defaultSession.isSpellCheckerEnabled()` false); the field menu's entries as a pure
function, with its words in `en.json` checked by the locales test; the axe scan over Print with a
printer listed.

**Traps.**

- A menu built in the main process from Electron's `role:` items carries Electron's own English
  and skips `en.json` (ADR 0018).
- Never `outline: none` without the ring in its place (§2 *Keyboard*).
- `user-select: none` on the shell must not reach the project name, Parts' rename or Properties'
  Name: test all three.
- A token the theme does not define fails `theme.test.ts`; a new one goes into
  `packages/render/src/theme/`.

**As built (2026-10-15).** What the plan above did not know:

- **`color-scheme: dark` alone fixed about half the list.** Measured on the sample at 1400 × 600:
  the scrollbars and a select's open list went dark, Chromium's `auto` ring went from KDE's orange
  to white, and the radios and checkboxes went from light blue to Chromium's dark blue. Still to
  do after it: the twelve `auto` stops, the blue controls, the option at hand in the system's
  blue, Copies' spin buttons, Ctrl+A (918 characters selected), and the rest of the list.
- **The open list needed `appearance: base-select`.** Looked at on a private Xwayland with
  `import`, since the list is a window of its own: dark with `color-scheme`, but the option under
  the pointer or the keyboard in the system's light blue. With `base-select` the list is the page's,
  drawn as the menus are — `shell-900`, the option at hand `shell-600`, the chosen one ticked in
  the accent — and, being the page's, its keys reached the page: Escape closing it closed the
  dialog under it, and a letter typed to find an option chose a tool. `keepKeysInOpenLists` keeps
  every key pressed in an open list to the list. In forced colours the option at hand takes
  `Highlight`, as a native list's does.
- **Tab walked out of every dialog.** All seven say `aria-modal` and their backdrop takes the
  pointer, but Tab went from the last stop to the project menu behind. `keepTabInDialogs`
  (`modalKeys.ts`, installed once) sends it round inside the dialog on top, and brings focus that
  is outside back in. A menu open in a dialog keeps its own Tab.
- **Print's orientation had no focus ring at all**: `.field input:focus { outline: none }` was
  meant for a field's border and caught the radios. Radios and checkboxes keep the ring now.
- **The spellchecker needed the session's languages emptied.** `spellcheck: false` in
  `webPreferences` and `setSpellCheckerEnabled(false)` together still fetched `en-US-10-1.bdic`
  once a name was typed; `setSpellCheckerLanguages([])` stopped it. Chromium still makes an empty
  `Dictionaries/` folder at startup, so the test reads that it holds nothing.
- **The notices moved into a dialog** over About, read through `PlatformHost.readNotices()` (the
  main process reads the file the build wrote; the renderer is sandboxed): `openNotices()` and the
  second window are gone. *A recent project is gone* is `openRecent`'s answer now — `opening`,
  `gone` or `unlisted` — and the project bar's own dialog. The main process has no words left
  but macOS's menu: `main.*` is gone from `en.json`.
- **The field menu** is `fieldMenu.ts` (the entries, a pure function) and `TextFieldMenu.tsx`, mounted
  once, heard on the window before anything else so a right-click in Parts' rename is the field's
  and not the piece's menu. It is placed beside its field in the document (its dialog, or its
  landmark), so it is above a dialog the field is in and inside a landmark for axe. Focus goes
  into the menu, so a field that finishes when left — the project's name, a row's, a
  `NumberField`, an iron's name — ignores a blur into a menu (`intoMenu`), and the menu gives
  focus back when it closes. Paste reads the clipboard and types it in (`insertText`): Chromium
  refuses a page's own `paste`. The keymap has a `field` scope and group, *In a text field*,
  which the window never dispatches.
- **Three `forced-colors` blocks**, as the plan said (≈813, ≈1003 and the tree's ≈2253); none of
  the new rules fights them: forced colours repaint the outline but keep it solid and 2 px.
- **The window's `backgroundColor`** stays written out in `main/index.ts`: importing the theme
  there pulls `packages/render`'s DOM types into the main process's build. The stylesheet's audit
  holds the literal to `SHELL[800]`.
- **Scrollbars keep small arrows**, now in the thumb's colour on the shell. Chromium draws them
  with the standard properties, and ignores `::-webkit-scrollbar` once `scrollbar-color` is set.

---

### Phase 3 — the craft workflow

#### U.13 Settings › My tools — R-15 · M · mockup 06

**For the maker.** A maker owns two or three irons. Typing 3.85 into every hole set, or picking it
from a list of other people's brands, is friction; the app should know this maker's irons and their
usual stitch margin.

**Today.** `IRON_PRESETS` (`renderer/src/irons.ts`): seven presets from three brands. A hole set
stores its pitch and the iron's label, so a file opens the same on any machine. No default margin.
A fold's `materialThicknessMm` is stored and consumed by nothing.

**Build.**
- **Settings › My tools:** the irons — Default (one), Name, Pitch in mm, a ⋯ menu (rename, delete) —
  and *Add iron*; then *For new pieces*: Stitch margin ("How far in from the edge a new stitch line
  starts", e.g. 3.5 mm) and Leather thickness ("Used by a fold whose own thickness is not set",
  e.g. 1.2 mm). Stored in `preferences.json`, validated as the other preferences are; quantised.
- **The Iron menu** on a hole set lists the maker's irons, then a custom pitch. The hole set still
  stores pitch and label, so files stay self-contained.
- **A first launch** seeds the list from today's presets, so nothing a maker used disappears; they
  delete what they do not own.
- **The margin** is what the app uses when it makes a stitch line for the maker: *Stitch +
  allowance* (Draw as), and the Next steps (U.17).

**Decision for the maintainer — recommended default given.** "Leather thickness, which folds use
when their own thickness is not set": nothing reads thickness yet, and a fold whose geometry
someday depended on a machine's preference would print differently on two machines. Recommended:
the thickness is **written into a new fold** when it is made, and a fold without one shows the
default as a placeholder; evaluation never reads preferences.

**Done when.** Irons added, renamed, deleted and made default; the Iron menu lists them; a new
stitch line made by the app sits at the margin; a new fold carries the thickness; a project opened
on a machine with other irons evaluates the same.

**As built.**
- `Preferences` (`packages/platform`) gains `irons` (`Iron`: `id`, `name`, `pitchMm`),
  `defaultIronId`, `stitchMarginMm` and `leatherThicknessMm` (`null` by default); `STARTER_IRONS`
  are today's seven presets, under the names hole sets already carry. `parsePreferences` and
  `validChanges` (`main/preferences.ts`) keep each usable iron and drop the rest; the store reads
  every change back as the file would be, so the default is always an iron the maker has.
- **The plan's *Today* was wrong about the margin.** Every project carries
  `settings.defaultStitchInsetMm` and `defaultIronPitchMm`, and X8 had the commands read them —
  with no interface to change them, so in practice 3.5 and 3.85 in every file. Seeding a new
  project from My tools would leave the sample and every older file on 3.85, so the app passes the
  maker's values instead (`addStitchLine`, `addStitchHoles`, `addAllowance`, and through
  `ToolContext.makerDefaults` the editor's *Stitch + allowance* and folds); the project's are the
  fallback when none is passed. X8 is amended in `domain-model.md`. One source, as U.18 asks.
- **The thickness starts not set**, not the mockup's 1.2: written into every new fold of a maker
  who never chose it, it would one day bend their leather by a guess (9.1). A fold without one
  still says *not set* — showing the maker's default there would suggest it is used.
- **The Iron menu** lists the maker's irons, then the set's own iron by its name when the maker
  does not have it (`ironOf` matches name and pitch), then Custom. Choosing writes pitch and name;
  typing a pitch drops the name, as before.
- `NumberField` takes `hideLabel` (a column heading or a setting's name says it on screen), and an
  Escape on an edit in progress stops there: it cancels the edit, not Settings.
- **For U.14, U.17 and U.18:** the maker's values are `MakerTools` in `renderer/src/irons.ts`, from
  `App`'s preferences; `defaultIron(tools)` is the iron, `tools.stitchMarginMm` the margin.

---

#### U.14 Value chips beside the selected shape — R-12 · L, built as M + U.15 · mockups 02, 05, 13

**Needs** U.2 (screen text), U.13.

**For the maker.** Most of a pattern is typed, not dragged: a 95 mm pocket, 4 mm corners, a 3.5 mm
margin. Chips put those numbers on the drawing where the eye already is, so a size changes without
hunting through Properties.

**Today.** Width, Height and Corner are in Properties (`shapeEditors/RectEditor.tsx`); the margin is
the stitch line's offset in its editor. Nothing on the canvas is editable. Drag handles for typed
values are *Not planned*, and stay so.

**Build.**
- A selected outline shows four chips on dimension lines, all at 12 px: width on the side away from
  the caption, height at the right, corner radius by the corner, stitch margin across the margin —
  each only where the shape has that parameter (a rectangle has all four; a drawn path none).
- Click a chip or press `Enter` to edit: a caret and the unit. `Tab` / `Shift+Tab` move W → H →
  corner → margin, only while a chip is open. `Enter` applies — one command, one undo step; `Esc`
  reverts.
- A value that cannot apply keeps the chip open and says why, with a glyph: "Corner is larger than
  half the height (30.0). Enter uses 30.0." — the domain's own refusal, worded in the app.
- Where the chips sit is computed in `render` from millimetre anchors; the app places an input
  there.

**Done when.** Mockup 13's states; editing by mouse and by keyboard alone; one undo per applied
value; a refusal explained, and Enter taking the suggested value; the chips never print.

**Find out first — answered (2026-10-15, on `bfc878e`).**
- [x] Corner 40 on an 80 × 60 rectangle. *Properties showed 40 in all four fields, the `.lcp`
      saved `"radii": {… 40 …}`, and the board and the PDF both drew a stadium with 30 mm ends:
      `roundedRect`'s private `clampRadii` shrank them at draw time. **The plan's "the domain's
      own refusal" did not exist** — nothing anywhere refused a corner.*
- [x] Which dimension line the chips sit on. *Their own, screen-only: a `measurement` feature is
      document geometry that prints (the sample's card pocket has one), and it is the maker's.
      The chips' lines are a display list of `annotation`-role paths returned by
      `placeValueChips` and drawn by `CanvasHost` beside the tape joins, never reaching the
      export scene. `e2e/value-chips.spec.ts` exports with the chips showing and without them
      and compares every page pixel for pixel.*
- [x] How `CanvasHost` tells children about the camera. *It did not: the camera is refs inside
      `CanvasHost`, only the zoom percentage leaves through `onStatus`, and a pan says nothing.
      The chips are placed from `paint()`, the one place every camera change goes through, by
      an imperative `place(view, area)` on the chips' handle — a DOM write per chip, no React
      render per frame. Measured with the sample at 1440: a wheel step paints once (it painted
      twice until `ValueChips` was memoised), median 0.6 ms with the chips against 0.4 ms
      with a stitch line selected.*
- [x] Where Enter went. *Only the polyline's `onKey` read it, and it returned `false` after
      finishing — or after refusing an open outline, keeping the points — so the press went on.
      A Parts row's Enter selects and lets the key go on too. Both would now reach the board's
      new Enter; see below.*
- [x] At 1024 and 860. *Properties is a docked 40 px strip at 1024, beside the canvas, not over
      it; opened with `]` (and both panels at 860) it lies over the board at z 8. The chips keep
      clear of an open panel: `CanvasHost` passes the board less the panel's side as the area
      they may use, and a chip with no room there is left out.*

**As built.**
- **The corner fact is in `packages/geometry`:** `fittedRadii(radii, w, h)` is the old
  `clampRadii`, exported, and what `roundedRect` calls — so the drawn and printed clamp did not
  move. `cornerRoom(w, h, radii, corners)` is the largest radius the named corners take
  together, the others kept, before `roundedRect` would shrink them: the side that limits it,
  and whether its two corners share it. Property-tested: the room always fits, anything more is
  drawn smaller, anything within is drawn as asked, it agrees with `roundedRect`'s arcs. The
  property found the first draft taking the first side within `EPS_POINT` of the tightest,
  offering a radius a nanometre too large; it is the exact minimum now, with that case kept as an
  example. `quantiseAtMost` (core) puts the offered radius on the storage grid without
  crossing the limit: half of a stored 60.0001 is 30.00005, which `quantise` rounds up.
- **The app words it** (`renderer/src/outlineSizes.ts`, `cornerRefusal`): "Corner is larger than
  half the height (30.0). {{enter}} uses 30.0." for all four corners, and "…than the height
  leaves it (55.0)…" for one corner beside another. `{{enter}}` is the field's own Enter,
  through `keysInSentences`. **Properties' corner fields refuse the same way** (`NumberField`'s
  new `refuse`): Enter once says why with the warning glyph, Enter again takes the radius, leaving
  the field drops it, and the arrow keys stop at it. A file that already holds an oversize radius
  opens and draws as before (`lcp.test.ts`).
- **Which chips:** one feature selected, a piece's **outline** (the outer cut contour) drawn as a
  rectangle, shown and unlocked: width, height and corner; the margin only where exactly one
  stitch line follows it inward. Nothing for a cut-out, a circle, a drawn path, a piece picked by
  its heading, two stitch lines or a locked outline. Four different corners read *mixed*; typing
  sets all four, one step.
- **Placement** is `placeValueChips(view, input)` in `packages/render`, from the rectangle's own
  frame turned on screen, so a turned rectangle's chips turn with it: width on the lower of its
  two width sides, height on the right-hand height side, both on dimension lines with extension
  lines, the chip's nearer side 8 px off the outline and sliding along its line to stay in view
  and clear of the controls laid over the board;
  the corner off the top-right corner along its diagonal, clear of even the square corner, a
  leader from the arc as drawn. Chips the app measured are its input; centres in CSS px and the
  lines in mm are its output, and a chip whose place is under a ruler, past the canvas or under
  an open panel is left out. Property-tested: never over the shape, never under a ruler or past
  the area, deterministic, moved exactly by a pan. A refusal's note is placed there too, under its
  chip or over it at the canvas's foot.
- **Clear of the controls over the board** (on review, 2026-10-17: the legend opens by default
  since U.10, and the chips sat on it, above it in z). `placeValueChips` takes `obstacles`, boxes
  in the area's CSS px, which `CanvasHost` reads each frame from what says `data-over-board` — the
  legend and the zoom control — and a `ResizeObserver` asks for a frame when one changes size, as
  the legend does when it folds. A chip on a line takes the clear point nearest its middle, 4 px
  off any control; the corner chip, a point, is left out rather than cover one; a note goes over
  its chip when a control is under it. With nothing in the way, every chip sits where it did
  (property-tested), and no chip ever covers a control (property-tested; the E2E checks it at
  1440, 1024 and 860).
- **The margin chip sits on the leather, just inside the stitch line**, with a line from the edge
  across the margin to it — R-12's "across the margin" and mockups 02 and 05. Outside the left edge
  it had no room at *Fit selection*: 60 px of padding, 34 of them the left ruler's. It keeps
  inside the stitch line all round and is left out where it cannot (a narrow piece far out).
- **Keys.** `editSizes` (canvas scope, Enter) opens the first chip in view, only with nothing
  focused — a field, a button or a Parts row keeps its Enter — and after the tool has heard it.
  **The polyline now claims the Enter that finishes a run**, refused or not: it returned `false`,
  so a refused open outline would also have opened the selected outline's sizes.
- **The chips are not Tab stops at rest, as this section says** (corrected on review,
  2026-10-17; the first build made them four Tab stops after Parts). **The board is one:** the
  canvas takes `tabIndex 0`, `role="application"` and the name *Design board* (*Sheets board*
  on Sheets), with the ground's ring inside its edge, and Enter there opens the first chip in
  view. Open, Tab applies and opens the next chip in view, Shift+Tab the one before; past either
  end the window's own Tab goes on from there — Shift+Tab from the width to the board, Tab from
  the last chip to the legend — so there is no trap, and Shift+Tab from the legend is the board
  again, not a chip. A value that cannot apply holds Tab once to say why; a second Tab leaves it.
  Esc drops what was typed, and Esc or an Enter that applies gives focus back to the board, so
  Tab goes on from where the maker was. Leaving by a click applies a value that reads, to the
  outline the chip was opened on. Found on the way: **a chip opened by Tab read a stale outline**
  — Tab opens the next chip in the same keypress that applied the last, before React renders, so
  `95` Tab `60` put the width back to 200; a chip reads the outline from the store as it opens.
- **A right-click in an open chip is the field's menu (U.20)**, and the chip stays open: its blur
  into the menu is not leaving it (`intoMenu`), as `NumberField`'s is not.
- **A width or height its corners do not fit in is refused** (on review, 2026-10-17). The first
  build let one through: a new width drew the corners smaller than stored, and the model said a
  radius the pattern did not have. `cornerNeeds(radii)` in `geometry` is the least width and
  height `fittedRadii` draws the radii in as asked — on each pair of sides, the longer sum of the
  two corners sharing one — property-tested: it and anything larger draws them as stored, any
  less draws one smaller. "Width is less than its corners need (10.0). {{enter}} uses 10.0.";
  Enter again takes the least that fits, put on the grid by `quantiseAtLeast` (core) without
  falling short. Properties' Width and Height refuse the same way, so a chip and Properties agree,
  each accepted edit one undo step and a refused one none. Only the side typed is read: a file
  from before U.14 holding corners too large for the other side still opens and draws as it did,
  and says so on that side when its size is typed.

**Corrections to this section.** "The domain's own refusal" was not there to word; it is
`cornerRoom`, in `geometry`, beside the clamp it describes — and `cornerNeeds` for a width or
height. "Press `Enter` to edit" needs the board to have focus, which nothing gave it: the board is
a Tab stop now.

**For U.16 and U.17.**
- **U.16** reuses `ValueChips`' field (`Chip`), `chipNumber`, `CHIP_MIN`, `parseLength`, and
  `placeValueChips` with the live rectangle's parameters; the rectangle tool should claim
  Enter while it has a first corner, as the polyline now does, or Enter opens the selected
  outline's chips instead. `cornerRefusal` with `cornerRoom` refuses a typed corner while drawing,
  and `sizeRefusal` with `cornerNeeds` a width or height. Tab between chips is the chips' own
  (`onStep`); the board is the Tab stop, and a chip opening must read the store, not a render.
- **U.17**'s bar goes below the width chip: its box is `placed.at.width` and the chip's measured
  size, in the same CSS px. When the width chip is left out, the lowest point of the selection's
  bounds is the fallback. The bar must keep clear of the margin chip, which is inside the piece,
  and of the same `data-over-board` controls the chips keep clear of.

---

#### U.15 Values in any unit, and sums — R-12 · S

**For the maker.** Makers measure in inches as often as millimetres, and think in sums: "95, less two
margins". A size field should take `95-2*3.5` or `3.75in` and show the result in mm.

**Build.** `parseLength(text)` in `packages/core`, beside `parseNumber`: `+ − * /` and parentheses,
the decimal comma and U+2212 as `parseNumber` reads them, units mm, cm and in (and `"`). A
`Result`, with an error a field can show. Used by the chips **and** every millimetre field in
Properties, so the same text means the same thing everywhere; the result is quantised. Tests first,
with properties: what `formatEditable` writes reads back to within half a unit; a sum and its
reordering agree; inches are 25.4 mm exactly.

**As built.**
- `parseLength(text): Result<number, LengthError>` in `packages/core/src/length.ts`, exported with
  `MM_PER_INCH` and `LengthError` (`syntax`, `unit` with the word, `mixed`, `notALength`,
  `notFinite`) — facts the app words under `editor.lengthError.*`. It reads every number
  `parseNumber` reads, the same (a property test holds it), so no field reads a plain number
  differently than before.
- **A unit takes everything multiplied or divided before it in its term**: `1/2in` is 12.7 mm, not
  1 ÷ 2 in; what follows scales the length (`10cm/2`). A unit on what already has one, a length
  times a length, or a division by a length is `notALength`. Units are mm, cm, in and `"`, in any
  case; `inch`, `ft` and `m` are named back as units it does not know.
- **A sum gives every number a unit, or none** (`mixed`). The plan left a bare number beside a
  length open; reading it as millimetres turns American `3-1/2"` (3½ inches) into 3 mm − 12.7 mm,
  which a field with a minimum would then clamp without a word. Multiplying and dividing by a bare
  number is a scale, and stays.
- `NumberField` reads its text with `parseLength` when its unit is mm (`suffix`, default `'mm'`),
  and with `parseNumber` otherwise — Cut, Turn, the arc's angles, Decimals. Enter on what it
  cannot read keeps the text, sets `aria-invalid`, and describes the input by the reason beneath
  (hidden from the label's name, so the field keeps its own); typing clears it; Escape and blur
  revert as they did. In the work bar, whose height is fixed, the reason hangs below the field.
  The arrow keys step from what is typed when it reads, so `95-7` then ↑ gives 89.
- **For U.14 and U.16:** the chips call the same `parseLength`; its `LengthError` is the "keeps the
  chip open and says why" case, before the domain's own refusal.
- Not built: a mixed number with a space (`3 1/2in`), which reads as two numbers and is refused.
- **A field rounds the number as written** (fixed on review): `1/8in` stores 3.175 and showed
  `3.17`, `toFixed` of the binary 3.17499…. `formatEditable` now rounds the shortest decimal the
  number is, half away from zero, so it reads `3.18`, checked against integer arithmetic on every
  stored quantum. `formatNumber` — the ruler, the readouts and the printed dimensions — keeps
  `toFixed`, so nothing printed moves; whether readouts and printed dimensions should round the
  same way is a decision for its own pull request.

---

#### U.16 Typing while drawing — R-13 · M · mockups 03, 13

**Needs** U.14, U.15.

**For the maker.** A maker usually knows the size before drawing: 105 × 75 with 8 mm corners. Typing
it while the rectangle tool is drawing is faster than dragging and exact.

**Today.** `packages/editor/src/tools/rectangleTool.ts` draws a live "65.5 × 46.8 mm" (line 128);
sizes are typed afterwards in Properties.

**Build.** While drawing a rectangle the live readout becomes the chips: typing `105` `Tab` `75`
`Tab` `8` `Enter` makes a 105 × 75 mm outline with 8 mm corners; dragging first and typing after
still works; Shift still makes a square. A hint under the shape: `Tab` next · `Enter` makes it ·
`Esc` cancels. Properties mirrors Width, Height and Corner while drawing.

**Decided 2026-10-17 (as built).**
- **Where it goes:** at the pointer, as recommended. The first click still places a corner; typing
  sets the size from there towards the pointer (the pointer picks the side of each axis, so the
  shape follows it round the corner). With no corner placed, the first digit starts the corner at
  the pointer's last position over the board.
- **What a number does:** a typed width, height or corner stays; what was not typed follows the
  pointer, so `105` `Enter` is 105 wide by however high the pointer shows. A side still at nothing
  is not made — the rectangle stays open for it to be typed. Freezing both sides on the first
  keystroke was tried and dropped: a corner clicked and `105` `Enter` made a 105 × 0 rectangle,
  refused without a word.
- **Reused, not rebuilt:** `ValueChips`' `Chip` edits a `ChipSubject` built from the tool's draft
  (`drawnSubject`), refuses with `chipRefusal` (`cornerRoom`, `cornerNeeds`) and reads with
  `parseLength`; its Tab goes round the three, since past the last is no longer out of the shape.
  Typed numbers reach the shape through the tool (`Tool.sizing`, `beginSizing`, `setSize`,
  `finishSizing`), which alone dispatches (`draw.commit`).
- **A typed corner the pointer has since left no room for** is refused, never made smaller
  unsaid: Enter on the board, a click, or a chip's Enter makes nothing, opens the corner chip and
  says why there ("Corner is larger than half the height (4.0). Enter uses 4.0."); only a second
  Enter in it takes what fits — one undo step. A chip open while drawing is checked against the
  shape as it is now, not as it was when the chip opened. As U.14 decided: a stored radius is
  always the one drawn, and never one the maker did not see.
- **A drag commits on release**, as before; "dragging first and typing after" is the U.14 chips on
  the outline it made. Between two clicks the chips replace the readout; during a drag the readout
  stays.
- The hint is placed by `placeValueChips` (`hint` in, `hintAt` out): under the shape and its chips,
  over them where there is no room, never over the shape.

**Find out first — and decide.** Where a typed rectangle goes when no corner has been clicked yet.
Recommended: the first click sets a corner, as now, and typing sets the size from there towards
the pointer; before any click, typing starts at the pointer.

---

#### U.17 The selection bar: stitch summary and next step — R-14 · M · mockups 14, 02, 05

**Needs** U.6 (the spacing rule), U.13.

**For the maker.** After an outline the next steps are nearly always the same: stitch line, holes,
perhaps a seam allowance. The bar says how the stitching came out — 146 holes at 3.85, spacing
matches the pitch — and offers the next step as one click with the maker's own defaults.

**Build.**
- A small bar on the shell (`shell-1`, border, 5 px radius), under the selection's bounds and below
  its dimension line; above when there is no room below; never over the selected piece; hidden
  while dragging. Positioned from `render`'s millimetre-to-pixel transform.
- **Line 1:** holes · spacing against pitch · runs · Cut ×N — U.6's rule and words, from
  `renderer/src/spacing.ts`: a check when the spacing shows as the pitch (`formatSpacing`, two
  decimals, the numbers Properties shows); "stretched 1.8 %" with a stretch mark when not; the
  warning glyph only when Problems warns about the set (`spacingGlyph`). Settle first what *runs*
  add up to: the sample's 24 · 50 · 23 · 50 is 147 beside 146 holes, a corner counted twice.
- **Line 2:** Next: Stitch line › Stitch holes › Seam allowance. Done steps show a check; the first
  undone step is a button that runs it with My tools' defaults; later steps are plain text. The
  commands are the panel's existing ones (`DeriveActions`, `AllowanceButton`).
- `F6` moves focus from the canvas to the bar. Settings › Appearance can turn it off.
- Hole matching and thread length are **not built**: no placeholder, but room for a third line.

**Done when.** Mockup 14's four states but the last; one click makes the next step, undoable; the
bar never covers the piece, at any zoom; off in Settings means off.

---

#### U.18 Drawing defaults in Properties — R-16 · S · mockup 03

**Needs** U.13, U.16.

**Build.** While drawing, Properties shows *After the outline*: the stitch margin and the iron from
My tools ("3.5 mm in · My tools", the iron). *Stitch + allowance* and the Next steps use them.
Editing them here edits My tools — one source.

---

#### U.19 The pass, checked as one thing · S

**For the maker.** Nineteen slices each looked right on their own; this checks the window as one
tool, the way the 1.0 audit did.

**Build.** Walk *open → draw → stitch → arrange → check sheets → print* at 1920, 1440, 1280, 1024 and
860 × 600; by keyboard alone; in `forced-colors`; with reduced motion; at 2×. Run the accessibility
scan over every new surface; check every token pair's contrast test exists. Retake the pixel
baselines and the README's pictures (with Q27's tooling, if 1.4 did not already). Record the result
of UI Foundations' identity test. Move what this plan found into the roadmap.

**Carried here by decision (2026-10-13).** Flip on a stitch line or a hole set is always refused,
and its reason fills Arrange's first rows (U.6): keep it refused, and word the reason in one short
line.

---

## 6. After 1.5

The release that was called 1.5 on 2026-10-07 — update discovery (8.9), guides (3.10), convert to
drawn path (3.12), drafting dimensions (4.10b), Windows printing (7.6c) and the rest — is 1.6,
unchanged and in its own order. *Later* gains two items this pass leaves room for: hole matching
and thread length in the selection bar (R-14's third line), and measuring on the sheets, if U.9
leaves it out.
