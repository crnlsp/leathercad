# Roadmap

**Released:** v1.6.1 (2026-11-14) · **Next:** 1.7 — Design & Construct · **Last updated:** 2026-11-18

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
  interface, `R11` to `R18` for release engineering, `PERF-018`, the findings `Q41` to `Q49`, and the
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

- ✅ **R11 1.6's printing, measured on paper** — arrowheads, hole rows, taped grids and calibration: every check passed on paper on Linux ([log](print-verification-log.md#16s-printing--checks-i-to-m-r11)).
- ☐ **PERF-018 Packaged baselines** — startup, idle, memory and a soak on the packaged app, and 1.7's workloads.
- ✅ **U.21 The UX baseline** — every screen inspected on Linux, keyboard-only and through the accessibility tree a screen reader reads; the [register](superpowers/specs/2026-11-03-1.7-ux-audit.md) complete, X19–X39 added. Orca's own speech, Windows and macOS wait for the candidate (R17).
- ✅ **R13 The Windows installer, installed in CI** — install, upgrade from 1.6.0 and uninstall, with the maker's data checked.
- ✅ **Q41 An opened project starts with Select** — every opening route, restored and recovered work included; new blank projects start in Rectangle and tab switches keep the chosen tool.

### Stage 2 — The core editor ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-2--the-core-editor))

- ✅ **3.20 One snapping model** — one priority table, sources, hysteresis; the base for smart guides.
- ✅ **3.13 A click on a piece's body selects it** — on its leather, not in a cut-out; a line or a guide within the pick radius still wins; the drag moves the piece whole, the hover halos its outline, and a right-click offers the piece's menu.
- ✅ **U.22 Hover, selected, editing and locked read differently** — a hover's band is twice a selection's width and half its density; a locked line or piece pointed at shows a grey band and a padlock; Edit points' handles mark what is edited, and Parts highlights the row of what a click would take and marks the one being edited.
- ✅ **3.14 Arrow keys nudge, Ctrl+A selects every piece** — on the focused board: 1 mm, 10 mm with Shift, 0.1 mm with Alt, each rebindable; a press or a held key is one undo step; a locked piece says why; a field, the Parts tree, a menu and the tabs keep their arrows.
- ✅ **3.15 Typed position and Move by** — Properties › Arrange says where the selection's left and bottom edges are and takes a place or a distance, with sums and units; one undo step each; a locked piece says why.
- ✅ **3.16 Smart guides while moving** — a piece dragged by its body lines its edges and centre up with other pieces' and with guides, exact to the storage quantum; Ctrl suspends; one undo step.
- ✅ **3.18 Placing inside a piece** — a rivet, a hole or a fold dragged inside a piece lines up with that piece's centre, its straight edges and its other holes' centres, exact to the storage quantum; the line says *Centre*, or *Centre of its extent* where the piece is not mirrored about it; Ctrl suspends; one undo step.
- ✅ **3.17 Live distances and clearance** — a move shows how far it went beside the pointer and in the status bar; a feature moved inside a piece, its four gaps to the real outline; a hole, its rim clearance by the rule's own function, warning exactly where Problems lists it after the drop; a kept drag or nudge is said through a live region.
- ✅ **3.19 Equal spacing** (P1) — a piece, or a cut-out inside one, dragged between two neighbours snaps to equal gaps, or repeats the gap of the pair beside it; both gaps are drawn and labelled with the one number, measured between exact extents and only from straight sides; exact to the storage quantum; Ctrl suspends; one undo step.
- ✅ **8.8b Copy and paste whole pieces, across tabs** — Ctrl+C and Ctrl+V on the board, or the right-click menu (Paste alone on empty board); under the pointer, or clear of the drawing; new ids, every reference re-pointed, none dangling, seams between them kept; a mirrored piece without its original pastes as drawn geometry, said when copying; one undo step.
- ✅ **8.8b Ctrl+D duplicates.** — Ctrl+D (⌘D on macOS, rebindable) does what the menu's Duplicate does, on the board: one piece, one undo step.
- ✅ **8.8b Step and repeat** (P1) — Ctrl+D right after a duplicate that was then moved repeats that move on the new copy; forgotten by any other command, undo or redo.
- ✅ **8.8b Copy features into another piece** (P1) — frozen when their source stays behind; Ctrl+D steps them, card slots down a lining.

### Stage 3 — Leathercraft intelligence ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-3--leathercraft-intelligence))

