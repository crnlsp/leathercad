# Roadmap

**Released:** v1.5.0 (2026-10-18) · **Next:** 1.6 · **Last updated:** 2026-10-26

What comes next, and everything known that is not done yet. What already shipped is in
[`CHANGELOG.md`](../CHANGELOG.md). The full record of how 1.0 was built — every slice from 0.1 to
8.6, with what each found — is kept in [`history/roadmap-to-1.0.md`](history/roadmap-to-1.0.md),
what shipped in 1.1.0 to 1.2.0 in [`history/roadmap-1.1-and-1.2.md`](history/roadmap-1.1-and-1.2.md),
what shipped in 1.3.0 in [`history/roadmap-1.3.md`](history/roadmap-1.3.md), what shipped in
1.3.5 in [`history/roadmap-1.3.5.md`](history/roadmap-1.3.5.md), and what shipped in 1.5 in
[`history/roadmap-1.5.md`](history/roadmap-1.5.md). Where the work after 1.6 is
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

## Where 1.0 left things

| Milestone | Proves | |
|---|---|---|
| **M1** | A 100 mm square, drawn from data, on a zoomable canvas with a mm ruler | ✅ |
| **M2** | Draw a rounded rectangle with snapping, undo and redo it | ✅ |
| **M3** | Change a rectangle's width; its stitch line and holes update live | ✅ |
| **M4** | Save, quit, reopen, and everything is exactly as it was | ✅ |
| **M5** | Print a wallet pattern and measure 100.0 mm with a steel rule | ✅ Measured by the maintainer, and on Linux recorded in [`print-verification-log.md`](print-verification-log.md) (**R1**, 2026-10-09) |

1.0 shipped on Linux, Windows and macOS, unsigned by decision (see *Release engineering*).

---

## 1.6 — the next release

