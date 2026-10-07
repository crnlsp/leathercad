# Roadmap

**Released:** v1.3.0 (2026-10-01) · **Next:** 1.4, then 1.5 · **Last updated:** 2026-10-07

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
viewer, a 1.3.0 PDF measured 96 % on paper (7.6). Everything else moved to
[1.5](#15--the-release-after) as it was, so this could ship first
([`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases)). The order within each group is
the suggested order of work.

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
- ☐ **7.6b Landscape from the Print Preview.** CUPS cannot turn a landscape page onto upright paper
  without shrinking it, and with scaling off it cuts it off, so the preview does not send landscape
  yet. The writer puts every sheet in the PDF upright, with a landscape layout turned a quarter
  inside it (`printing.md` §6.1 and §13), then the preview sends it.
- ☐ **6.2 SVG export.** Millimetre units, one group per layer, the single Y flip, with the
  accuracy tests from [`printing.md`](printing.md) §14.
- ☐ **6.5 DXF export** (R12), for laser and CNC users.
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
| ☐ **Q7** | The golden-fixture layer [`testing.md`](testing.md) §2 plans — committed geometry outputs, reviewed when they change — was never built. The `.lcp` format fixtures and the SVG snapshots cover part of it | The post-1.0 cleanup | Build it for offsetting and hole distribution first, where silent drift costs leather |
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

## 1.5 — the release after

What 1.3 did not finish and 1.4 does not take moved here on 2026-10-07, when 1.4 was split
([1.4](#14--the-next-release) says why): word for word, but for 8.9, which now reads the one tag
form R4 decided. It becomes *the next release* once 1.4 has shipped. The order within each group
is the suggested order of work, and *The window* comes before the other groups.

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
- ☐ **6.5 DXF export** (R12), for laser and CNC users.
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
