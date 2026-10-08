# Roadmap

**Released:** v1.3.0 (2026-10-01) · **Next:** 1.4, then 1.5 and 1.6 · **Last updated:** 2026-10-08

What comes next, and everything known that is not done yet. What already shipped is in
[`CHANGELOG.md`](../CHANGELOG.md). The full record of how 1.0 was built — every slice from 0.1 to
8.6, with what each found — is kept in [`history/roadmap-to-1.0.md`](history/roadmap-to-1.0.md),
what shipped in 1.1.0 to 1.2.0 in [`history/roadmap-1.1-and-1.2.md`](history/roadmap-1.1-and-1.2.md),
and what shipped in 1.3.0 in [`history/roadmap-1.3.md`](history/roadmap-1.3.md).

---

## How to read this

- **Every item has a number** — a slice (`3.9`, `6.2`) or a finding (`Q1`). The numbers are stable:
  `/slice 3.9` always means the same thing, and slice numbers continue the ones in the 1.0 record.
- **A slice is a vertical piece of work** that ends with the app running, tests green, and
  something a person can see. How one is planned, built and landed is in
  [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- **Marks:** ☐ planned · ◐ in progress · ✅ done. A done item stays here until its release ships,
  then moves to the record in [`history/`](history/) and is deleted here.
- **A release is its whole section.** Everything under *the next release* ships together, and
  `develop` goes to `main` only when every item in it is ✅. An item that will not make it is moved
  to the release after, or to *Later*, in a change of its own — never left behind by a release
  happening. The *Release gate* check on pull requests into `main` refuses a section with ☐ or ◐
  still in it ([`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases)).
- **Scope rule,** carried over from 1.0: an idea that is not needed for everyday use, the
  leathercraft workflow, pattern correctness or print correctness waits for a later release — even
  when it turns up halfway through something else. Write it under *Later* instead.
- **The UI refinement's slices are `U.1` to `U.19`** (1.5). Each builds requirements of
  [its spec](superpowers/specs/2026-10-08-ui-refinement-requirements.md), whose ids are `R-01` to
  `R-16` — not the release-engineering items `R1` to `R7` below. Each slice's whole task is in
  [the plan](superpowers/plans/2026-10-08-ui-refinement.md): why it matters to a maker, what the
  code does today, what to find out first, and how to check it is done.

## Where 1.0 left things

| Milestone | Proves | |
|---|---|---|
| **M1** | A 100 mm square, drawn from data, on a zoomable canvas with a mm ruler | ✅ |
| **M2** | Draw a rounded rectangle with snapping, undo and redo it | ✅ |
| **M3** | Change a rectangle's width; its stitch line and holes update live | ✅ |
| **M4** | Save, quit, reopen, and everything is exactly as it was | ✅ |
| **M5** | Print a wallet pattern and measure 100.0 mm with a steel rule | ✅ Measured by the maintainer; the readings still have to be written into [`print-verification-log.md`](print-verification-log.md) (**R1**) |

1.0 shipped on Linux, Windows and macOS, unsigned by decision (see *Release engineering*).

---

## 1.4 — the next release

The theme is *print true, and cut true*: what leaves the app, on paper or as a file for a cutter,
is the size that was drawn. It is the first part of what the roadmap called 1.4. The maintainer
split 1.4 on 2026-10-07 so that the print-scaling fix reaches people sooner: printed from a PDF
viewer, a 1.3.0 PDF measured 96 % on paper (7.6). Everything else moved to the release after as it
was, so this could ship first ([`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases)); that
release is [1.6](#16--after-the-refinement) since the UI refinement took 1.5 on 2026-10-08. The
order within each group is the suggested order of work.

**What it still waits for** (2026-10-08): Q27, which needs `gifsicle` and `pngquant` where the
pictures are retaken, and R1, the physical measurement only the maintainer can take. 6.5 landed in
#65. 7.6b, 6.2 and Q7 were finished on branches cut
before the split, so their ticks had landed in the release after; they are back in the release
they belong to.

### Output

- ✅ **7.6 Print from LeatherCAD.** A physical print measured the gauge at 96 × 4.8 mm. The PDF
  was exact; CUPS fitted it into the printer's margins, because no viewer's job carried
  `print-scaling=none`. Now **Print**, green and the window's primary action, opens LeatherCAD's
  own Print Preview. It draws the PDF itself with pdf.js, offers only printer, paper, orientation,
  which sheets and copies, shows *100 % — locked* and *No scaling*, and sends those same bytes to
  `lp` with `print-scaling=none` (*Print 3 sheets*). Where there is no CUPS client to drive
  (Windows, the Flatpak), its last step is *Save PDF…* with the *Actual size* warning.
  *Export PDF* stays, for a file. [ADR 0019](adr/0019-print-from-the-app.md),
  [`printing.md`](printing.md) §13. Sheet 1 of the print test, sent this way on Linux, measured
  true (log, 2026-10-01). macOS runs the same path and is unverified until measured.
- ✅ **7.6b Landscape from the Print Preview.** CUPS cannot turn a landscape page onto upright paper
  without shrinking it, and with scaling off it cuts it off, so the preview does not send landscape
  yet. The writer puts every sheet in the PDF upright, with a landscape layout turned a quarter
  inside it (`printing.md` §6.1 and §13), then the preview sends it.
  ✅ Built as described. On the way: the turn is the one transform the writer emits — `0 1 -1 0 W 0
  cm`, a quarter turn with no scale — and only *Print* sends it. *Export PDF* keeps a landscape
  page, which a viewer shows the right way up; a page `/Rotate` would have done that for the print
  form too, but `pdftopdf` keeps it and the page is cut off at 210 mm again, as measured through
  `pdftopdf` and `pdftoraster` before deciding ([ADR 0019](adr/0019-print-from-the-app.md),
  amended). The preview turns only its view of a landscape page. **Still owed:** a landscape
  sheet printed through *Print* and measured on paper (R1).
- ✅ **6.2 SVG export.** Millimetre units, one group per layer, the single Y flip, with the
  accuracy tests from [`printing.md`](printing.md) §14.
  ✅ Built as described: *Export SVG…*, in a menu beside *Export PDF*, writes the scene the PDF is
  written from, laid out as the maker arranged the board ([`printing.md`](printing.md) §10). On the
  way: strokes take the canvas's role colours, not the PDF's black, because laser software sorts
  by colour; an arc is written in pieces of at most a quarter turn, because an SVG arc's centre is
  worked out from its endpoints and a half turn could lose up to 0.035 mm to a rounding of 0.1 µm
  (the round-trip property found it); and an export to a file ends in the same notice of what was
  left out as the PDF's, in the words *in the file*. **Still owed:** a real laser or vector
  editor has not opened one; the checks read the file by hand and rendered it with librsvg.
- ✅ **6.5 DXF export** (R12), for laser and CNC users.
  ✅ Built as described, except that [`printing.md`](printing.md) §11 was wrong: R12 has no
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
  LeatherCAD's mark in the corner ([`printing.md`](printing.md) §8.1). Long, not square, because
  length shows a scaling error and a 25 mm square would hide one. The shelf packer gave way to one
  that fills gaps and goes back to earlier sheets, and a part turns a quarter when that saves a
  sheet — lifting 7.2's grain rule, by decision (§5.5). The bifold sample on A4 portrait takes two
  sheets, not five, with nothing taped; over 2,000 random projects, about half the sheets.
  ✅ Built as described. The print test's strap is 275 mm, not 250, so that A4 portrait still tapes
  it. **Still owed:** the new physical measurement this item always required — the print test's
  rows in [`print-verification-log.md`](print-verification-log.md) now read the gauge (R1).

### Known issues and findings

Everything found along the way that is not fixed yet, with where it was found. The ones marked
**bug** come first.

| # | What | Where it was found | Plan |
|---|---|---|---|
| ✅ **Q7** | The golden-fixture layer [`testing.md`](testing.md) §2 plans — committed geometry outputs, reviewed when they change — was never built. The `.lcp` format fixtures and the SVG snapshots cover part of it | The post-1.0 cleanup | ✅ Built as described, for offsetting and hole distribution ([`testing.md`](testing.md) §11): eight real pieces, stitched 3 and 4 mm in or allowed 3 and 4 mm out, with a 3.0 and a 3.85 mm iron, every number on the 0.1 µm grid. Each was checked by hand once. On the way, not fixed: the sample project's scooped card pocket gets no stitch inset, because Tier 1 cannot trim the scoop's arc against the top edge, and the user is told the margin is deeper than the edge can hold, which is not why. The sample draws that seam by hand; the golden records the gap, and will show the stitch line the day Tier 1 learns that trim |
| ☐ **Q27** | `pnpm docs:media` fails where `/tmp` is its own filesystem (`renameSync` across devices, `EXDEV`), and never loads the window while it records video — on `develop` as well. So the README's pictures still show the bar before 8.7, and `print.png` the verification block before 7.8 | 8.7, retaking the README pictures | Copy instead of rename; find why recording stops the window loading; then retake all four on a machine with ffmpeg, gifsicle and pngquant |
| ✅ **Q17** | (S3) The footer and *Page N of M* print 5 mm from the paper edge, inside the margin the code itself calls unreliable | The independent QA pass, 2026-09-24 (P3) | ✅ Fixed in 7.8: everything printed is inside the margins, in the verification strip |
| ✅ **Q32** | **bug** · Two failures of the nightly property run ([issue #39](https://github.com/crnlsp/leathercad/issues/39)). `arcThroughPoints` took three points almost in a line, far apart, for a triangle: `(0, -2000)`, `(0, 2000)` and `(0.00025, 0)` gave a circle 8,000 km in radius, and an arc round it that missed its own points by more than 1e-6 mm. "In a line" was twice the triangle's area under an absolute 1e-12 mm², and how flat a triangle is depends on its size, so points 4 mm apart met the same fault. The other failure, `closestPointOnPath` on a line shorter than `EPS_POINT`, was Q26's: the nightly still tested `main` | The nightly runs of 2026-09-30 and 2026-10-03 (seeds 566912085 and 188633644) | ✅ Fixed in #58, which closed #39: `arcThroughPoints` checks the arc it built, and when its circle cannot put the ends on `a` and `c` and `b` on it within `EPS_POINT` it answers with the straight line from `a` to `c`, as it did for points exactly in a line. The arc tool shows no arc and the polyline tool draws a straight edge, where both made an arc thousands of kilometres across. The property that every triangle gets an arc through all three points was wrong at this scale; it is now two, that every triangle whose circle is under a kilometre gets an arc, and that every result starts at `a`, ends at `c` and passes through `b`. Each counterexample is a regression test, and the first seed's joins Q26's |

### Release engineering

| # | What | Plan |
|---|---|---|
| ☐ **R1** | The physical print check (7.7) was done, but its readings are not in [`print-verification-log.md`](print-verification-log.md). Since 7.6 it has two Linux rows: a viewer's print scaled to 96 %, and sheet 1 through *Print* measured true. No platform has a full A–H row yet | Record one row per platform, through *Print* on Linux and macOS. Until then the project does not claim verified 1:1 output in writing |
| ✅ **R3** | 1.0.1's release notes list every fix twice, because pull requests into `develop` were merged with merge commits, which release-please reads as well as the commits inside them. 1.2.0's list every feature twice, for the same reason: #23, #25 and #26 went into `main` with merge commits | Squash-merge into `develop` ([`CONTRIBUTING.md`](../CONTRIBUTING.md)), which the ruleset enforces since 2026-09-29; `CHANGELOG.md` is corrected for both; edit the GitHub release notes of 1.0.1 and 1.2.0 by hand. ✅ Done 2026-10-07: both releases' notes are now their corrected `CHANGELOG.md` sections, each entry once |
| ✅ **R4** | Tags read `leathercad-v1.0.1`, not `v1.0.1` | ✅ Decided 2026-10-07: tags keep the component, `leathercad-vX.Y.Z`, so the links between releases stay unbroken. 8.9 reads that form |
| ✅ **R5** | `package.yml` builds Windows and macOS only when packaging could have changed, because a private repository pays for those minutes. The repository is public now, where they are free | ✅ Done 2026-10-07: it runs on every pull request and push, and the unit tests on Windows and macOS moved from the weekly run into CI beside it. Its weekly run went too: it only caught what the path filter let through |

---

## 1.5 — the window, refined

The UI/UX final audit's requirements, received 2026-10-08: a refinement pass, not a redesign. The
layout, the look and the words stay, and **printed output does not change**. The theme is *a maker
gets more done at the bench*: the pattern reads at every zoom, the board gets the room, sizes are
typed where the eye already is, and the next step is one click away.
[Requirements](superpowers/specs/2026-10-08-ui-refinement-requirements.md) (R-01 to R-16) and
[mockups](superpowers/specs/2026-10-08-ui-refinement-mockups/); [the
plan](superpowers/plans/2026-10-08-ui-refinement.md) holds each slice's whole task, the answers to
the requirements' open questions, and what reading the code turned up. One pull request per slice,
in this order: U.1 first, and the plan's §0 says why. R-10 and the keys move up into Phase 1 as
U.3, because the controls after them show keys; R-15 leads Phase 3, because R-14 and R-16 read it.

### Phase 1 — the canvas, the keys and the frame

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
- ☐ **U.3 Keys by where they are, shown as caps, and tooltips that fit** (§2, §6, R-10). One keymap
  matching `KeyboardEvent.code`, shown as the local character and as ⌘ on macOS; keys leave the
  catalogue's sentences; a tooltip is one line up to 360 px, flipped and shifted to stay inside the
  window — the thin column at the right edge goes.
- ☐ **U.4 A zoom control, and true size** (R-03). − · % · + · Fit at the canvas's bottom-right;
  *Fit drawing* `Shift+1`, *Fit selection* `Shift+2`, *True size* `Ctrl+0` — which fits today.
- ☐ **U.5 Panels fold, and focus mode** (R-04). `[` Parts, `]` Properties, `\` both; 40 px strips;
  three status-bar chips, always; the widths of the requirements' §5; the maker's choices
  remembered; nothing unreachable.
- ☐ **U.6 Properties: order, weight and job totals** (R-05). A hole set reads iron, result, name,
  arrange, then Delete alone at its foot; with nothing selected, the pieces to cut, the holes to
  punch and the sheets to print.
- ☐ **U.7 The top bar in three zones** (R-06). The project and its save state · Design | Sheets ·
  the paper, then Export PDF and Print as split buttons, Print's second half showing the problems;
  green leaves the actions; the window's edited flag.

### Phase 2 — panels, lists and small fixes

- ☐ **U.8 The Parts tree** (R-07). Pieces fold; features nest under what they follow; keys for the
  tree; *Sheet N, turned* leaves Design.
- ☐ **U.9 The Sheets view gets its own panels** (R-08). Pieces by sheet, the paper in Properties,
  the reminder to measure. No Turn: no piece is turned by hand.
- ☐ **U.10 The legend** (R-09). Open with names by default; folds to a chip that is remembered.
- ☐ **U.11 Options-row hints** (R-11). Short hints with keys as caps, dropping from the right; `?`
  never drops.
- ☐ **U.12 Change a key in Settings › Keyboard shortcuts** (§2).

### Phase 3 — the craft workflow

- ☐ **U.13 Settings › My tools** (R-15). The maker's irons, a default, and starting values for new
  pieces.
- ☐ **U.14 Value chips beside the selected shape** (R-12). Width, height, corner and margin, edited
  on the drawing.
- ☐ **U.15 Values in any unit, and sums** (R-12). `95-2*3.5` and `3.75in`, wherever a size is typed.
- ☐ **U.16 Typing while drawing** (R-13). `105` `Tab` `75` `Tab` `8` `Enter`.
- ☐ **U.17 The selection bar: stitch summary and next step** (R-14).
- ☐ **U.18 Drawing defaults in Properties** (R-16).
- ☐ **U.19 The pass, checked as one thing.** Every size, keyboard only, high contrast, 2×; the
  pixel baselines and the README's pictures retaken.

### Decisions this release needs

Each has a recommended default in the plan, which its slice takes unless the maintainer decides
otherwise.

| Slice | Question | Recommended |
|---|---|---|
| U.3 | On a French or German keyboard, does a tool key follow its letter or its position? | Its letter: R stays R. Punctuation and digits keep their position, shown as the local character |
| U.7 | If the project's name joins the Project menu's button, how is a project renamed? | Whichever of *Rename…* in the menu or F2 on the name fits what renaming does today |
| U.9 | Measure on the Sheets view, where no tool acts today? | Left out, and added to *Later* |
| U.10 | Every saved preferences file says the legend is closed, chosen or not | Preferences version 2 opens it once |
| U.13 | A default leather thickness "used by folds whose own is not set" | Written into each new fold; evaluation never reads a preference |
| U.16 | Where a typed rectangle goes before any corner is clicked | At the pointer |

---

## 1.6 — after the refinement

What 1.3 did not finish and 1.4 does not take moved here on 2026-10-07, when 1.4 was split
([1.4](#14--the-next-release) says why): word for word, but for 8.9, which now reads the one tag
form R4 decided. It was 1.5 until 2026-10-08, when the UI refinement took that number, and it
becomes *the next release* once 1.5 has shipped. The order within each group is the suggested
order of work, and *The window* comes before the other groups.

### The window

Left from 1.3's *The window*: nothing says a new release exists.

- ☐ **8.9 Update discovery.** The main process asks GitHub for the latest release and compares it
  with the running version: *Check for updates* in Settings › Updates, the result in About, and a
  quiet mark on Settings when one exists. It links to the release page and installs nothing (see
  *Not planned*). The app's first network request, so `SECURITY.md`'s "no network connections"
  changes with it, in an ADR; the Flatpak skips it, as Flathub updates it. Reads tags in the
  `leathercad-v` form (R4).

### Drawing and editing

- ☐ **3.10 Guides, alignment and distribution.**
- ☐ **3.12 Convert to drawn path.** The explicit escape hatch for a circle someone wants to squash
  or an arc they want to reshape freely, saying plainly that it stops being a circle or an arc.
  Until then, 3.7 refuses those transforms.
- ☐ **4.10b Dimensions drawn like drafting.** Arrowheads, with the number breaking the line — the
  one item of the visual identity test that only partly passes. It prints, so it is a measurement
  change, not a canvas treatment.
- ☐ **4.14 A row of holes along a line** that is not a stitch line (carried forward from Phase 4).

### Output

- ☐ **7.6c Printing from Windows.** A transport that can be told not to scale. SumatraPDF is the
  candidate (GPL-3.0, beside the app). It needs its own ADR and a gauge measured on paper. Until
  then the preview saves the PDF.
- ☐ **6.4 The rest of the export dialog.** Presets, layers and bounds. Printing only some sheets is
  the Print Preview's since 7.6.
  `paperOptionsFitting` already answers "what would fit", so the dialog reports rather than
  computes.
- ☐ **7.2 Taped parts, finished.** Edge arrows and a printed assembly sheet. A taped part is never
  turned: since 7.8 a part is taped only when it fits whole neither way.
- ☐ **7.5 Calibration.** Per-printer correction factors, with a ±2 % guard. The verification
  gauge already shows when a printer is off.

### Known issues and findings

Everything found along the way that is not fixed yet, with where it was found. The ones marked
**bug** come first.

| # | What | Where it was found | Plan |
|---|---|---|---|
| ☐ **Q4** | Problems have no stable identity across edits. The panel keys by content today, so nothing breaks yet | UI audit, deferred opportunities | Give a problem a stable key before anything relies on one |
| ☐ **Q31** | What resizing a piece should do. Scale acts on what is selected, so an outline scaled alone leaves its slots where they were, and a whole piece scaled evenly grows its rivet holes and labels with it — a 4 mm rivet hole becomes 6 mm. The stitch margin and the iron's pitch already stay | Q30 | Decide which sizes a piece keeps (hardware, labels, card slots) before Scale takes the whole piece |

#### Left from the independent QA pass (2026-09-24)

The finding still open from the outside QA pass over `main` at `d54b2d7` (v1.0.x). Its fixes are
in the [record](history/roadmap-1.1-and-1.2.md) and, for Q17, in 1.4's 7.8. The id in brackets is
the report's.

| # | What | Severity | Plan |
|---|---|---|---|
| ☐ **Q15** | (S1) A dimension to a rounded or seam-allowance corner reads less than the piece: a corner anchor on an arc is the arc's middle, and an outward allowance rounds corners the maker never rounded (97 × 67 reads 94.9) | P2 · investigate | Decide what a corner of a rounded outline *means* to a maker before changing it; 4.10b |

**What the QA pass could not test,** kept here until someone does: physical 1:1 prints on real
printers and viewers, including *Actual size* and `/PrintScaling /None` (R1); taping a multi-sheet piece physically; real OS
dialogs (special characters, overwrite prompts, `.PDF` in capitals); crash recovery after a real
process kill; `pnpm test:visual` and `pnpm test:packaged`; HiDPI, Windows and macOS.

**Performance, recorded as information, not targets:** building the display list for the
636-hole benchmark strap takes 87 µs (13 µs before F.7); offsetting a 500-point traced outline
takes ~74 ms, over the 50 ms budget on its own; and a huge drawing at the smallest pitch makes
millions of holes, so a hole-count budget may be wanted one day. None is to be optimised until it
is felt.

### Release engineering

| # | What | Plan |
|---|---|---|
| ☐ **R6** | The renderer loads from `file://`, which keeps the `GrantFileProtocolExtraPrivileges` fuse on | Serve it from a custom `app://` protocol, then turn the fuse off (ADR 0014) |
| — | Code signing | **Not done, by decision** (2026-09-24). LeatherCAD is free and open source and signing costs money every year, so installers ship unsigned; [`getting-started.md`](getting-started.md) says how to open them and how to check a download against its build provenance. If it is ever wanted, electron-builder signs when `CSC_LINK` is set |

---

## Later

Ordered by expected value, not difficulty. The numbers are Phase 9's from the 1.0 record; the gaps
are items that moved: DXF (9.4) into 1.1 as 6.5, and Windows and macOS (9.8) into 1.0.

- **9.1 Thickness and wrap compensation** — the gusset problem. The most requested thing in every
  leathercraft forum, and the fold-line model already carries the fields for it.
- **9.2 Tracing from images** — import a photo or scan, set its scale from a known dimension, trace
  over it.
- **9.3 Hardware library** — snaps, rivets, D-rings, zips and magnets, with real dimensions.
- **9.5 Boolean operations** — built together with 9.11, since both have to find and remove the loops
  an operation creates.
- **9.6 Seam pairing and hole-count parity** — catches a genuinely expensive mistake.
- **9.7 Templates** — a part saved to a library and inserted again (was 8.1), and parameterised ones
  ("card slot, width 95 mm").
- **9.9 Nesting on a hide** — needs boolean operations first.
- **9.10 A constraint solver** — only if real use proves the derivation graph insufficient.
- **9.11 Robust offsetting, written here** — the concave outlines analytic offsetting refuses, and
  stitching *across* a concave join such as a thumb scoop. Two bindings were tried and rejected
  (ADR 0008); it will be written, not bought.

Also later, each already decided in principle:
- **A general curve editor** (Béziers) on top of 3.9.
- **Grain direction** in the model: an arrow on the part, which turns with it on paper (7.8 turns
  parts to save sheets).
- **Pieces gliding** between Design and Sheets.
- **Radial, angular, chained and baseline dimensions,** and dimensions between parts.
- **A screen-calibration step,** which would make 1:1 literal on screen too.
- **Draw tools in their role's colour** — still an open question in the UI decisions record.
- **8.8b Copy, Paste and Duplicate of features,** after 8.8. Neither exists, and they carry a
  domain question: what a pasted stitch line follows when its outline was not copied with it. A
  command with property tests, not a menu item.

Left room for by the UI refinement (1.5):
- **Hole matching and thread length** in the selection bar — "Matches Outer, right run 15 = 15 ·
  Thread ≈ 0.9 m". U.17 leaves room for this third line and builds nothing of it (R-14).
- **Measuring on the sheets,** unless U.9 builds it: no tool acts on the Sheets view yet.

Recorded from the QA pass (2026-09-24), with no work planned:

| # | What | Severity | Plan |
|---|---|---|---|
| **Q20** | (S6) Hidden parts, label-only parts and parts with a hidden outline are left out of the PDF without a notice | intentional | The Sheets spec's *Not printed* labels |
| **Q21** | (S7) *Cut 2* on a mirrored pair does not say to flip the template for the second piece | deferred | The Sheets spec §11 |
| **Q22** | (S8) Saving rounds the mirror-line angle to six decimals, so a reopened document differs in memory by ≤ 0.0003 mm per metre | negligible | Recorded in 4.8a; nothing to do |
| **Q23** | (S9) Ink reaches up to half a stroke (0.125 mm) past the printable area, because packing uses geometry bounds | negligible | Nothing unless a printer clips it |
| **Q24** | (S10) Horizontal and vertical dimensions read 0.0 after a 90° rotation; the UI creates only aligned ones | API only | When those kinds reach the UI |

## Not planned

Auto-update, meaning a release installed from inside the app (8.9 only says one exists); material,
cost or bill-of-materials metadata; a notes field separate from labels; 3D; an onboarding wizard;
drag handles for values that are already typed.
