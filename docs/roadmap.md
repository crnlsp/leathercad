# Roadmap

**Released:** v1.6.0 (2026-11-02) · **Next:** 1.7 — Design & Construct · **Last updated:** 2026-11-07

What comes next, and everything known that is not done yet. What already shipped is in
[`CHANGELOG.md`](../CHANGELOG.md). The full record of how 1.0 was built — every slice from 0.1 to
8.6, with what each found — is kept in [`history/roadmap-to-1.0.md`](history/roadmap-to-1.0.md),
what shipped in 1.1.0 to 1.2.0 in [`history/roadmap-1.1-and-1.2.md`](history/roadmap-1.1-and-1.2.md),
what shipped in 1.3.0 in [`history/roadmap-1.3.md`](history/roadmap-1.3.md), what shipped in
1.3.5 in [`history/roadmap-1.3.5.md`](history/roadmap-1.3.5.md), what shipped in 1.5 in
[`history/roadmap-1.5.md`](history/roadmap-1.5.md), and what shipped in 1.6 in
[`history/roadmap-1.6.md`](history/roadmap-1.6.md). Where the work after 1.6 is
heading, and why in that order, is drawn in [`product-roadmap.md`](product-roadmap.md): this file
holds the items themselves, their status and their order.

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
- **Later is candidate milestones,** each a theme, in the order suggested for work, then *Also
  later*, *Exploring* and *Not planned*. A milestone becomes a release only when it is next, so
  nothing in *Later* is a promise. Items 9.12 to 9.24 and the findings Q33 and Q34 were added on
  2026-10-17 by the product roadmap refresh, whose evidence is in
  [its record](superpowers/specs/2026-10-17-product-direction-audit.md).
- **The UI refinement's slices are `U.1` to `U.20`,** shipped in 1.3.5 and 1.5, and recorded in
  [`history/roadmap-1.5.md`](history/roadmap-1.5.md). Each builds requirements of
  [its spec](superpowers/specs/2026-10-08-ui-refinement-requirements.md), whose ids are `R-01` to
  `R-16` — not the release-engineering items `R1` to `R7` below. U.20, added later, fixes what
  Chromium left at its defaults and cites no `R-` id. Each slice's whole task is in
  [the plan](superpowers/plans/2026-10-08-ui-refinement.md): why it matters to a maker, what the
  code does today, what to find out first, and how to check it is done.

- **1.7's slices** continue the numbers: `3.13` to `3.20` for editing, `U.21` to `U.26` for the
  interface, `R11` to `R18` for release engineering, `PERF-018`, the findings `Q41` to `Q43`, and the
  `9.x` items it takes from *Later*. Each slice's whole task — why, what the code does today, what
  to find out first and how to check it is done — is in [the 1.7 plan](superpowers/plans/2026-11-03-release-1.7.md).

## Where 1.0 left things

| Milestone | Proves | |
|---|---|---|
| **M1** | A 100 mm square, drawn from data, on a zoomable canvas with a mm ruler | ✅ |
| **M2** | Draw a rounded rectangle with snapping, undo and redo it | ✅ |
| **M3** | Change a rectangle's width; its stitch line and holes update live | ✅ |
| **M4** | Save, quit, reopen, and everything is exactly as it was | ✅ |
| **M5** | Print a wallet pattern and measure 100.0 mm with a steel rule | ✅ Measured by the maintainer, and on Linux recorded in [`print-verification-log.md`](print-verification-log.md) (**R1**, 2026-10-09) |