- ✅ **Q34 Printed text too small to read** — `TEXT_TOO_SMALL_TO_PRINT` warns below 1.5 mm capital height, measured from the vendored font; explained in Problems and Properties, with threshold and whole-piece scaling properties.
- ✅ **9.15 Every problem explained** — all listed codes have a reason and correction, held by an audit test; rebindable F8 / Shift+F8 and Previous / Next buttons select and frame each problem.
- ✅ **9.6a Seams, modelled** — fixed and partial hole runs, corner and open-line endpoint references, arc-length distances, persistence, deletion and undo; missing sides remain reportable.
- ✅ **9.6b Seams, checked and made** — *Sew together*, count and drift, the selection bar's third line.
- ✅ **8.14b The built-in templates, checked as leatherwork** — matching card-holder seams, cut in leather with its holes lining up; fold-linked rivets; a bifold whose pockets fit and whose lining is cut to match ([audit](template-audit.md)).
- ✅ **9.17 Fixes offered with a problem** (P1) — a drifting seam's drawn stitching shortened or lengthened until its holes pair, and stitching too near an edge moved in to clear it; previewed while pointed at, one undo step, refused when out of date.
- ✅ **9.16 Accepting a warning** (P1) — *Accept* on a warning in Properties, never on an error; listed as accepted and not counted on Print, until what it was found from changes — a pocket's requirement or ease, a seam's irons and stretches, otherwise the stored parameters it was found from, wherever the piece sits; *Un-accept*; one undo step each; no format change.
- ✅ **9.14a A pocket's clear size** (P1) — width between stitch lines and stitch depth for an open U of stitching, in Properties and the selection bar: the card holder 99.0 × 41.35 mm, the bifold 89.0 mm across.
- ✅ **9.14b A pocket that holds what it must** (P1) — a payment card or a typed size, the maker's ease from My tools, `POCKET_TOO_NARROW` and, held fully, `POCKET_TOO_SHALLOW` from the opening on the outline: an ID-1 card with 4 mm ease flags the bifold and not the card holder.
- ✅ **9.12 The production summary** (P1) — with nothing selected, Properties lists the pieces to cut, holes to punch, hardware, thread (an estimate, its rule shown) and net leather, and *Copy* puts the same words on the clipboard: the card holder 3 to cut, 184 holes, no hardware, about 1.3 m of thread and 173 cm².
- ✅ **9.13 Alignment marks on mating edges** (P1) — prints: format 13; marks at a seam's first and last or every *n*th pair on both pieces, on the board, Sheets, PDF, SVG and DXF. On paper on Linux, every reading under 1 mm ([log](print-verification-log.md#alignment-marks--913)).
- ✅ **Q21 Cut two, one turned over** (P1) — prints: format 15; a piece cut as a mirrored pair says to turn the template over on paper, *1 + 1 mirrored* in Parts and the summary. On paper on Linux, every reading under 1 mm ([log](print-verification-log.md#a-mirrored-pairs-caption--q21)).
- ✅ **Q43 A laser export names pieces that overlap on the board** (P1).
- ✅ **9.26 The iron's tooth: French, Japanese or round holes** (P1) — the hole set knows its iron's tooth; the board draws it, SVG and DXF cut it true, paper unchanged; format 14.
- ✅ **Q45 A mirrored hardware hole is checked** — the key fob's second rivet, judged by its rim like the first.
- ✅ **Q44 A hole on the cut edge, one verdict** — the same problem whichever way the piece faces (D29).
- ✅ **Q46 A tooth through the edge is off the leather** (P1) — a hole set's iron read as SVG and DXF cut it.
- ✅ **Q47 End holes moved in** (P1) — *Start offset* and *End offset* in Properties move an open run's end holes in, a hole kept on every corner; the edge problem's advice names them.
- ✅ **Q48 Stitched sides say which side is open** (P1) — *Open at the top* and its three siblings on a rectangle square to the board; the board numbers the corners while a corner field has focus.
- ✅ **Q49 Holds says what it measured to** (P1) — *Holds* names the piece whose edge the depth was read to and its rise above the stitch ends, says "no ease", and stays, to be cleared, while its line fails.

### Stage 4 — Geometry and interoperability ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-4--geometry-and-interoperability))

- ✅ **9.19 Curves that can be stitched** (P1) — arcs fitted to each cubic, for the offset only: a squashed circle's stitch line within 0.005 mm of the true inset; a curve bent tighter than the inset, or trimmed against a side at a corner (D8), refused as `OFFSET_COLLAPSED`.
- ✅ **ADR 0023 SVG read by the platform's parser** (P1) — no XML dependency; the trust boundary written down: bytes bounded, entities checked before parsing (a 200 kB file froze Chromium's parser for 12.5 s), the parsed document never adopted, a plain tree into a headless `packages/import`.
- ✅ **9.20a SVG import: units and paths** (P1) — headless plain-tree conversion, physical units and confirmed pixel density, all path commands, primitives, groups and transforms; Y flipped once.
- ✅ **9.20b SVG import: roles and preview** (P1) — closed paths cut and nested by containment (outline, cut-out, a piece in the window), open ones markings, layers named `cut`, `stitch` or `fold` deciding over the shape; rows of small circles reported as likely holes, not imported; a preview of the pieces, their size, the scale and what was left out; *Import* one undo step, into the open project or a new one.
- ✅ **9.20c SVG import: untrusted files** (P1) — text, images, clones, embedded content, scripts, filters, clips and masks listed as left out by kind, never run or fetched; bytes bounded at 32 MiB, entities checked before parsing (external, parameter, recursive or expanding past 32 MiB refused: the 50,000-reference file froze Electron's parser 7.9 s), the sorting into pieces bounded; the hostile corpus refused or reduced, against the shipped parser.
- ✅ **9.7 The part library, through templates** (P1) — *Save piece as template…* on a piece's right-click: only the selected pieces, as Copy takes them, into the maker's templates tagged `piece`; *Insert pieces from template…* in the Project menu: the picker ticks a template's pieces, the maker's or built in, and inserts them through 8.8b's paste — new ids, references re-pointed, seams kept, one undo step.
- ☐ **9.11 Robust offsetting, written here** (conditional) — only if a template or a maker's pattern needs stitching across a concave join.

### Stage 5 — The interface and distribution ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-5--the-interface-and-distribution))

- ✅ **U.23 The start screen opens on the templates** — a blank project, the primary card with Ctrl+N on it, then up to seven templates drawn as the picker draws them; *All templates…* and *Open…* beside the heading; each recent project with the date it was saved; a project opened from the screen leaves the focus on its board (X10, X20).
- ✅ **U.24a Project tabs, refined** — a tab is as wide as its name, to 200 px, and no narrower than 128 so crowded names stay whole while the strip scrolls; the *All tabs* list opens inside the window (X27, X28).
- ✅ **U.24b The template picker and its management, refined** — an imported file is read first: one that is not a project is refused in the picker with the reason, a project is listed under its own name and chosen; *Show* and *Sort* stay quiet until the maker has templates of their own; *Edit pattern* and *Edit description and tags…*, the form beside the drawing (X11, X29, X31).
- ✅ **U.24c Guides and Arrange, refined** — a level guide shows only its y, an upright one only its x; a press in the rulers' corner is the tool's, never a guide; Arrange as one row of icons per axis; selected outlines read as pieces (X7, X8, X9).
- ✅ **U.24d Parts, Properties and the selection bar, refined** — a new piece beside a namesake is "Panel 2"; *Fit* keeps the drawing out of the open legend's corner; the selection bar goes over or beside the selection rather than cover the next piece; the corner radius fields are named for a screen reader (X32, X33, X35, X40).
- ✅ **U.24e Problems, refined** — the drawer's handle reads "Problems 1 error"; Previous and Next share its line, so at the minimum window a problem and the piece it names are both in view (X22, X23).
- ✅ **U.24f The export dialogs, refined** — re-inspected at 860 × 600 and 1440 × 900 for SVG and DXF (PDF has no dialog): names, Tab order, axe, the live page size and Q43's overlap warning held; `e2e/export-dialog-sizes.spec.ts` keeps them (X39).
- ✅ **U.24g Print Preview, Sheets and calibration, refined** — after *Print* the focus stays in the dialog and Escape closes it; calibration shows its own page, starts with empty readings and has one way out; a sheet's labels wrap inside their sheet (X19, X24, X25, X36).
- ✅ **U.24h Save, recovery and notices, refined** — an unreadable or damaged file, a missing one, a full or read-only disk are each said in the interface's words, in its language; the delete dialog says *frozen* throughout; *Save* and *Recover* are primary, as *Save all* is (X26, X30).
- ✅ **U.25 The visual system and accessibility** — no window key acts behind a dialog that lost its focus, and Escape still closes it; the board says what is selected; a shrinking window keeps the selection in view; Settings grows with the window; a scrolling dialog keeps its buttons at its foot; one focus ring and one tick colour for *it worked*; the status bar counts pieces as Parts does (X19, X21, X34, X37).
- ✅ **U.26 Languages, ready** (P1) — production Polish/German/Russian/French/Spanish, English fallback and non-blocking coverage; PR #87 reconciled and credited. [Verification and review limits](localization-verification.md).
- ✅ **R14 Windows pins, the installer's description, and an icon for `.lcp` files** — the app sets the installer's AppUserModelID; the installer says what the app is; a project file shows its own document icon on Windows, macOS, the `.deb` and the Flatpak; the Windows installer job asserts the icon, the description and the shortcuts' id.
- ✅ **R12 The assisted Windows installer** — asks for whom (only me by default, no administrator) and where; one install per account, no folder that holds anything but LeatherCAD, upgrades in place; CI refuses an unsafe folder and a second scope, and keeps the maker's data through upgrade and uninstall.
- ✅ **B5 Microsoft Store readiness** (P1) — an MSIX whose templates survive reinstalling; the listing itself is the maintainer's.
- ☐ **7.6c Printing from Windows** (conditional) — only with a Windows PC and printer to measure the gauge.

### Stage 6 — Qualification ([plan](superpowers/plans/2026-11-03-release-1.7.md#stage-6--qualification))

- ✅ **R15 Pixels and axe for every screen 1.7 adds** — every screen has a baseline and an axe scan; six baselines and two scans added.
- ◐ **R16 Manufacturing workflows, end to end** — card holder, bifold, a multi-piece bag, a seam, a reused and an imported piece; E2E and paper. The six journeys run, each checking geometry and measuring its PDF; awaiting the card holder cut and stitched once ([log](print-verification-log.md#a-card-holder-from-blank--r16)).
- ☐ **R17 Full regression and packaged qualification**, on every platform there is.
- ✅ **R18 Release documentation** — README media, getting started, keys, formats, known limitations.

### Stage 7 — QA fixes

Two QA passes over the release candidate's code found 30 issues, three of them losing work
([findings](superpowers/specs/2026-11-21-1.7-qa-findings.md)). Wave 1 is QA1, QA2, QA4 and QA5;
then QA3 (after QA1), QA6–QA8; then QA9–QA11. U9, U11 and U14 wait on the maintainer's decision.

- ✅ **QA1 Typed values within limits** — one bound from the file format and a finite check in every number field, scientific notation read, control characters kept out of names (F1, F2, F6, F8, F9).
- ✅ **QA2 Never lose work when something fails** — the window survives a failing panel, a crash neither skips the unsaved question nor deletes the recovery copy, and Save refuses to write a file it could not reopen (F1, F2).
- ✅ **QA3 SVG import refuses what it cannot take** — a drawing past `COORDINATE_LIMIT_MM`, or one whose pieces a project could not name or print, is refused in the dialog with *Import* off; a refused import leaves the selection as it was (F2, F3, F7).
- ✅ **QA4 Degenerate outlines reported truly** — a repeated vertex is not a self-crossing; a zero-size piece is a problem (F4, F5).
- ✅ **QA5 Sewing two pieces starts right** — *Sew together* never pairs a hole set with itself: one selected starts its second side on another piece, and a seam whose sides are the same holes is `SEAM_JOINS_ITSELF`, an error; Shift/Ctrl-click (⌘ on macOS) in Parts adds to or removes from the selection (U1, U3).
- ☐ **QA6 Stitching and pocket feedback** — an open run starts clear of the edge, one reason for the seam allowance, the pocket check says "fits" once, problem wording (U2, U6, U7, U15).
- ☐ **QA7 A new project starts focused** — Ctrl+N focuses the new board; one name and key cap for a new project (U4, U20).
- ✅ **QA8 Board labels say what they mean** — a caption reads "86 holes · pitch 3.85 mm"; a drawn size reads as Properties writes it, "83.33 × 60 mm", while dragging, on the chips and in Properties; pieces laid on one another share one stack of captions above them all (U5, U16, U17).
- ✅ **QA9 Screen-reader names** — the eye button's state, the *Cut* field's name, the template dialog's role (U8, U10, U19).
- ☐ **QA10 Templates confirm and show** — a notice after *Save as template*; *Insert pieces*' checklist in view (U12, U13).
- ✅ **QA11 Panels at 1440 and 860** — rows that do not wrap; a folded panel's chip that does not look on (U18, U21).

### Collected from makers, and decided

Rows that hold no release, carried from 1.6's *Release engineering* until a maker's report or a
decision changes them.

| # | What | Plan |
|---|---|---|
| — **R8** | R1's other platforms: no platform but Linux has a full A–H row in [`print-verification-log.md`](print-verification-log.md) | **A level-3 item, collected from makers** (2026-10-31). It was monitored by decision on 2026-10-18: moved out of 1.5 unverified, as it had moved out of 1.3.5's R1 on 2026-10-09. The maintainer measures prints on Arch only, so a row for another platform comes from a maker with that system and a printer, through the print-report form (until the form exists, an issue with the readings A–H): through *Print* on macOS, and on Windows from the default viewer at *Actual size*. Until one arrives the log says neither platform is verified. It never holds a release; to make one wait, the maintainer would have to mark it planned, which is a decision of its own ([`release-checklist.md`](release-checklist.md), *What a failure holds, by level*) |
| — **R10** | U.7's window edited flag is unverified on macOS, the one platform that shows it: it was checked on Linux, where Electron ignores it, and through the test host and a mock of `setDocumentEdited` | **A level-3 item, collected from makers** (2026-10-31). It was monitored by decision on 2026-10-18: moved out of 1.5 unverified, since no Mac is at hand. A maker with a Mac reports it through the print-report form (until the form exists, an issue): check 12 of [`release-checklist.md`](release-checklist.md) on a real Mac, with the packaged dmg: an edit sets the window's edited dot, *Save* clears it. Tick this only then, saying the macOS version and the date — never from Linux, the test host or a mock. Check 13, ⌘A outside a field ([#97](https://github.com/crnlsp/leathercad/issues/97)), fits the same session |
| — | Code signing | **Not done, by decision** (2026-09-24). LeatherCAD is free and open source and signing costs money every year, so installers ship unsigned; [`getting-started.md`](getting-started.md) says how to open them and how to check a download against its build provenance. If it is ever wanted, a certificate comes first: since 2023 its key must live in hardware or a cloud signing service, so a `.pfx` in CI secrets no longer serves. Candidates: SignPath Foundation (free for open source), Azure Trusted Signing (`azureSignOptions` in electron-builder), a Certum open-source certificate. Signing would also give `enableEmbeddedAsarIntegrityValidation` its point ([ADR 0014](adr/0014-electron-builder-and-release-please.md#consequences)) |

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

### Found by the Smart Features audit (2026-11-18)

What [the audit](smart-features.md) found that 1.7 does not take (its Q44–Q49 are in Stage 3).
None is in a release until it is moved into one; [its backlog](superpowers/plans/2026-11-18-smart-features-backlog.md)
gives each task's problem, acceptance and tests, suggests 1.8 for these five, and holds the
decisions, research and smaller items behind them.

- **9.27 A pocket check says what passed, and why** — one domain function DR8 is built on, giving
  each check's state and both numbers; Properties shows a line per check, never "fits".
- **9.28 Selecting the holes shows their stitch line's requirement** — and a button to the stitch
  line (D24's later refinement).
- **9.29 Card templates say what their pockets hold** — *Holds: Payment card*, the maker's ease
  copied in as a template opens (its D30, to decide).
- **9.30 *Use as stitching* for a marking line** — and back, one undo step; the SVG import preview
  says a `stitch` layer does it on the way in.
- **Q50 Teeth that run into each other are said to** — for typed teeth, from the outline Q46 reads
  (its D31, to decide).

### Also later, each already decided in principle

- **CI/CD and shipping.** CI regrouped into rings by the question each answers, support levels per
  operating system, and the channels LeatherCAD ships through (AUR, `.deb`, Microsoft Store). Under
  way task by task, outside any release, in
  [the plan](superpowers/plans/2026-10-31-ci-cd-and-shipping.md).
- **A general curve editor** (Béziers) on top of 3.9. An edge drawn with it can be stitched, since
  9.19, where it meets its neighbours smoothly or the stitching runs outside it.
- **Pieces gliding** between Design and Sheets.
- **Radial, angular, chained and baseline dimensions,** and dimensions between parts.
- **A screen-calibration step,** which would make 1:1 literal on screen too.
- **Draw tools in their role's colour** — still an open question in the UI decisions record.
- **Measuring on the sheets.** U.9 left it out: no tool acts on the Sheets view, so it would be new
  behaviour, not a change of window.
- **A radius-aware corner policy,** and **leaving single holes out**
  ([domain-model](domain-model.md) §3.3, §6.1). Hole shapes moved into 1.7 as 9.26 (2026-11-17).
- **`.lcp.json`,** a project as plain JSON for version control ([file-format](file-format.md) §8).
- **Windows installer options a maker might ask for:** a page to choose the desktop shortcut and
  the `.lcp` association, and a Wine build (`pnpm package:win`) for trying installer changes without
  a Windows PC. Both rejected for now, with their code and reasoning kept in
  [the installer spec](superpowers/specs/2026-11-03-windows-installer-and-distribution-design.md#10-the-deleted-branch-kept-for-later);
  revisit with a request.

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
