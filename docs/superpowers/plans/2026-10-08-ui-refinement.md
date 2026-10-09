# The window, refined — the plan for 1.5 (U.1 – U.19)

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

**Roadmap:** [1.5 — the window, refined](../../roadmap.md#15--the-window-refined).

**Stack:** React in `apps/desktop/src/renderer`; tokens in `packages/render/src/theme/`; the
canvas2d and svg screen backends in `packages/render`; Playwright for the E2E and pixel tests.

---

## 0. What to work on first

| Order | What | Waits on | Who |
|---|---|---|---|
| 1 | **Finish 1.4.** Its last feature, 6.5 (DXF), landed in [crnlsp/leathercad#65](https://github.com/crnlsp/leathercad/pull/65) on 2026-10-08. What is left is Q27 and R1 | Q27: `gifsicle` and `pngquant` on the machine that retakes the README pictures. R1: a physical print | the maintainer, or an agent asked to |
| 2 | **U.1 Pieces read as pieces** | nothing | the `ui-refinement` agent, from 2026-10-08 |
| 3 | U.2 → U.19, in this document's order | the slices named under each | one session per slice |

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
| `primary` | `GO.go` #46B46B | **#F1EEE8** | **changed**, U.7: Print's main half, in the paper colour. Green is retired from actions: it reads as the fold colour |
| `primary-side` | — | #D2CBBD (the value of `GROUND.major`) | **new**, U.7 |
| `secondary-side` | — | #3A3F47 | **new**, U.7 |
| `on-primary` | `GO.onGo` #1D2126 | #14161A | **changed**, U.7: AA on `primary`, `primary-side`, `warning` and `error` |
| `rail-wide` / `rail-narrow` | `RAIL_PX` 152 / 52 | 152 / **56** px | **changed**, U.5 |
| `parts-width` / `properties-width` | `--parts-w` 220 and `--properties-w` 288 (264 below 1280), written in `styles.css` | 224 / 264 px | **changed**, U.5, and into the theme |
| `panel-strip` · `row-height` | — | 40 px · 28 px (a Parts row was 34) | **new**, U.5 and U.8 |
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
- [ ] `ZOOM_STEP`, `FIT_PADDING_PX`, and what `fit()` frames on Sheets.
- [ ] At 860 × 600 the control, the legend (bottom-left) and the Problems drawer share the canvas's
      foot: check nothing overlaps (mockup 05).

**Done when — check in the app.**
- [ ] The control shows a whole percentage that follows the wheel live.
- [ ] Ctrl+0 or *True size*: a 100 mm line is 377.95 CSS px long, measured in devtools, at 1× and 2×.
- [ ] Shift+1 fits the drawing; Shift+2 the selection, or is disabled with its reason; 50, 200 and
      400 % from the menu. Works on Sheets.
- [ ] Every part reachable by Tab, named, with a tooltip and its key; the menu works from the
      keyboard and gives focus back.

**Tests.** Percentage and scale as a round trip (property); the selection's bounds, a picked part
included (unit); E2E for Ctrl+0, Shift+1 and the menu.

**Docs.** `docs/getting-started.md` (Ctrl+0 no longer fits), the shortcut list, the roadmap.

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
- [ ] The canvas's width today at 1920, 1440, 1280, 1024 and 860 — the spec says 1260, 780, 620,
      about 490 and 804. Confirm or correct the *today* column with the numbers you measure.
- [ ] Fold a panel and watch a point of the drawing: does `reframe` run when the grid's columns
      change, or only on a window resize?

**Done when — check in the app.**
- [ ] The canvas is 1280, 800 (1384 in focus mode), 640, 720 and 804 px wide at 1920, 1440, 1280,
      1024 and 860.
- [ ] `[`, `]`, `\` and Esc out of focus mode work, on a German layout too.
- [ ] Strips: Parts' thumbnails select their pieces; Properties' icon names the selection; the
      overlay takes focus, gives it back, and closes on Esc or a canvas click.
- [ ] Three chips, always; every panel reachable at every size, by mouse and by keyboard.
- [ ] Choices survive a restart, and an automatic fold does not change them.
- [ ] Folding a panel does not move the drawing.

**Tests.** A pure `layoutFor(width, height, choices, focus)` → each panel docked, strip or overlay,
with the property that every panel is reachable at every size. The preferences' new flags, read
and validated as the existing ones are. E2E at the five widths.

**Docs.** UI Foundations' layout rules, the shortcut list, the roadmap.

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
- [ ] Where Holes, Spacing and Runs come from, and whether the domain already reports spacing
      against pitch.
- [ ] Which panels share the Flip and Mirror buttons — the part's and the feature's — so both move.

**Done when — check in the app.** Mockup 02's order for a hole set; mockup 11's Arrange and
Delete; the subtitle; mockup 01's totals with nothing selected; at 860 × 600 Properties scrolls with
Delete pinned; every disabled button still says why.

**Tests.** The comparison line's rule (unit, with the rounding edge); the totals from a project
(unit: Cut, hidden pieces, several irons); E2E for the order and the footer.

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
- [ ] Is the project's name renamed in place today? If the name becomes part of the menu button,
      renaming must stay reachable — a *Rename…* item, or F2 on the name. A decision if neither fits.
- [ ] What *Export PDF* does on a second press: is anything remembered ("the last settings")?
- [ ] Where severities are counted, so the indicator and the drawer can never disagree.

**Done when — check in the app.** Mockup 08's rows at 1920, 1024 and 860, nothing clipped or wrapped
at 860 (the existing E2E holds it); each half named on its own (the accessibility scan); the
indicator's three states with the drawer opening; the Print dialog listing problems first; the
switch by arrows and by `Ctrl+1`/`Ctrl+2`; `F1` opens Help; one announcement per change; the edited
flag set and cleared (checkable on a Mac only — say whether it was).

**Tests.** The indicator's state from a list of problems (unit); the split buttons and switch by
keyboard and their names (E2E); the 860 px fit (E2E); the edited flag through the fake host.

**Docs.** The top-bar spec's successor note, `docs/getting-started.md`, the roadmap; 7.6's text
calls Print green.

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

**Find out first.** How features are ordered today and whether a feature can follow two others;
which row actions the right-click menu lacks; how the list behaves with 30 features.

**Done when — check in the app.** Mockup 09's three states; the keys, with a screen reader's
announcements sensible (the accessibility scan passes); a canvas click reveals its row.

**Tests.** The nesting from the derivation graph (unit); keyboard movement as a pure function over
the visible rows (unit); E2E for keys and reveal.

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
- **Line 1:** holes · spacing against pitch · runs · Cut ×N — a check when spacing equals the pitch
  (U.6's rule), a warning glyph and words ("stretched 1.8 %") when not.
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

---

## 6. After 1.5

The release that was called 1.5 on 2026-10-07 — update discovery (8.9), guides (3.10), convert to
drawn path (3.12), drafting dimensions (4.10b), Windows printing (7.6c) and the rest — is 1.6,
unchanged and in its own order. *Later* gains two items this pass leaves room for: hole matching
and thread length in the selection bar (R-14's third line), and measuring on the sheets, if U.9
leaves it out.
