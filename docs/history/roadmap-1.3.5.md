# Roadmap 1.3.5 — the record

> **Archive.** Everything that shipped in 1.3.5 (2026-10-09), moved here from
> [`docs/roadmap.md`](../roadmap.md) word for word, with what each item found; only its links were
> changed, to reach the files from this folder. It is not updated any more. It carried 7.6, 7.6b,
> 7.8, 6.2 and 6.5, the first three slices of the UI refinement (U.1 to U.3), the fixes Q7, Q17
> and Q32, and the release engineering R1 (Linux), R3, R4 and R5. The record before it is
> [`roadmap-1.3.md`](roadmap-1.3.md).


The theme is *print true, and cut true*: what leaves the app, on paper or as a file for a cutter,
is the size that was drawn. It is the first part of what the roadmap called 1.4. The maintainer
split 1.4 on 2026-10-07 so that the print-scaling fix reaches people sooner: printed from a PDF
viewer, a 1.3.0 PDF measured 96 % on paper (7.6). Everything else moved to the release after as it
was, so this could ship first ([`CONTRIBUTING.md`](../../CONTRIBUTING.md#changelog-and-releases)); that
release is [1.6](../roadmap.md#16--after-the-refinement) since the UI refinement took 1.5 on 2026-10-08. The
order within each group is the suggested order of work.

**It ships as 1.3.5, not 1.4** — the maintainer's decision on 2026-10-09: what is on `develop` is cut
here as a point release, with the first three slices of 1.5's UI refinement, which landed before
it. release-please would call a release with features 1.4.0, so the commit that made this section
1.3.5 carries `Release-As: 1.3.5`.

**What it still waits for** (2026-10-09): nothing. R1's Linux rows are recorded: the print test
through *Print*, portrait and landscape, measured true. Q27 moved to 1.5, whose UI changes every picture it would retake, and R1's
macOS and Windows rows moved there as R8. 7.6b, 6.2 and Q7 were finished on branches cut
before the split, so their ticks had landed in the release after; they are back in the release
they belong to.

## Output

- ✅ **7.6 Print from LeatherCAD.** A physical print measured the gauge at 96 × 4.8 mm. The PDF
  was exact; CUPS fitted it into the printer's margins, because no viewer's job carried
  `print-scaling=none`. Now **Print**, green and the window's primary action, opens LeatherCAD's
  own Print Preview. It draws the PDF itself with pdf.js, offers only printer, paper, orientation,
  which sheets and copies, shows *100 % — locked* and *No scaling*, and sends those same bytes to
  `lp` with `print-scaling=none` (*Print 3 sheets*). Where there is no CUPS client to drive
  (Windows, the Flatpak), its last step is *Save PDF…* with the *Actual size* warning.
  *Export PDF* stays, for a file. [ADR 0019](../adr/0019-print-from-the-app.md),
  [`printing.md`](../printing.md) §13. Sheet 1 of the print test, sent this way on Linux, measured
  true (log, 2026-10-01). macOS runs the same path and is unverified until measured.
- ✅ **7.6b Landscape from the Print Preview.** CUPS cannot turn a landscape page onto upright paper
  without shrinking it, and with scaling off it cuts it off, so the preview does not send landscape
  yet. The writer puts every sheet in the PDF upright, with a landscape layout turned a quarter
  inside it (`printing.md` §6.1 and §13), then the preview sends it.
  ✅ Built as described. On the way: the turn is the one transform the writer emits — `0 1 -1 0 W 0
  cm`, a quarter turn with no scale — and only *Print* sends it. *Export PDF* keeps a landscape
  page, which a viewer shows the right way up; a page `/Rotate` would have done that for the print
  form too, but `pdftopdf` keeps it and the page is cut off at 210 mm again, as measured through
  `pdftopdf` and `pdftoraster` before deciding ([ADR 0019](../adr/0019-print-from-the-app.md),
  amended). The preview turns only its view of a landscape page. A landscape
  sheet printed through *Print* measured true on paper (R1, 2026-10-09).
- ✅ **6.2 SVG export.** Millimetre units, one group per layer, the single Y flip, with the
  accuracy tests from [`printing.md`](../printing.md) §14.
  ✅ Built as described: *Export SVG…*, in a menu beside *Export PDF*, writes the scene the PDF is
  written from, laid out as the maker arranged the board ([`printing.md`](../printing.md) §10). On the
  way: strokes take the canvas's role colours, not the PDF's black, because laser software sorts
  by colour; an arc is written in pieces of at most a quarter turn, because an SVG arc's centre is
  worked out from its endpoints and a half turn could lose up to 0.035 mm to a rounding of 0.1 µm
  (the round-trip property found it); and an export to a file ends in the same notice of what was
  left out as the PDF's, in the words *in the file*. **Still owed:** a real laser or vector
  editor has not opened one; the checks read the file by hand and rendered it with librsvg.
- ✅ **6.5 DXF export** (R12), for laser and CNC users.
  ✅ Built as described, except that [`printing.md`](../printing.md) §11 was wrong: R12 has no
  `LWPOLYLINE` and no `$INSUNITS`. It is R12 with `POLYLINE`s for flattened cubics, and with
  `$INSUNITS = 4` and `$MEASUREMENT = 1` as extra header variables, for the reasons §11 gives. A
  stitch hole is a `CIRCLE` of the scene's 1 mm size, not a `POINT` by option. Layers are the
  SVG's groups, with a colour index and a linetype of their own. **Still owed:** LightBurn, or a
  laser, has not opened one — the check that tests the units; LibreOffice Draw's importer read it,
  but rescales to its page.
- ✅ **7.8 A slimmer verification block, and fewer sheets.** The 50 mm square, the 100 mm ruler,
  the instruction and the footer took 62 mm at the foot of every sheet, and the footer printed
  5 mm from the edge. Now one strip of 8.5 mm, inside the margins: a 100 × 5 mm gauge with the
  instruction in it; beside it what the sheet is, and on a taped sheet which sheets it joins; and
  LeatherCAD's mark in the corner ([`printing.md`](../printing.md) §8.1). Long, not square, because
  length shows a scaling error and a 25 mm square would hide one. The shelf packer gave way to one
  that fills gaps and goes back to earlier sheets, and a part turns a quarter when that saves a
  sheet — lifting 7.2's grain rule, by decision (§5.5). The bifold sample on A4 portrait takes two
  sheets, not five, with nothing taped; over 2,000 random projects, about half the sheets.
  ✅ Built as described. The print test's strap is 275 mm, not 250, so that A4 portrait still tapes
  it. The new physical measurement this item always required is recorded: the print test's rows in
  [`print-verification-log.md`](../print-verification-log.md) read the gauge, and measured true (R1).

## The window, refined — its first three slices

From [1.5](../roadmap.md#15--the-next-release)'s UI refinement, done before this was cut, so they ship here.

- ✅ **U.1 Pieces read as pieces** (R-02). Every piece filled on the board, the one being worked on
  warmer; no grid inside a piece; the 1 mm grid from 160 % and the 10 mm grid from 40 %; cut lines
  1.5 px. On the way, zoom is defined once, in CSS pixels per millimetre: on a 2× display the grid
  and the stitch detail switch at half the zoom today, and every line draws half as thick.
  ✅ Built as described. Measured in the app: the 1 mm grid came in at 106 % on a 1× display and
  53 % on a 2× one, the 10 mm at 16 % and 8 %; now 158.75 % and 39.7 % on both. A cut line measured
  1.75 device pixels at 1× and at 2× — 0.9 CSS px — and is 1.5 and 3 now; a grid line 1 and 2.
  `cssPxPerMm` and `zoomPercent` in `render/view.ts` are the one definition of zoom; every
  screen-constant size is a CSS pixel, and each screen backend applies the display's ratio once.
  Found on the way, and fixed: the Sheets view's labels and dashes, the rulers, the snap glyph, Edit
  Points' handles, the polyline's close radius and the drag threshold were sized in device pixels
  too — half size, or half the reach, at 2×. Every piece's fill lies beneath every line on the
  board, so a piece laid over another never hides it. Printed output did not move: no export test,
  golden fixture or format fixture changed.
- ✅ **U.2 Captions and dimension numbers readable at every zoom** (R-01). 12 px at any zoom, with a
  halo; "Card pocket ×2" over "52 holes · 3.85 mm"; the name only below 40 %; a caption pinned to
  the canvas's top-left while its piece's top is off screen. Paper keeps its true-size "Card pocket
  — cut 2", and the screen's words move to the catalogue.
  ✅ Built as described. Measured in the app: at 60 %, where the wallet fits, a name was 6.4 CSS px
  tall and a dimension's number 6.8; at 23 % they were 2.4 and 2.6. Now every caption and value is
  12 CSS px at every zoom, 24 device pixels at 2×. The value is centred on its dimension line, and
  its halo breaks the line. A caption pins as soon as it would run under the ruler, not only once
  the piece's top has gone, or the topmost piece's name hid under the ruler at 60 %; two pinned
  captions stack. The caption's words come from `en.json` through a `caption` option, and the
  detail names the pitch, no longer the iron. Found on the way, and fixed: the canvas loaded only
  the Regular weight before painting, and "Tape join" was 11 px. Printed output did not move: no
  export test, golden fixture or format fixture changed, and a new test holds paper's "Card pocket
  — cut 2" at 2.8 mm.
- ✅ **U.3 Keys by where they are, shown as caps, and tooltips that fit** (§2, §6, R-10). One keymap
  matching `KeyboardEvent.code`, shown as the local character and as ⌘ on macOS; keys leave the
  catalogue's sentences; a tooltip is one line up to 360 px, flipped and shifted to stay inside the
  window — the thin column at the right edge goes.
  ✅ Built as described, with one change: a letter is the key that *typed* it, read from the press
  rather than from a layout map resolved at start, so A stays Arc on a French keyboard even when the
  maker switches layouts mid-session; the layout map, which this Electron answers, is read only to
  show keys. Measured in the app: *Sheets*' tooltip at 860 px was a 68 px column five lines tall,
  flush with the window's edge; it is one line, 314 px, 8 px inside. Found on the way, and fixed: a
  key held exactly its modifiers nowhere — Ctrl+Shift+P printed, Super+S saved on Linux; on a
  Cyrillic keyboard Ctrl+Q did not quit, and the polyline's A would have lost its run to the Arc
  tool; the problem badge's tooltip was English in the code, past an audit that did not read
  template strings. On review, zoom follows the + and − a keyboard prints, as before U.3 — by
  position a German Ctrl+- opened the shortcut list and its Ctrl++ did nothing — while a digit keeps
  its place (Ctrl+1 is Design where that key types +), and the caps show only keys that work on the
  maker's layout. Printed output did not move.

## Known issues and findings

Everything found along the way that is not fixed yet, with where it was found. The ones marked
**bug** come first.

| # | What | Where it was found | Plan |
|---|---|---|---|
| ✅ **Q7** | The golden-fixture layer [`testing.md`](../testing.md) §2 plans — committed geometry outputs, reviewed when they change — was never built. The `.lcp` format fixtures and the SVG snapshots cover part of it | The post-1.0 cleanup | ✅ Built as described, for offsetting and hole distribution ([`testing.md`](../testing.md) §11): eight real pieces, stitched 3 and 4 mm in or allowed 3 and 4 mm out, with a 3.0 and a 3.85 mm iron, every number on the 0.1 µm grid. Each was checked by hand once. On the way, not fixed: the sample project's scooped card pocket gets no stitch inset, because Tier 1 cannot trim the scoop's arc against the top edge, and the user is told the margin is deeper than the edge can hold, which is not why. The sample draws that seam by hand; the golden records the gap, and will show the stitch line the day Tier 1 learns that trim |
| ✅ **Q17** | (S3) The footer and *Page N of M* print 5 mm from the paper edge, inside the margin the code itself calls unreliable | The independent QA pass, 2026-09-24 (P3) | ✅ Fixed in 7.8: everything printed is inside the margins, in the verification strip |
| ✅ **Q32** | **bug** · Two failures of the nightly property run ([issue #39](https://github.com/crnlsp/leathercad/issues/39)). `arcThroughPoints` took three points almost in a line, far apart, for a triangle: `(0, -2000)`, `(0, 2000)` and `(0.00025, 0)` gave a circle 8,000 km in radius, and an arc round it that missed its own points by more than 1e-6 mm. "In a line" was twice the triangle's area under an absolute 1e-12 mm², and how flat a triangle is depends on its size, so points 4 mm apart met the same fault. The other failure, `closestPointOnPath` on a line shorter than `EPS_POINT`, was Q26's: the nightly still tested `main` | The nightly runs of 2026-09-30 and 2026-10-03 (seeds 566912085 and 188633644) | ✅ Fixed in #58, which closed #39: `arcThroughPoints` checks the arc it built, and when its circle cannot put the ends on `a` and `c` and `b` on it within `EPS_POINT` it answers with the straight line from `a` to `c`, as it did for points exactly in a line. The arc tool shows no arc and the polyline tool draws a straight edge, where both made an arc thousands of kilometres across. The property that every triangle gets an arc through all three points was wrong at this scale; it is now two, that every triangle whose circle is under a kilometre gets an arc, and that every result starts at `a`, ends at `c` and passes through `b`. Each counterexample is a regression test, and the first seed's joins Q26's |

## Release engineering

| # | What | Plan |
|---|---|---|
| ✅ **R1** | The physical print check (7.7) was done, but its readings are not in [`print-verification-log.md`](../print-verification-log.md). Since 7.6 it has two Linux rows: a viewer's print scaled to 96 %, and sheet 1 through *Print* measured true. No platform has a full A–H row yet | For 1.3.5, Linux: the print test's three sheets through *Print* on A4 portrait, and its landscape sheet (7.6b), measured A–H on the 7.8 gauge, in a build of this release. macOS and Windows moved to 1.5 as R8 on 2026-10-09. Until a platform has its row, the project does not claim verified 1:1 output on it. ✅ Done 2026-10-09: the three portrait sheets and the landscape sheet, printed through *Print* on a Brother laser at its default settings from the 1.3.5 release candidate, each reading within 0.5 mm — Linux has its rows |
| ✅ **R3** | 1.0.1's release notes list every fix twice, because pull requests into `develop` were merged with merge commits, which release-please reads as well as the commits inside them. 1.2.0's list every feature twice, for the same reason: #23, #25 and #26 went into `main` with merge commits | Squash-merge into `develop` ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)), which the ruleset enforces since 2026-09-29; `CHANGELOG.md` is corrected for both; edit the GitHub release notes of 1.0.1 and 1.2.0 by hand. ✅ Done 2026-10-07: both releases' notes are now their corrected `CHANGELOG.md` sections, each entry once |
| ✅ **R4** | Tags read `leathercad-v1.0.1`, not `v1.0.1` | ✅ Decided 2026-10-07: tags keep the component, `leathercad-vX.Y.Z`, so the links between releases stay unbroken. 8.9 reads that form |
| ✅ **R5** | `package.yml` builds Windows and macOS only when packaging could have changed, because a private repository pays for those minutes. The repository is public now, where they are free | ✅ Done 2026-10-07: it runs on every pull request and push, and the unit tests on Windows and macOS moved from the weekly run into CI beside it. Its weekly run went too: it only caught what the path filter let through |