1.0 shipped on Linux, Windows and macOS, unsigned by decision (see [*Collected from makers, and
decided*](#collected-from-makers-and-decided)).

---

## 1.7 — the next release

**Design & Construct** (working title), named on 2026-11-03. A maker places, copies and lines up
pieces as easily as in a drawing program, at CAD precision; the app checks that the holes of two
pieces sewn together line up, by position and not only by count, and that a pocket holds its card;
patterns come in from SVG files and travel between projects; the window feels like one tool; and
installing, upgrading and printing keep the maker's work and scale. The order, the lanes, the
decisions and every slice's *Find out first* and *Done when* are in [the 1.7 plan](superpowers/plans/2026-11-03-release-1.7.md); the
designs are its specs, for [smart guides](superpowers/specs/2026-11-03-smart-guides-design.md),
[seams and pockets](superpowers/specs/2026-11-03-seams-and-manufacturing-design.md),
[installing on Windows](superpowers/specs/2026-11-03-windows-installer-and-distribution-design.md)
and [the UX audit](superpowers/specs/2026-11-03-1.7-ux-audit.md). Each line is one slice and one
pull request, ticked by the pull request that finishes it.

**P1** items are in the release. A **conditional** item is started only when its condition holds;
at the release candidate, one whose condition has not held moves to *Later* in a change of its own,
as any item that will not make it does.

### Stage 1 — Foundation ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-1--foundation))

- ☐ **R11 1.6's printing, measured on paper** — arrowheads, hole rows, taped grids and calibration, exact readings in the log.
- ☐ **PERF-018 Packaged baselines** — startup, idle, memory and a soak on the packaged app, and 1.7's workloads.
- ☐ **U.21 The UX baseline** — every screen inspected, keyboard-only and with a screen reader; the [register](superpowers/specs/2026-11-03-1.7-ux-audit.md) complete.
- ☐ **R13 The Windows installer, installed in CI** — install, upgrade from 1.6.0 and uninstall, with the maker's data checked.
- ✅ **Q41 An opened project starts with Select** — every opening route, restored and recovered work included; new blank projects start in Rectangle and tab switches keep the chosen tool.

### Stage 2 — The core editor ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-2--the-core-editor))

- ☐ **3.20 One snapping model** — one priority table, sources, hysteresis; the base for smart guides.
- ☐ **3.13 A click on a piece's body selects it** — today only its lines can be clicked.
- ☐ **U.22 Hover, selected, editing and locked read differently** (P1).
- ☐ **3.14 Arrow keys nudge, Ctrl+A selects every piece.**
- ☐ **3.15 Typed position and Move by.**
- ☐ **3.16 Smart guides while moving** — edges, centres and guides, exact to the storage quantum.
- ☐ **3.18 Placing inside a piece** — a rivet on a flap's centre, a fold at the middle.
- ☐ **3.17 Live distances and clearance** — the move in mm, and a hole's rim clearance as the rule measures it.
- ☐ **3.19 Equal spacing** (P1).
- ☐ **8.8b Copy and paste whole pieces, across tabs** (was *of features*: whole pieces first).
- ☐ **8.8b Ctrl+D duplicates.**
- ☐ **8.8b Step and repeat** (P1).
- ☐ **8.8b Copy features into another piece** (P1) — frozen when their source stays behind.

### Stage 3 — Leathercraft intelligence ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-3--leathercraft-intelligence))

- ✅ **Q34 Printed text too small to read** — `TEXT_TOO_SMALL_TO_PRINT` warns below 1.5 mm capital height, measured from the vendored font; explained in Problems and Properties, with threshold and whole-piece scaling properties.
- ✅ **9.15 Every problem explained** — all listed codes have a reason and correction, held by an audit test; rebindable F8 / Shift+F8 and Previous / Next buttons select and frame each problem.
- ☐ **9.6a Seams, modelled** — two runs, or part of one; holes compared by distance along the line.
- ☐ **9.6b Seams, checked and made** — *Sew together*, count and drift, the selection bar's third line.
- ☐ **8.14b The built-in templates, checked as leatherwork** — derived stitching, seams that match, a maker's answers.
- ☐ **9.17 Fixes offered with a problem** (P1) — the length that makes a seam match first.
- ☐ **9.16 Accepting a warning** (P1).
- ☐ **9.14a A pocket's clear size** (P1).
- ☐ **9.14b A pocket that holds what it must** (P1).
- ☐ **9.12 The production summary** (P1) — pieces, holes, hardware, thread and net leather, estimates labelled.
- ☐ **9.13 Alignment marks on mating edges** (P1) — prints: format 13, measured on paper.
- ☐ **Q21 Cut two, one turned over** (P1) — prints: a format version of its own, measured on paper.
- ✅ **Q43 A laser export names pieces that overlap on the board** (P1).

### Stage 4 — Geometry and interoperability ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-4--geometry-and-interoperability))

- ☐ **9.19 Curves that can be stitched** (P1) — arcs fitted to each cubic, for the offset only.
- ☐ **ADR 0023 SVG read by the platform's parser** (P1) — no XML dependency; the trust boundary written down.
- ☐ **9.20a SVG import: units and paths** (P1).
- ☐ **9.20b SVG import: roles and preview** (P1).
- ☐ **9.20c SVG import: untrusted files** (P1).
- ☐ **9.7 The part library, through templates** (P1) — *Save piece as template*, *Insert piece from…*.
- ☐ **9.11 Robust offsetting, written here** (conditional) — only if a template or a maker's pattern needs stitching across a concave join.

### Stage 5 — The interface and distribution ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-5--the-interface-and-distribution))

- ☐ **U.23 The start screen opens on the templates.**
- ☐ **U.24a Project tabs, refined.**
- ☐ **U.24b The template picker and its management, refined.**
- ☐ **U.24c Guides and Arrange, refined** — a level guide shows only its y; Arrange as icons.
- ☐ **U.24d Parts, Properties and the selection bar, refined.**
- ☐ **U.24e Problems, refined.**
- ☐ **U.24f The export dialogs, refined.**
- ☐ **U.24g Print Preview, Sheets and calibration, refined.**
- ☐ **U.24h Save, recovery and notices, refined.**
- ☐ **U.25 The visual system and accessibility** — states, spacing, focus, contrast, the minimum window, HiDPI.
- ✅ **U.26 Languages, ready** (P1) — production Polish/German/Russian/French/Spanish, English fallback and non-blocking coverage; PR #87 reconciled and credited. [Verification and review limits](localization-verification.md).
- ☐ **R14 Windows pins, the installer's description, and an icon for `.lcp` files.**
- ☐ **R12 The assisted Windows installer** — where and for whom, guarded, never removing the maker's data.
- ☐ **B5 Microsoft Store readiness** (P1) — an MSIX whose templates survive reinstalling; the listing itself is the maintainer's.
- ☐ **7.6c Printing from Windows** (conditional) — only with a Windows PC and printer to measure the gauge.

### Stage 6 — Qualification ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-6--qualification))

- ☐ **R15 Pixels and axe for every screen 1.7 adds.**
- ☐ **R16 Manufacturing workflows, end to end** — card holder, bifold, a multi-piece bag, a seam, a reused and an imported piece; E2E and paper.
- ☐ **R17 Full regression and packaged qualification**, on every platform there is.
- ☐ **R18 Release documentation** — README media, getting started, keys, formats, known limitations.

### Collected from makers, and decided

Rows that hold no release, carried from 1.6's *Release engineering* until a maker's report or a
decision changes them.

| # | What | Plan |
|---|---|---|
| — **R8** | R1's other platforms: no platform but Linux has a full A–H row in [`print-verification-log.md`](print-verification-log.md) | **A level-3 item, collected from makers** (2026-10-31). It was monitored by decision on 2026-10-18: moved out of 1.5 unverified, as it had moved out of 1.3.5's R1 on 2026-10-09. The maintainer measures prints on Arch only, so a row for another platform comes from a maker with that system and a printer, through the print-report form (until the form exists, an issue with the readings A–H): through *Print* on macOS, and on Windows from the default viewer at *Actual size*. Until one arrives the log says neither platform is verified. It never holds a release; to make one wait, the maintainer would have to mark it planned, which is a decision of its own ([`release-checklist.md`](release-checklist.md), *What a failure holds, by level*) |
| — **R10** | U.7's window edited flag is unverified on macOS, the one platform that shows it: it was checked on Linux, where Electron ignores it, and through the test host and a mock of `setDocumentEdited` | **A level-3 item, collected from makers** (2026-10-31). It was monitored by decision on 2026-10-18: moved out of 1.5 unverified, since no Mac is at hand. A maker with a Mac reports it through the print-report form (until the form exists, an issue): check 12 of [`release-checklist.md`](release-checklist.md) on a real Mac, with the packaged dmg: an edit sets the window's edited dot, *Save* clears it. Tick this only then, saying the macOS version and the date — never from Linux, the test host or a mock. Check 13, ⌘A outside a field ([#97](https://github.com/crnlsp/leathercad/issues/97)), fits the same session |
| — | Code signing | **Not done, by decision** (2026-09-24). LeatherCAD is free and open source and signing costs money every year, so installers ship unsigned; [`getting-started.md`](getting-started.md) says how to open them and how to check a download against its build provenance. If it is ever wanted, electron-builder signs when `CSC_LINK` is set |

**What the QA pass could not test,** kept here until someone does: physical 1:1 prints on real
printers and viewers, including *Actual size* and `/PrintScaling /None` (R1); taping a multi-sheet piece physically; real OS
dialogs (special characters, overwrite prompts, `.PDF` in capitals); crash recovery after a real
process kill; `pnpm test:visual` and `pnpm test:packaged`; HiDPI, Windows and macOS.

---

## Later

Candidate milestones, each a theme, in the order suggested for the work after 1.7. A milestone
becomes a release only when it is next — named, and its items marked, in a change of its own — so
nothing here is a promise, and the order may change as makers say what they need. Why these themes,
why this order, and what depends on what are drawn in [`product-roadmap.md`](product-roadmap.md).

The numbers are Phase 9's from the 1.0 record, continued from 9.12 on 2026-10-17. The gaps are items
that moved: DXF (9.4) into 1.1 as 6.5, Windows and macOS (9.8) into 1.0, and nesting (9.9) to *Not
planned*. *Pieces that fit* and *Problems that explain themselves* moved into 1.7 whole on
2026-11-03, with most of *Start from something* and *Bring patterns in*, 9.11, 7.6c and Q21.

### Start from something

Templates to start from shipped in 1.6 (8.14), which retired 9.18. Copy and paste (8.8b) and the
part library (9.7) are in 1.7. What remains:

- **9.25 Search templates by tag** (added 2026-10-26) — the picker finds a tag today only as words
  in its search, beside the names and descriptions (8.14). Tags become something to search by on
  their own: the tags in use offered as the maker types, a tag chosen narrowing the list to the
  templates that carry it. The built-in categories left the picker in 8.14 for the same reason: a
  tag the maker gave is the filter that means something to them.

### Bring patterns in

SVG import and stitching along curves (9.19, 9.20) are in 1.7. What remains:

- **9.2 Tracing from images** — import a photo or scan, set its scale from a known dimension, trace
  over it. The image is kept in the project's `assets/`, which [file-format](file-format.md) §1
  reserves and nothing writes yet: a format change.

**Needs:** images in the `.lcp`. **Done when:** a scan scaled from a known length reads that length. **Not in it:**
turning an image into lines by itself; straightening a photo taken at an angle; importing PDF or DXF.

### Leather has thickness

A fold already stores the leather's thickness, and nothing reads it. A pattern drawn flat comes out
short wherever leather wraps or folds over leather.

- **9.1 Thickness and wrap compensation** — the gusset problem. The most requested thing in every
  leathercraft forum, and the fold-line model already carries the fields for it. In steps, each
  checked on real leather and recorded: the length a fold needs, as a reading from its thickness and
  what lies inside it; then that length applied to the outline, as a derivation; then a gusset's
  length along its seam (9.6). To decide first: whether thickness belongs to a piece or, as today, to
  a fold.
- **9.21 Skive bands** — where to thin the leather: a band derived inward from an edge at a width,
  and printed. Today a marking line whose purpose is *Skive* is drawn by hand; a band follows the
  edge as a stitch line does, a new row in the derivation table ([domain-model](domain-model.md)
  §4.2). The thinner edge is what 9.1 then reads there.
- **9.22 Grain direction** in the model: an arrow on the part, which turns with it on paper (7.8
  turns parts to save sheets).

**Needs:** 9.6 for gussets; where thickness lives, decided.

**Done when:**
- a fold reports the allowance it needs; applied, the outline grows by that, and undo removes it;
- a bifold cut from such a pattern closes flat — a physical check, recorded as a print check is;
- the grain arrow prints, and turns with its piece.

**Not in it:** folding or draping simulation; stretch; anything 3D.

### Hardware that fits

A hardware hole knows its type and diameter, nothing else, and stays where it was put when its piece
changes ([the 4.7 design](superpowers/specs/2026-09-05-fold-mark-hardware-design.md)).

- **9.23 Hardware clearance** — first from the geometry already there: a hardware hole's rim against
  the edge (Q33), against a stitch line and its holes, on a fold, and over another hole. Then, with
  9.3's real sizes, a cap's or a ring's footprint against the same.
- **9.3 Hardware library** — snaps, rivets, D-rings, zips and magnets, with real dimensions. The
  maker's own, as their irons are (*My tools*, U.13), starting from a few common sizes; a placed
  piece of hardware keeps its own dimensions, so a file opens the same on any machine
  ([domain-model](domain-model.md) §6.2).
- **9.24 Hardware placed from an edge** — "12 mm in from that edge", kept as the piece changes: a
  derivation on the same feature, as the 4.7 design records, and so a format version, since it
  changes what is cut ([file-format](file-format.md) §4.5).

**Needs:** Q33 for the rim; 9.3 for footprints. The first half of 9.23 needs only Q33, and can move
earlier.

**Done when:**
- a hole whose rim crosses an edge is an error;
- a rivet over the stitching names the holes it hits;
- a snap placed from an edge stays that far in when the piece is widened.

**Not in it:** a supplier's catalogue shipped with the app; whether a post is long enough for its
layers, which needs layers (*Exploring*).

### Robust shapes

Alongside the others: pure geometry that nothing here waits on, and that *Bring patterns in* gains
most from.

- **9.5 Boolean operations** — built together with 9.11 (in 1.7, conditional), since both have to
  find and remove the loops an operation creates.

**Done when:** [geometry](geometry.md) §6.3's rules hold — integers at the quantum, `offsetPath`
still the entry point, areas tested rather than bounds; a stitch line follows a thumb scoop; and
`area(A ∪ B) + area(A ∩ B) = area(A) + area(B)` holds as a property. **Not in it:** nesting.

### Found by the post-1.5 stabilization (2026-10-19)

Real, and not fixed in that pass because each needs a decision or a change of its own. None is in a
release until it is moved into one.

- **Q37 Cmd+Q, then *Discard*, closes the window but leaves the app running on macOS** — the quit
  was cancelled by the question, and Discard only closes the window. Unverified: no Mac. Check it
  in the same Mac session as release-checklist check 12.

### Also later, each already decided in principle

- **CI/CD and shipping.** CI regrouped into rings by the question each answers, support levels per
  operating system, and the channels LeatherCAD ships through (AUR, `.deb`, Microsoft Store). Under
  way task by task, outside any release, in
  [the plan](superpowers/plans/2026-10-31-ci-cd-and-shipping.md).
- **A general curve editor** (Béziers) on top of 3.9. An edge drawn with it can be stitched only
  after 9.19.
- **Pieces gliding** between Design and Sheets.
- **Radial, angular, chained and baseline dimensions,** and dimensions between parts.
- **A screen-calibration step,** which would make 1:1 literal on screen too.
- **Draw tools in their role's colour** — still an open question in the UI decisions record.
- **Measuring on the sheets.** U.9 left it out: no tool acts on the Sheets view, so it would be new
  behaviour, not a change of window.
- **A radius-aware corner policy,** and **slot or diamond holes, and leaving single holes out**
  ([domain-model](domain-model.md) §3.3, §6.1).
- **`.lcp.json`,** a project as plain JSON for version control ([file-format](file-format.md) §8).

### Exploring — neither planned nor rejected

Worth thinking about, and none of it a commitment. Each says what it would wait for.

- **9.10 A constraint solver** — only if real use proves the derivation graph insufficient.
- **Pieces placed as they are stacked.** A wallet is layers glued and then stitched through; placed
  that way, the app could check holes through several layers, hardware across them and the stack's
  thickness. Flat, never folded or 3D. After seams (9.6) show the need.
- **Parameterised templates** ("card slot, width 95 mm"), from 9.7: named parameters read by shapes
  and derivations. After the library, and watched for creeping toward a solver.
- **Laying out pieces on a photographed hide,** by hand — grain, flaws, the best leather where it
  shows. After 9.2 and 9.22. No optimising.
- **A shared pattern library, as files.** A `.lcp` already opens the same anywhere; sharing happens
  outside the app, with no accounts or servers in it.
- **Comparing two versions of a design.** *Save as* serves today.

Recorded from the QA pass (2026-09-24), with no work planned:

| # | What | Severity | Plan |
|---|---|---|---|
| **Q20** | (S6) Hidden parts, label-only parts and parts with a hidden outline are left out of the PDF without a notice | intentional | The Sheets spec's *Not printed* labels |
| **Q22** | (S8) Saving rounds the mirror-line angle to six decimals, so a reopened document differs in memory by ≤ 0.0003 mm per metre | negligible | Recorded in 4.8a; nothing to do |
| **Q23** | (S9) Ink reaches up to half a stroke (0.125 mm) past the printable area, because packing uses geometry bounds | negligible | Nothing unless a printer clips it |
| **Q24** | (S10) Horizontal and vertical dimensions read 0.0 after a 90° rotation; the UI creates only aligned ones | API only | When those kinds reach the UI |

## Not planned

Each with its reason. Reviving one starts with new evidence.

- **Auto-update,** meaning a release installed from inside the app. 8.9 only says one exists.
- **Material, cost or bill-of-materials metadata,** and **a notes field separate from labels.** Not a
  pattern editor's job, and a label prints what a note would say
  ([the 1.0 audit](superpowers/specs/2026-09-23-pre-1.0-product-audit.md) §2.9).
- **3D — a 3D view, folding or draping.** A boundary of the product, not a deferral
  ([product-spec](product-spec.md) §2).
- **An onboarding wizard.** The empty states, the sample and the hints teach where the maker is
  already working.
- **Drag handles for values that are already typed.** A gesture less exact than the field beside it.
- **Stitch appearance simulation.** Cosmetic: a template needs the slit an iron cuts, which F.7
  draws.
- **9.9 Nesting on a hide,** moved here on 2026-10-17. It would need a hide's outline and flaws, its
  grain and boolean operations before it could place one piece well, and a maker laying card
  templates on leather does that better by eye; laser users nest in their own software, from the SVG
  or DXF. What makers ask of it — how much leather a project takes — is 9.12's.
- **Accounts, cloud storage, collaboration or a marketplace inside the app.** It works offline and
  shares by file.
- **An AI assistant for its own sake.** Help comes from rules a maker can read (9.15 to 9.17); if
  more ever comes, it offers the same fixes.
- **General illustration** — carving and tooling artwork. A logo is a marking, drawn or imported
  (9.20).
- **G-code.** Laser and CNC users have their own CAM and want DXF or SVG ([printing](printing.md)
  §12).