**After the refinement.** What 1.3 did not finish and 1.4 does not take moved here on 2026-10-07, when 1.4 was split
([1.3.5's record](history/roadmap-1.3.5.md) says why): word for word, but for 8.9, which now reads the one tag
form R4 decided. It was 1.5 until 2026-10-08, when the UI refinement took that number, and it
became *the next release* when 1.5 shipped, on 2026-10-18, with R8 and R10 from 1.5 as monitored
items. The order within each group is the suggested
order of work, and *The window* comes before the other groups.

### The window

Left from 1.3's *The window*: nothing says a new release exists.

- ✅ **8.9 Update discovery.** The main process asks GitHub for the latest release and compares it
  with the running version: *Check for updates* in Settings › Updates, the result in About, and a
  quiet mark on Settings when one exists. It links to the release page and installs nothing (see
  *Not planned*). The app's first network request, so `SECURITY.md`'s "no network connections"
  changes with it, in an ADR; the Flatpak skips it, as Flathub updates it. Reads tags in the
  `leathercad-v` form (R4).
  **Done** (2026-10-20), as [ADR 0020](adr/0020-update-discovery.md): the check runs only when
  the maker asks for it, never as the app starts, by the maintainer's decision (2026-10-23):
  *Check now* in Settings › Updates, or the version at the status bar's left, whose tooltip says
  what it found; a spinner turns while it asks. Answered, the version becomes a chip — a sage tick,
  or a tan arrow and the new number — and Settings › Updates a card with the same glyph; neither
  asks again for five minutes, though a failed check may. The Settings button opens on Updates
  while its mark shows. `SECURITY.md` says why
  the app makes the request and what it carries. No test asks GitHub: `LEATHERCAD_RELEASES_URL`
  points the check at a server of the test's own, or at nothing.

### Drawing and editing

- ✅ **3.10 Guides, alignment and distribution.** Persisted horizontal, vertical and diagonal
  guides, placed from the rulers, the Guides tool (a click, or a drag through two points) or
  Properties, and parallel to another guide at a typed distance; snapping, exact editing,
  deletion and undo. Multi-selection alignment and equal-gap distribution move whole pieces and explain
  refusals. Guides stay off paper; format 10 keeps them on reopen.
  [Design and acceptance criteria](superpowers/specs/2026-10-23-guides-alignment.md).
- ✅ **3.12 Convert to drawn path.** The explicit escape hatch for a circle someone wants to squash
  or an arc they want to reshape freely, saying plainly that it stops being a circle or an arc.
  Until then, 3.7 refuses those transforms.
  **Done** (2026-10-25): a selected circle, arc or rectangle offers *Convert to drawn path* in
  Properties, under its fields, with what it costs said beside the button — it stops being a circle,
  and its centre and diameter can no longer be typed. The path is the one the shape already drew, so
  nothing on the board or the paper moves: the feature keeps its id, name, kind and role, a
  rectangle keeps its four corners as anchors, and every stitch line, hole set, row of holes and
  dimension following it resolves exactly as before. One step of undo brings the shape back. After
  it, the squash and the shear 3.7 refused go through, and *Edit points* reshapes it; the two
  refusals now name the way out. A rectangle is offered it too, because a turned one is refused a
  stretch (`WOULD_SHEAR`) for the same reason a circle is. A hardware hole is not: a punch is round,
  and an oval opening is a cut-out (`HOLE_STAYS_ROUND`). **A squashed circle is made of cubics** —
  the rule every drawn path already follows ([geometry](geometry.md) §4.2 rule 2) — so a stitch line
  round one reports that it cannot follow it (`OFFSET_UNSUPPORTED`) until 9.19; the note beside the
  button says so before the maker converts. No format change: a drawn path was already stored.
  [Domain model §4.8](domain-model.md#48-converting-a-shape-to-a-drawn-path--built-312).
- ✅ **4.10b Dimensions drawn like drafting.** Arrowheads, with the number breaking the line — the
  one item of the visual identity test that only partly passes. It prints, so it is a measurement
  change, not a canvas treatment.
  **Done** (2026-10-26): a dimension ends in a filled arrowhead at each extension line and its line
  breaks where its number sits, on the board and on paper, so identity item 9 passes. One pure
  function in `domain`, `draftDimensionLine`, places the arrowheads and the break in millimetres; the
  display list calls it with the board's constant sizes (10 × 3.5 px, the break the number's halo), and
  the export scene with true millimetres (2.5 × 0.85 mm, ISO 129-1's three to one, and 1 mm either
  side of the number), both from `DIMENSION_MARKS` in the theme. When the arrowheads and the number
  do not both fit between the extension lines, the arrowheads turn outside and point in. The paper's
  number, laid out by evaluation, now sits centred on its line rather than beside it, as the board's
  already did. An arrowhead is the first filled shape in an export's pattern: `ExportPath.filled`,
  filled in the PDF, the SVG and the Sheets view, outlined in a DXF. The resolved path is unchanged —
  the extension lines and the whole line — so selection, the halo and bounds are as they were.
  Property tests: each arrowhead's tip on its end, its size and axis; the line on
  itself, broken exactly for the number, with no other break; inside or outside by the room there
  is; and a rigid motion moves it all. The print test's rasterised check measures the dimension
  between its extension lines now, since its line is no longer one stroke. A number wider than its
  line stays over the middle of it — drafting would set it outside — until a dimension that short is
  wanted. No format change. [Domain model §3.7](domain-model.md#37-measurement--linear-built-410a),
  [printing](printing.md).
- ✅ **4.14 A row of holes along a line** that is not a stitch line (carried forward from Phase 4).
  **Done** (2026-10-25): a selected marking line offers *Add a row of holes* in Properties, and the
  row is a feature of its own, `HoleRow`, derived from that line as a hole set is from its stitch
  line — so it follows the line when it is edited, mirrors with its piece, goes with the line when
  the line is deleted, and is never stored as holes. Holes are placed as a hole set's defaults place
  them: one on each end of an open line, the rest evenly between, one on every corner, and a closed
  line divided with no doubled hole. Each is a round hole at a true diameter, in the `hardware` role:
  drawn and printed at its size, cut by a laser export, and kept on the leather by its rim (Q33's
  rule). The spacing rules for stitching do not apply — a row is punched, not sewn. Properties edits
  the pitch and the diameter and reads the count and the spacing achieved; a new row is 25 mm apart
  and 4 mm across, the 4.7 design's belt holes and the Hardware tool's first punch. Only a marking
  line hosts one: a stitch line's holes are a hole set, and holes along an outline or a fold would
  be cut through it. Holes no more than a diameter apart are warned about (`HOLES_OVERLAP`): they
  cut as one slot. *Exactly this pitch* and a corner policy are left until someone asks. Format 11
  holds it.
  [Domain model §3.6a](domain-model.md#36a-holerow--built-414).

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
| ✅ **Q33** | **bug** · A hardware hole is checked by its centre alone. `OUTSIDE_PART` and `HOLE_TOO_CLOSE_TO_EDGE` read a hardware hole's centre (`holePoints` in `validate.ts`) and never its radius, so a 6 mm hole centred 2 mm inside the edge cuts 1 mm through it and nothing is said, and a 4 mm rivet hole whose rim crosses the edge is only *too close* | The product roadmap refresh (2026-10-17), reading the rules for hardware clearance | ✅ Fixed (2026-10-25): a hardware hole is its circle. It is off the material when an edge — the outline's or a cut-out's — passes nearer its centre than its radius, which is exact rather than sampled, and too close when its rim is under 1.5 mm from one. A rim within a storage quantum of an edge is on it, as a line's end is (Q2). The clearance stays the stitch hole's 1.5 mm, measured from the rim: what tears is the same strip of leather between a cut and an edge, whatever made the cut, and hardware that pulls harder is 9.23's footprint question, not a second figure now. A stitch hole stays a point. Property tests over centre and radius: the verdict matches the exact rim clearance on a square panel, a rim leaving a round part is always off, and shrinking a hole never finds a new problem. The two sentences now say *leave the material* and *a hole needs* |
| ☐ **Q4** | Problems have no stable identity across edits. The panel keys by content today, so nothing breaks yet | UI audit, deferred opportunities | Give a problem a stable key before anything relies on one — 9.16, accepting a warning, will |
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
millions of holes, so a hole-count budget may be wanted one day. Moving the pointer over the sample
wallet, hovering or dragging, kept every frame at about 6 ms and no pointer event over 16 ms in the
built app (2026-10-18), although each move re-renders the whole window. The later
[performance audit](performance-backlog.md#measurement-record) recorded user-visible problems
with history retention, complex outlines and tiled output. Its prioritized tasks are tracked
under [Later](#performance-and-resource-efficiency), without adding them to this release gate.

### Release engineering

| # | What | Plan |
|---|---|---|
| ✅ **R6** | The built renderer loads from `app://leathercad`, and `GrantFileProtocolExtraPrivileges` is off | The protocol serves only bundled renderer files, checks decoded paths and real targets, and preserves CSP and sandboxing. Packaged tests cover the origin, denied paths, fonts, PDF preview worker and measured PDF export; a packaged app ignores the development URL override. [ADR 0014](adr/0014-electron-builder-and-release-please.md#r6-amendment--a-bundled-app-origin-2026-10-23) |
| — **R8** | R1's other platforms: no platform but Linux has a full A–H row in [`print-verification-log.md`](print-verification-log.md) | **Monitored, by decision** (2026-10-18): moved out of 1.5 unverified, as it had moved out of 1.3.5's R1 on 2026-10-09. When a Windows PC or a Mac and a printer are at hand, record a row through *Print* on macOS, and on Windows from the default viewer at *Actual size*. Until then the log says neither platform is verified. Marked ☐ if a release is to wait for it |
| — **R10** | U.7's window edited flag is unverified on macOS, the one platform that shows it: it was checked on Linux, where Electron ignores it, and through the test host and a mock of `setDocumentEdited` | **Monitored, by decision** (2026-10-18): moved out of 1.5 unverified, since no Mac is at hand. Check 12 of [`release-checklist.md`](release-checklist.md) on a real Mac, with the packaged dmg: an edit sets the window's edited dot, *Save* clears it. Tick this only then, saying the macOS version and the date — never from Linux, the test host or a mock. Check 13, ⌘A outside a field ([#97](https://github.com/crnlsp/leathercad/issues/97)), fits the same session |
| — | Code signing | **Not done, by decision** (2026-09-24). LeatherCAD is free and open source and signing costs money every year, so installers ship unsigned; [`getting-started.md`](getting-started.md) says how to open them and how to check a download against its build provenance. If it is ever wanted, electron-builder signs when `CSC_LINK` is set |

---

## Later

Candidate milestones, each a theme, in the order suggested for the work after 1.6. A milestone
becomes a release only when it is next — named, and its items marked, in a change of its own — so
nothing here is a promise, and the order may change as makers say what they need. Why these themes,
why this order, and what depends on what are drawn in [`product-roadmap.md`](product-roadmap.md).

The numbers are Phase 9's from the 1.0 record, continued from 9.12 on 2026-10-17. The gaps are items
that moved: DXF (9.4) into 1.1 as 6.5, Windows and macOS (9.8) into 1.0, and nesting (9.9) to *Not
planned*.

### Performance and resource efficiency

The [performance backlog](performance-backlog.md) owns the status and acceptance criteria for
**PERF-001 through PERF-017**, recorded by the 2026-10-25 audit of `5cf7294`. All are initially
planned and unassigned to a release. Reproduce on the implementation revision: `develop` has
advanced since those measurements. Promote selected items into a release explicitly, linking
their stable IDs rather than copying the task lists here.

**Work first:** export geometry retained through history (PERF-001), blocking tiled PDF export
(PERF-002), slow complex-outline snapping (PERF-004), and many-page Sheets rendering (PERF-003).
Start with the small benchmark corrections in PERF-017 so before/after evidence is trustworthy.
The backlog includes [the full priority register](performance-backlog.md#task-register),
[independent PR order and dependencies](performance-backlog.md#recommended-implementation-order),
and [verification requirements](performance-backlog.md#verification-and-evidence).

Small follow-ups include clearing previous-project caches, idle frame scheduling and DPI-change
handling. Coordinate lifecycle work with Q39, persistence with Q35/Q36, and benchmark work with
Q40. This work preserves millimetre accuracy, exact 1:1 output and document/history correctness;
no renderer rewrite or unmeasured speedup is implied.

### Pieces that fit

Two edges sewn together must have the same holes, and a pocket must hold what it is for. Today each
piece is checked on its own, and only a mirror makes two hole counts equal
([domain-model](domain-model.md) §7).

- **9.6 Seam pairing and hole-count parity** — catches a genuinely expensive mistake. Two runs of
  holes — on two pieces, or on one piece folded over — are paired as a seam, and a seam whose counts
  differ, or whose lengths differ by more than the slice decides is sewable, is a problem naming
  both (`SEAM_HOLE_COUNT_MISMATCH`). The selection bar's third line, which U.17 leaves room for and
  builds nothing of (R-14), reads the pair: "Matches Outer, right run 15 = 15".
- **9.12 Thread, and the cutting and stitching list** — the thread a seam takes, beside its pair in
  the selection bar (R-14's "Thread ≈ 0.9 m"), and one list for the project: the pieces to cut and
  how many, the holes and thread per seam, the hardware, and the leather all the pieces take. One
  home for the thread figure [domain-model](domain-model.md) §6.3 asks for and for
  [printing](printing.md) §12's hole and thread report. Its formula is this item's to decide: those
  two say 4–5× and 4× the seam's length, and a seam's thickness changes it.
- **9.13 Alignment marks on mating edges** — marks at chosen holes along a seam, printed at the
  matching hole on both pieces, so they line up when glued and stitched. Derived from the seam, so
  they follow it. Printed, never cut: a notch in an edge that will be burnished is a flaw in the
  goods. Not the registration crosses that line up paper sheets (7.2a). Today a marking line whose
  purpose is *Alignment* is drawn by hand.
- **9.14 A pocket that holds what it must** — the first requirement a maker states. The clear width
  and depth inside an open stitch line, up to its opening, is geometry the board already has, so it
  comes first as a reading. Then the maker says what the pocket holds — a card (ID-1, 85.60 × 53.98
  mm) or a size they type, such as a banknote's — and a pocket too small for it, with the maker's
  ease, is a problem. Stored as metadata, since it changes nothing drawn, cut or printed
  ([file-format](file-format.md) §4.5, rule 3). One requirement on one kind of thing, not a
  requirements engine.

**Needs:** nothing unbuilt — runs, anchors and hole reports exist, and U.17's bar has room. To
decide: whether a seam alone keeps the format version while printed marks bump it; where a
requirement attaches; and the ease, which is not set until the maker sets it, as the leather's
thickness is not (U.13).

**Done when:**
- two runs paired with different counts make one problem naming both, and equal ones read *Matches*;
- the list gives thread per seam, and the leather each piece takes;
- marks print at matching holes on both pieces and measure the same distance along each on paper;
- a card pocket shows its clear size and, once an ease is set, warns when the card will not go in;
- property tests: pairing is symmetric, marks land on matching holes, a larger pocket never fits
  less.

**Not in it:** changing a count to match (9.17 offers that); pieces placed as they are stacked
(*Exploring*); ease that follows the leather's thickness (9.1); a table of every currency's notes.

### Problems that explain themselves

Every problem is listed, named and shown today (4.12, U.7), but a beginner cannot always act on one,
and a warning the maker has weighed comes back on every print.

- **9.15 Every problem explained** — beside each problem, why it matters to the leather and what to
  do about it, in the app's words ([ADR 0018](adr/0018-interface-language.md)). Words only, no rule
  changes; a code without its explanation fails a test, as the catalogue's audit does today.
- **Q34 Printed text too small to read** — DR5's rule, `TEXT_TOO_SMALL_TO_PRINT`, was to arrive with
  document text in 4.11 and never did: a label has had its own height since 4.11b, and nothing
  checks it (`INVARIANTS_WITHOUT_A_CODE` still says *Planned*). [domain-model](domain-model.md) §8.6
  gives its threshold, 1.5 mm.
- **9.16 Accepting a warning** — the maker says a warning is meant, and it stops nagging: still
  listed, marked accepted, and back as soon as what it is about changes. An error cannot be
  accepted. Kept in the project as codes and the features they name, never words. Needs Q4 (1.6), so
  that an acceptance finds its problem again after an edit.
- **9.17 Fixes offered with a problem** — where one correction is plainly safe, the problem offers
  it: a stitch margin that clears the edge, the iron that matches the spacing, the spacing that gives
  a seam equal counts. Pointing at it previews it through the store's preview, which never touches
  history; choosing it is one undo step; nothing is fixed without the maker choosing. A fix is an
  ordinary command proposed from the problem, and one that no longer applies is refused, saying why
  (X1).

**Needs:** Q4 for 9.16; the store's transactions, built, for previews; 9.6 for the fix most worth
having.

**Done when:**
- every code the drawer can list has its explanation, and an audit test holds it;
- an accepted warning survives unrelated edits and a save and reopen, and returns when its cause
  changes;
- every fix previews without an undo step, applies as one, and is refused with a reason once it no
  longer fits.

**Not in it:** fixing anything automatically; fixes for refusals, which are never listed; blocking
export; suggestions that no rule explains.

### Start from something

A new project is blank, and the sample wallet (8.3) is the only worked example. A maker's own good
parts cannot be carried to the next project.

- **9.18 New project from a template** — *New project* offers a few worked projects beside the blank
  one — a card holder, a bifold, a key fob — each opened untitled from the app as the sample is
  (`readSampleProject`), the sample wallet first among them.
- **8.8b Copy, Paste and Duplicate of features,** after 8.8. Neither exists, and they carry a
  domain question: what a pasted stitch line follows when its outline was not copied with it. A
  command with property tests, not a menu item. A part pastes into another project too, carried as
  a `.lcpart`-shaped copy ([file-format](file-format.md) §8).
- **9.7 Templates** — a part saved to a library and inserted again (was 8.1): a copy with its
  derivations re-pointed, never a live link ([domain-model](domain-model.md) §9). Parameterised
  templates moved to *Exploring* on 2026-10-17.

**Needs:** the sample's untitled opening (8.3) and duplicate-part re-pointing (4.3b), both built;
8.8b's domain question answered before 9.7, which inserts a part the same way.

**Done when:**
- each template opens untitled, with no problems, and prints;
- a pasted piece keeps its stitching, re-pointed to the copies, and nothing in it follows a feature
  it left behind;
- an inserted part evaluates the same on a machine that has never seen the library.

**Not in it:** parameterised templates; a shared or online library; a template that changes the
projects already made from it.

### Bring patterns in

Most makers arrive with patterns already drawn — in Inkscape or Illustrator, or on card. None of it
comes in today except by drawing it again.

- **9.19 Curves that can be stitched** — analytic offsetting refuses cubic segments
  ([geometry](geometry.md) §6.2), so no stitch line can follow a curve that an import or a curve
  editor brings — or a circle squashed after 3.12, which does make cubics (3.12 kept
  [geometry](geometry.md) §4.2 rule 2 rather than fit arcs of its own). Before 9.11, an offset through arcs fitted to the cubic within the flattening
  tolerance would build that stitch line instead of refusing it; whether to do that or wait for 9.11
  is the slice's to decide. Pure geometry under [geometry](geometry.md) §12's definition of done, so
  it can start whenever there is room.
- **9.20 SVG import** — an existing vector pattern, opened as pieces. Its size is read from the
  file's units, then shown and confirmed before anything is made: px is 96 to the inch by the CSS
  rule Inkscape follows, but Illustrator writes px at 72, and a file that gives no size is asked
  about, never guessed. Closed shapes become outlines, and cut-outs by what they lie inside; open
  ones become markings, unless a layer's name says otherwise; small circles along a path are
  reported as likely stitch holes rather than made into hardware. Text, images, clipping and effects
  are listed as left out. The importer is a package beside `export`, with its own Y flip
  ([architecture](architecture.md) §2), and its XML parser a new dependency, so an ADR comes first.
- **9.2 Tracing from images** — import a photo or scan, set its scale from a known dimension, trace
  over it. The image is kept in the project's `assets/`, which [file-format](file-format.md) §1
  reserves and nothing writes yet: a format change.

**Needs:** 9.19 before an imported curve can be stitched; the parser's ADR; images in the `.lcp` for
9.2.

**Done when:**
- a 100 mm square saved in mm, in pt and in Inkscape's px imports at 100.0 mm, one in Illustrator's
  px is read at 72 to the inch or asked about, and a file with no size asks;
- everything left out is listed by kind and count;
- a stitch line follows an imported curve within the flattening tolerance;
- a scan scaled from a known length reads that length.

**Not in it:** turning an image into lines by itself; straightening a photo taken at an angle;
importing PDF or DXF.

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

- **9.11 Robust offsetting, written here** — the concave outlines analytic offsetting refuses, and
  stitching *across* a concave join such as a thumb scoop. Two bindings were tried and rejected
  (ADR 0008); it will be written, not bought.
- **9.5 Boolean operations** — built together with 9.11, since both have to find and remove the loops
  an operation creates.

**Done when:** [geometry](geometry.md) §6.3's rules hold — integers at the quantum, `offsetPath`
still the entry point, areas tested rather than bounds; a stitch line follows a thumb scoop; and
`area(A ∪ B) + area(A ∩ B) = area(A) + area(B)` holds as a property. **Not in it:** nesting.

### Found by the post-1.5 stabilization (2026-10-19)

Real, and not fixed in that pass because each needs a decision or a change of its own. None is in a
release until it is moved into one.

- **Q35 A save is not flushed to disk before it replaces the file.** `writeFileAtomic`
  (`apps/desktop/src/main/atomicWrite.ts`) renames a temporary file into place without `fsync`ing
  it or its folder, so a power cut just after a save can leave an empty `.lcp` on some file systems;
  the rename also replaces a symlink with a plain file and resets the file's permissions.
- **Q36 Ctrl+S during a drag saves the drag's preview,** not the document before it
  (`useProjectFile.ts`); the crash-recovery copy already waits for the gesture to end.
- **Q37 Cmd+Q, then *Discard*, closes the window but leaves the app running on macOS** — the quit
  was cancelled by the question, and Discard only closes the window. Unverified: no Mac. Check it
  in the same Mac session as release-checklist check 12.
- **Q38 Local epsilons,** which invariant 7 forbids: `glide.ts`, `mat2x3.ts`, `segment/types.ts`,
  `arc.ts` and `flatten.ts`'s step counts, `polynomial.ts`, `export/sheetsDisplay.ts` and
  `persist/schema.ts`; and `arc.ts`'s `toCubics` checks a radius against `EPS_ANGLE`. Each moves
  numbers on the geometry or export path, so they want one change with property tests and a lint
  rule for `e-N` literals outside `core`.
- **Q39 A tool under way is not reset when a project opens** — only an open drag is rolled back,
  so a polyline half drawn continues into the new project.
- **Q40 `export.bench.ts` times the render package's SVG backend,** not the `exportSvg` and DXF
  writers that ship; fixing it moves the committed baseline.

### Also later, each already decided in principle

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
| **Q21** | (S7) *Cut 2* on a mirrored pair does not say to flip the template for the second piece | deferred | The Sheets spec §11 |
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
