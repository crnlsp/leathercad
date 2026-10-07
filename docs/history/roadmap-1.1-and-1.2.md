# Roadmap 1.1 and 1.2 — the record

> **Archive.** Everything that shipped in 1.1.0, 1.1.1 and 1.2.0 (2026-09-26 and 2026-09-27), moved
> here from [`docs/roadmap.md`](../roadmap.md) word for word, with what each item found. It is not
> updated any more. The roadmap called all of this *1.1*; it went out as three releases, each cut
> as soon as release-please offered one, while ten of 1.1's slices were still to do. That is why a
> release now waits for its whole section of the roadmap
> ([`CONTRIBUTING.md`](../../CONTRIBUTING.md#changelog-and-releases), R7).

| Release | What it carried |
|---|---|
| 1.1.0 | 8.2, 8.3, 8.5 and 8.4b, and the QA pass's fixes Q2, Q8–Q14, Q16 and Q18 |
| 1.1.1 | Q1, Q3, Q5, Q6 and 3.11 |
| 1.2.0 | 3.9b, 3.9c, 3.9d and Q25 |

## Everyday use

- ✅ **8.2 Preferences and recent files.** `preferences.json`, owned by the main process
  ([`file-format.md`](../file-format.md) §6); *File → Open Recent* (absorbs 5.3c), which grants a
  path only because it is on the list, so the dialog-only file rule holds; the canvas legend and the
  wide tool rail remember whether they were open; and a keyboard shortcut map (*Help → Keyboard
  Shortcuts*, Ctrl+/ or `?`), held by a test to the menu's accelerators and the tool keys. End-to-end
  tests launch with a config directory of their own, so a remembered preference cannot leak from one
  test to the next or into a developer's own. Fixed alongside: Q8, Q9, Q14, Q16 and Q18.
- ✅ **8.3 A worked sample project.** *Help → Open Sample Project*, and a link in the empty Parts
  panel: the bifold wallet the README demo draws, plus a pair of card slots on the lining folded
  across its fold and a dimension, in `fixtures/projects/bifold-wallet.lcp`. Built by the app's own
  commands in `sampleProject.test.ts`, which holds the file to its recipe and the sample to no
  problems; bundled with the main process, and opened untitled and clean. Absorbs 5.4. Fixed
  alongside: Q2, Q10, Q11, Q12 and Q13 — the sample is a bifold, which is exactly where Q13's join
  and Q2's fold ended up.
- ✅ **8.5 File association and Flatpak.** Double-click a `.lcp` to open it: `fileAssociations`
  register it with the NSIS installer and the dmg, and on Linux the desktop entry's `MimeType` plus
  a shared-mime-info file that knows a project by its name and by the `mimetype` entry inside it.
  The path arrives on the command line (Linux, Windows) or as *open-file* (macOS); the main process
  grants it and the renderer asks for it once it is ready, so it cannot arrive before anything is
  listening. No single-instance lock: a second project opens in a second window, as it always has.
  A Flatpak (`pnpm package:flatpak`) on Electron's base app and the Freedesktop 24.08 runtime, with
  the home directory and no network, built by `package.yml` and attached by the release workflow.
  **Not verified by hand yet:** the Flatpak could not be built where it was written (Flathub was
  unreachable), so its first install on a real desktop is still to do, and so is a double-click on
  each platform — add both to the release checklist's manual pass.
- ✅ **8.4b The rest of the native menu.** *Tools* (every tool with its key, grouped as the rail
  groups them — "Tools" rather than "Draw", since Select, Rotate and Scale draw nothing); *View →
  Zoom In, Zoom Out, Fit to Pattern* (Ctrl+=, Ctrl+−, Ctrl+0, also in the window and the shortcut
  map); and *Paper*, which lists the paper list's own choices in its own words with the current
  one checked. The renderer sends the list when it changes and the main process validates it and
  rebuilds the menu; choosing one is the same single undoable edit as the list. Q19 turned out to be
  7.4a's already.

## Drawing and editing

- ✅ **3.9 Vertex editing.** Add, remove and move a drawn path's points; corner ↔ smooth. In three
  slices:
  - ✅ **3.9b Corners survive point edits.** `editPathPoint` moves, adds or removes a point of a
    drawn path in one undoable step, and renumbers every stitch run and dimension attached to the
    path's corners — or to anything derived from it — so each stays on the corner it was on. An
    edit that would take an attached corner away is refused (`CORNER_IN_USE`). Closes ADR 0010's
    open item without vertex ids or a format change (ADR 0010, amended). Commands and geometry
    only; the tool is 3.9c.
  - ✅ **3.9c The Edit Points tool** (N, under Modify). A handle on each point of the selected
    drawn path: drag one to move its point, press an edge to add a point there and drag it in the
    same gesture, and Delete removes the point last pressed — each one step to undo. A refusal is
    said beside the pointer; a shape or a locked outline says why it has no points to edit, and a
    press on another drawn path picks it. Built on `closestPointOnPath`, new in `packages/geometry`.
    Pressing an edge replaced the double-click first written here: the canvas's double-click
    already fits the view, and one gesture that adds and places a point is fewer steps.
  - ✅ **3.9d Corner ↔ smooth,** as a rounded corner with a radius — an arc, which offsets — rather
    than a Bézier, which the stitch-line offset refuses. In Edit Points, **R** rounds the picked
    corner to the *Corner radius* in the work bar, and sharpens a rounded one picked by either end;
    R is left to the Rectangle tool when no corner is picked. A stitch run or dimension on that
    corner stays on it, now at the middle of its rounding. Refusals say why: the rounding does not
    fit (`ROUNDING_DOES_NOT_FIT`), or there is no rounding to sharpen (`NOT_A_ROUNDED_CORNER`).
    Built on `roundPathVertex` and `sharpenPathArc`, which are inverses and property-tested as such.
- ✅ **3.11 Isolate a tool's overlay from the draw loop.** An overlay that throws stopped the whole
  canvas painting (grid, rulers, every feature). `ToolManager` now runs a tool's overlay and notice
  so that a throw costs only that tool's part of the frame — the snap glyph, the rulers and the
  drawing still paint — and reports it once, naming the tool, to the console, which the app's log
  records (ADR 0015). Held by a deliberately throwing tool in `tool.test.ts`.

## Known issues fixed

| # | What | Where it was found | Plan |
|---|---|---|---|
| **Q1** | **bug** · `intersectSegments` is not symmetric: two collinear lines whose ends are 1e-9 mm apart give one intersection in one argument order and none in the other. Reproduces with `LEATHERCAD_FC_SEED=-1607984333 pnpm exec vitest run --project geometry intersect.test` | A local property-test run, 2026-09-24; the same "order-dependent `intersectSegments`" Phase 4 recorded | ✅ Fixed: the gap between collinear lines is measured in millimetres against `EPS_POINT`, not as a parameter against `EPS_PARAM` (which made the same gap a touch on a long line and a miss on a short one), and line/line is solved in one canonical argument order, so `(a, b)` and `(b, a)` are the same arithmetic. The counterexample is an example test, and a new property aims collinear pairs at the tolerance |
| **Q2** | **bug** · A fold drawn edge to edge is reported as off the material (DR2's sampled containment) | Phase 4 close-out; met again drawing the README demo, whose folds stop short of the edges | ✅ Fixed with 8.3: a line's point within one storage quantum of the edge is on the leather |
| **Q3** | Two reads of refs during render in `CanvasHost.tsx` can show stale state: the cursor style and the canvas notice's bounds | The engineering-tooling checkpoint | ✅ Fixed: the cursor comes from the tool the props name, not the manager (which switches only after the render), and the notice's bounds are state set by the resize observer. The other eight are the deliberate latest-value pattern |
| **Q5** | The property panel's sizing, and the Parts tree cutting feature names at about ten characters | UI audit, deferred opportunities | ✅ Names had wrapped rather than truncated since F.6, but below 1280 px Parts narrowed to 200 px and a name broke inside a word (*Cut-out mirrore / d*). Parts now keeps 220 px at every width; an end-to-end test holds every word of the sample's names whole at each width band. Properties still steps down to 264 px, which fits its fields |
| **Q6** | `packages/domain/src/workloads.ts` shows 0 % coverage since the performance ceilings moved to their own step | Moving `perf.test.ts` out of the coverage run | ✅ Fixed: excluded from coverage as the test support it is |
| **Q25** | **bug** · `offsetPath` out and back refuses a rounded rectangle whose corner radius is about `EPS_POINT` (1e-7 mm): the two lines either side of a corner arc that small meet within the tolerance, and `selfIntersections` counts that as a crossing. Reproduces with `LEATHERCAD_FC_SEED=42 pnpm exec vitest run --project geometry offset.test`; fails the same way before Q1's fix | Checking Q1's fix across seeds, 2026-09-26 | ✅ Fixed with 3.9b, where it kept failing `pnpm check` at random. Not the offset: `intersectSegments` let a crossing sit up to `EPS_PARAM` past a line's end *as a parameter* — 2e-7 mm on a 200 mm side, wider than `EPS_POINT` — so the sides either side of a kept 1.5e-7 mm corner arc read as crossing. The slack is now `EPS_POINT` in millimetres at any length, the rule Q1 applied to the collinear case. Both seeds are regression tests |

## The independent QA pass (2026-09-24), fixed

An outside QA pass over `main` at `d54b2d7` (v1.0.x), on Linux under Xvfb, before the Sheets view
landed. Its ids (B1–B7 confirmed, S1–S10 suspected) are kept in brackets so the report can be read
beside this table; the numbers here continue the Q series, because `S1`–`S7` already name the
structural invariants in [`domain-model.md`](../domain-model.md) §8. Each confirmed bug is fixed
alongside the 8.x slice it is nearest to, one pull request per slice.

| # | What | Severity | Plan |
|---|---|---|---|
| **Q8** | **bug** (B1) · Mirroring an **outline** puts a second outline in the same part. It saves, and the file then **cannot be reopened** (`PART_ALREADY_HAS_OUTER`); the crash-recovery copy is set aside as corrupt too, and the PDF prints both outlines as one piece. `mirrorFeatures` never asks `additionRefusal`, and `counterpartOf` copies `role: 'outer'` | P0 | ✅ Fixed with 8.2. The outline *is* the piece, so its counterpart — with every counterpart from that part — now goes into a **new part** beside it, which is the left-and-right pair the mirror design was always about. A property (`commandRoundTrip.test.ts`) now plays random sequences of 26 commands (29 since 3.9b) and holds every result to saving, reopening byte-identically and paginating; it finds this bug on the old code in one step |
| **Q9** | **bug** (B2) · Mirroring a **dimension** makes a `measurement` with a `derived` source, which the schema refuses on open. The panel shows *Offset NaN mm*; `mirrorRefusal` refuses only labels, and the fold mirror inherits the hole | P0 | ✅ Fixed with 8.2. Refused, by `DIMENSION_NOT_MIRRORED` (X3), with a reason the disabled button shows; the fold mirror inherits the refusal. Held by the same property |
| **Q10** | **bug** (B3) · **Duplicate** re-points only a derived feature's `sourceId`. A dimension's anchors and a fold mirror's `foldId` still name the original, so the copy's dimension measures the original, its caption sits over the original, a mirrored slot lands 230 mm off the copy, and the PDF tapes the copy across extra sheets | P1 | ✅ Fixed with 8.3: Duplicate re-points every reference inside the part — a derivation's source, a dimension's two ends and a fold mirror's fold |
| **Q11** | **bug** (B4) · A dimension or a *Follows* can reach **another part**. The part's printed extent then spans the gap on the board, so moving a piece on the board changes the sheet count (4 → 7 pages), which the Sheets spec's criterion 2 forbids; readiness reports nothing | P1 | ✅ Fixed with 8.3: a derivation laid on its source (a stitch line, holes, an allowance) must follow something on its own piece (`FOLLOWS_ANOTHER_PART`), and a dimension measures one piece (`MEASURE_ACROSS_PARTS`, which the Measure tool says at the second click; it prefers the first piece's corner where two pieces touch). A mirror may still follow another piece — it is placed by its axis, and a mirrored piece is one (Q8). Commands only: a file from before holds what it holds, and opens |
| **Q12** | **bug** (B5) · Packing ignores **captions**: a long caption on a narrow part prints over its neighbour's, or past the sheet edge (x = 327 mm on a 297 mm sheet) | P2 | ✅ Fixed with 8.3: a piece is packed by its caption's width where that is wider, up to the printable width; a property holds captions off each other and on the paper |
| **Q13** | **bug** (B6) · A piece tiled **1 × 2** always has its join on its centre line — on a bifold, exactly on the fold, where the fold mark cannot be told from the cut line | P2 | ✅ Fixed with 8.3: the tile grid slides along its spare to keep every join at least 15 mm from a straight fold, and stays centred when it has no room; a property holds the coverage |
| **Q14** | **bug** (B7) · Hiding a part keeps its features **selected**: the panel edits an invisible outline, and Delete removes it unseen | P3 | ✅ Fixed with 8.2. An edit drops from the selection what it removed or hid; a feature picked while already hidden, from the parts panel, stays picked |
| **Q16** | (S2) **Save race**: the saved document is recorded after the write, from the store, not from the bytes written, so an edit landing during a slow write would be marked saved | P3 | ✅ Fixed with 8.2: the document marked saved is the one the bytes were made from |
| **Q18** | (S4) Export suggests *Wallet v1.pdf* for a project named *Wallet v1.2*: the name is cut at its last dot | P3 | ✅ Fixed with 8.2: only a trailing `.lcp` is taken off |
| **Q19** | (S5) The paper menu label ignores orientation and implies the whole sheet is printable | P3 | ✅ Already fixed by 7.4a, found checking it in 8.4b: the list reads *1 sheet of A4, landscape*, and its tooltip gives the printable area. The native Paper menu uses the same words |
