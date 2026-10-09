---
name: properties-panel
description: Builds slice U.6 of LeatherCAD's UI refinement — the Properties panel ordered as the work goes (a hole set's iron, pitch, fit and corners, then its result as large readouts and one line comparing spacing with pitch, then name and follows, Arrange as icon pairs, Delete alone at the foot), a subtitle naming the piece and its Cut, and with nothing selected the job's totals — end to end, tests first, measured in the running app, and opens a pull request into develop without merging it. Use when asked to build, continue or fix U.6.
model: opus
effort: high
---

# U.6 — Properties: order, weight and job totals

You build **slice U.6** of LeatherCAD's UI refinement (release 1.5, requirement **R-05**, the
answer to the spec's §7 question 4; mockups `02-stitch-holes-selected.png`,
`11-properties-actions.png`, `01-design-view.png`). LeatherCAD designs leathercraft patterns that
print at exact 1:1 scale: **a line drawn as 100 mm measures 100 mm on paper.** This slice changes
nothing that prints.

**Why a maker wants it.** The stitch-holes panel is where a maker chooses iron, pitch and fit, then
reads whether the spacing came out right before punching leather. Today those sit among six equal
Flip, Mirror and Delete buttons. The panel should follow the work — set the iron, read the result,
name it, arrange it, delete it last — and with nothing selected it should say what the job is:
pieces to cut, holes to punch, sheets to print.

## Your process

Your standing process is `.claude/agents/ui-refinement.md` — read it first and follow it: look
before changing, trace every caller, tests first, the smallest change, look again, prove print did
not move, run everything, docs in the same commit, a pull request into `develop`, never merged.
Then read, in this order:

1. `CLAUDE.md` — the invariants. Breaking one is a bug even when the tests pass.
2. `docs/superpowers/plans/2026-10-08-ui-refinement.md` §0–§4 and **§5 U.6**, which is your task,
   and the *As built* notes under U.1–U.3.
3. R-05, §1–§3 and §5's line on 600 px in
   `docs/superpowers/specs/2026-10-08-ui-refinement-requirements.md`; open the three mockups with
   Read.
4. `docs/glossary.md` on **pitch** (the iron's nominal spacing) and **spacing** (what the fit
   achieved) — the words this panel is about.

Where this file, the plan and the code disagree, the code wins: check, and correct the plan in
your pull request.

## Working beside U.4

Another agent is building **U.4** (the zoom control) at the same time. It works in `CanvasHost.tsx`,
`keymap.ts`, `App.tsx`'s key handlers and the canvas area; you work in the Properties panel. Two
rules:

- **One display.** End-to-end runs share the maintainer's live screen, and two agents' Electron
  windows steal focus and hover from each other. Run every Playwright command — `pnpm test:e2e`,
  a single spec, a scratch screenshot spec, `pnpm test:visual` — behind one lock:
  `flock /tmp/leathercad-e2e.lock <command>`.
- **Pixel references cannot be merged.** If U.4 merges into `develop` before you, rebase onto
  `origin/develop` and retake them (`pnpm build && flock /tmp/leathercad-e2e.lock pnpm
  test:visual --update-snapshots`), looking at every changed image. Keep your edits to `en.json`
  and `styles.css` in their own places, so either order rebases cleanly.

## The code as it is (develop after 1.3.5, read on 2026-10-09)

**The panel** is `apps/desktop/src/renderer/src/PropertyPanel.tsx` (~809 lines):
- With nothing selected (~84–100) it shows a title and one sentence (`properties.nothingSelected`,
  with keys from `keysInSentences`) — where the job totals go.
- For a feature (~102–285): the header (its mark, name, *Mirrors* and *Locked* badges); then
  **`PartFields` (Name, Cut) for every selected feature** (~138) — R-05 wants them only when the
  piece or its outline is selected; the feature's section with its editor (`FeatureEditor`,
  `featureEditors/index.tsx`); `Measured` (~740); problems; a **Flip** section of two
  `flipButton`s (~230); a **Mirror** section, `mirrorButton` ×2 and `FoldMirrorButton` (~246);
  `DeriveActions` (~537: the *Add stitch line*-kind buttons) and `AllowanceButton` (~616); and
  `DeleteButton` (~487).
- `PartProperties` (~322) is the same panel for a part picked by its heading: Name, Cut, problems,
  its own Flip.
- Every refusal is a `ReasonedButton` / `ReasonedRow` that shows why beneath it (F.1): keep every
  reason, and keep asking the same query the command checks.

**The hole set's editor** is `featureEditors/StitchHoleSetEditor.tsx` (~123 lines): Iron (a select
from `IRON_PRESETS`, `irons.ts`), Pitch, Fit, Corners; then readouts — *Holes*
(`holes.count`), *Spacing* (`formatMm(holes.achievedPitchMm)`), and *Runs* only when there is more
than one. The numbers are the domain's `StitchHoles` (`packages/domain/src/stitch.ts` ~48): `count`,
`achievedPitchMm` over the whole set, and `runs: RunReport[]`, each with its own `lengthMm`, `count`
and `achievedPitchMm`. The pitch is the derivation's `op.pitchMm`.

**Job totals** read what exists, computed nowhere new: the parts and their `quantity` (Cut) from the
document; each hole set's `holes.count` from `evaluate(project)` (as the panel already does); the
sheets and their paper from `sheetPlanFor(project)` and what does not print from
`printStatusFor(project)` (`renderer/sheets.ts`, both cached per project). Mockup 01 reads
*Pieces* `3 · 4 to cut`, *Holes* `250 · 146 + 52 ×2`, *Sheets* `2 · A4, portrait`.

**Keys and words (U.3).** Delete's cap is the keymap's `delete` command: `<KeyCap
command="delete" />` from `keyCaps.tsx`, which reads *Del*. A tooltip takes its key with `<Tooltip
text=… keys="commandId">`. No key is ever written inside an `en.json` sentence (a test holds it),
and every word is in `en.json` through `t()`, plurals as CLDR keys.

**Tokens.** The large readouts are `--t-num-lg` (500, 17/22). Labels are styled by
`.panel.properties .field-label` (`styles.css` ~686): R-05 wants them 68 px wide. Properties is 264
px wide below 1280 px and 288 above today; U.5 makes `properties-width` 264 everywhere later, so
design for 264.

## What to build (R-05)

- **A hole set, top to bottom:** Iron, Pitch, Fit, Corners · Holes, Spacing and Runs as 17/22
  readouts · **one line comparing spacing with pitch**, with a glyph — "Spacing matches the pitch"
  with a check; otherwise the stretch or squeeze in words, e.g. "Spacing is stretched 1.8 %", with
  the warning glyph, the same words R-14's selection bar will use · Name, Follows · **Arrange** ·
  **Delete**.
- **"Matches" is decided by what is shown**: the difference rounds to 0.0 % at the precision the
  line displays. Never a new epsilon (invariant 7). Write it as a pure function with its tests.
- **Arrange:** Flip ↔ ↕ and Mirror ↔ ↕ as icon pairs with tooltips, plus *Across fold* with its
  label (mockup 11). Every disabled reason stays.
- **Delete alone in a footer under a rule:** red, its glyph and the *Del* cap; undoable, as it is.
  **At 600 px tall** Properties scrolls and Delete stays fixed at its foot.
- **A feature's subtitle** names the piece and its Cut, then the chain it follows: "Outer · Cut ×1 ›
  Stitch line › Stitch holes". **Name and Cut fields show only when the piece or its outline is
  selected.**
- **Field labels 68 px**, so values like "A hole on each corner" fit.
- **Room for a third readout line** later (hole matching, thread length: not built, no
  placeholder).
- **With nothing selected: the job** — the project's name; *Pieces* `N · M to cut`; *Holes*
  `total · per set`; *Sheets* `N · paper, orientation`.

## Find out first

- [ ] *Before* screenshots of mockup 02's state (the sample's Outer stitch holes selected), mockup
      11's Arrange, and mockup 01 with nothing selected, at 1440 × 900 and 860 × 600.
- [ ] Which sections every feature kind shows, and where `DeriveActions`, `AllowanceButton` and
      `Measured` belong in R-05's order. The requirement lists the hole set's; for the other kinds
      keep the same order of kinds of thing: what it is, what it came out as, its identity, arrange,
      delete. Say where you put each, and why.
- [ ] Whether the domain already reports spacing against pitch anywhere (`validate.ts` decides
      which runs are worth a problem) — reuse it rather than computing a second rule.
- [ ] What counts "to cut": a hidden piece is not printed (Q20) — decide whether it is counted,
      and say why in the pull request. Recommended: count what prints, since that is what the maker
      cuts from these sheets.
- [ ] How several hole sets with different pitches read in *Holes* (`146 + 52 ×2`), and what a
      piece with no stitching shows.

## Done when — check in the app

- [ ] A hole set's panel reads in mockup 02's order, with the comparison line and its glyph; a
      stretched set (try a fit that cannot meet the pitch) says by how much.
- [ ] Arrange is icon pairs with tooltips, each disabled one still says why (mockup 11).
- [ ] Delete sits alone at the foot with its *Del* cap; at 860 × 600 the panel scrolls and Delete
      stays in view.
- [ ] Name and Cut appear for a selected outline or piece, and not for its stitch line.
- [ ] The subtitle names piece, Cut and chain.
- [ ] With nothing selected, mockup 01's totals, matching what the sample really holds.
- [ ] "A hole on each corner" fits beside its 68 px label at 264 px.
- [ ] Printed output, exports and fixtures did not move.

## Tests

- **Unit, first:** the spacing-against-pitch rule as a pure function — the rounding edge exactly at
  0.05 %, stretched and squeezed, a set with several runs; the job totals from a project — Cut,
  hidden pieces, several irons, no stitching, an empty project — as a pure function. Property
  tests where the input is numeric (any pitch and spacing).
- **E2E:** the hole set's order, the comparison line, Delete in its footer and in view at 860 ×
  600, Name and Cut only for an outline, the totals with nothing selected; the accessibility scan
  passes.
- **Pixels:** the panel changes, so `pnpm build && flock /tmp/leathercad-e2e.lock pnpm test:visual
  --update-snapshots` changes the references — look at every image.

## The machine

- `export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"` before any pnpm; a new
  worktree needs `pnpm install --frozen-lockfile`.
- End-to-end tests run on the maintainer's live desktop: a hover or key from the person at the
  machine, or the other agent's window, can fail one. Rerun a failure on its own, behind the lock,
  before believing it; CI's headless run decides.
- Branch `feat/ui-properties-order` from `origin/develop`. Before pushing, `git fetch origin` and
  rebase onto `origin/develop` if it moved: keep both sides' facts in any roadmap conflict, and
  retake the pixel references if U.4 landed first.
- Nothing private in commits or the pull request: no home paths, emails or session links.

## Report back

The pull request's link; what a maker will notice; each *Done when* line and how you checked it;
the check results with their counts; decisions for the maintainer; bugs fixed on the way; anything
left undone; and what U.7 (the top bar) and U.17 (the selection bar, which reuses the comparison
line) should know.
