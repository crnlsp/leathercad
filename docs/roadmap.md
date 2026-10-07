# Roadmap

**Released:** v1.2.0 (2026-09-27) · **Next:** 1.3, then 1.4 · **Last updated:** 2026-10-01

What comes next, and everything known that is not done yet. What already shipped is in
[`CHANGELOG.md`](../CHANGELOG.md). The full record of how 1.0 was built — every slice from 0.1 to
8.6, with what each found — is kept in [`history/roadmap-to-1.0.md`](history/roadmap-to-1.0.md),
and what shipped in 1.1.0 to 1.2.0 in [`history/roadmap-1.1-and-1.2.md`](history/roadmap-1.1-and-1.2.md).

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

## 1.3 — the next release

The theme is still the one the roadmap gave 1.1 — from a tool that works to one you can live in.
Its first half shipped early, as 1.1.0 to 1.2.0. 1.3 is what of the rest is done: the window's own
top bar, Settings and right-click menu, the interface's language, and the fixes found on the way.
Everything not done yet moved to [1.4](#14--the-release-after) on 2026-09-30, unchanged, so this
could ship.

### The window

Set first on 2026-09-29, in this order, one pull request each: the window's own frame was still
Electron's default menu, and a right-click did nothing.

- ✅ **8.7 The top bar and Settings.** No application menu on Linux and Windows, and the minimal one
  macOS requires. The project bar gains a Project menu (New, Open, Save as, recent projects), Settings
  and Help (the sample project, About). Settings is a sidebar window — General, Appearance, Keyboard
  shortcuts — that grows a section only when it has a real control. The Paper menu, a copy of the
  sheet indicator, goes with its IPC. Design:
  [`2026-09-29-top-bar-and-settings-design.md`](superpowers/specs/2026-09-29-top-bar-and-settings-design.md).
  ✅ Built as designed. On the way: a menu closed by Escape never gave its button focus back, and
  the shortcut map's "or" failed contrast; both fixed. The README's pictures still show the bar
  before 8.7 (Q27).
- ✅ **8.8 The right-click menu.** Selecting several features already works — Shift-click, and
  dragging a box. A right-click selects what is under the pointer unless it is already selected,
  then offers what the selection can take: Delete, Flip, Lock, Hide and Duplicate part, through the
  commands that exist, as one undo step. The same menu on a row of the parts list. It reuses 8.7's
  menu component. Copy and Paste are not in it: see *Later*.
  ✅ Built as described, with any tool active, and from the keyboard (Shift+F10, the Menu key).
  Lock and Hide became one command for any number of features, so a selection is one step of
  undo. The items never move: one the selection refuses is greyed and says why, once for a run of
  items it shares with. On the way: a piece locked on the board could not be unlocked there, since
  a click passes over it — a right-click now reaches it, and only a right-click; Shift+F10 did
  nothing wherever the canvas had no focus to give it; and Hide now says it leaves the piece off
  the PDF. Found, not fixed: Q28, Q29.
- ✅ **8.10 The interface's language.** Every word on screen through one catalogue per language,
  so a translation is one file and needs no code: `apps/desktop/src/locales/`, checked by
  `pnpm test locales`, tried in `pnpm dev`, and the README invites one. Which languages the app
  offers is the project's own list, `SUPPORTED_LANGUAGES`: a translation joins it after review, not
  by existing. Settings › Language follows the system or keeps a choice, applied at once. English
  is the only supported language so far ([ADR 0018](adr/0018-interface-language.md)).
  ✅ Built as described. On the way: the domain's problem sentences, the export's words for Parts
  and the Sheets view, and the document's undo labels were English below the app — each is now
  facts the app words, so no package but the app speaks a language. The status bar said "1 parts"
  and "1 features"; it counts in the plural now. The recovery dialog wrote its date in the
  system's format rather than the interface's. Left for a language that needs it: paper stays
  English (its glyphs are Latin), default names such as *Untitled* stay as the file keeps them,
  and numbers keep the decimal point.

### Fixed along the way

| # | What | Where it was found | Plan |
|---|---|---|---|
| ✅ **Q28** | Flip acts on what is selected, so a right-click on a piece's outline flips the outline alone: its cut-outs, hardware holes and fold stay where they were, and an asymmetric piece becomes a wrong pattern without a word. A symmetric outline flipped alone changes nothing visible and still takes an undo step. The panel's *Flip this piece* does the same | 8.8, the leathercraft review | ✅ Fixed: a piece's outline stands for the piece. Flipping it — from the menu, the panel or the part's heading — flips everything in the part about the outline's centre, and each stitch hole lands on its own mirror; a label goes to its mirrored place still reading forwards. Anything locked in the piece refuses the whole flip. Any other feature still flips alone |
| ✅ **Q30** | Moving or turning a piece's outline — dragged, with Rotate, or its X, Y or Turn typed — left its cut-outs, rivets, fold and labels where they were, as Flip did before Q28. Rotate did nothing to a part picked by its heading, and the board never showed one as picked. A gesture part of the selection refused was applied to the rest: a stretched piece left its rivets behind, and a lock refused a drag without a word. And a turn stored a 100 mm panel as 99.99999999999999 mm for one angle in five | Q28, reviewing Move, Rotate and Scale | ✅ Fixed: Q28's rule, one helper for every gesture, typed moves and turns included; hidden features travel, a dragged piece never snaps to itself, and a part picked by its heading shows on the board; a refused gesture is refused whole, and says why, lock first; a turn, move or mirror scales nothing, exactly |
| ✅ **Q29** | A part picked by its heading reads "0 selected" in the status bar and "Nothing selected" in Properties, while the right-click menu acts on the whole part | 8.8, the UX review | ✅ Fixed: a picked part is a real selection everywhere. The status bar counts it, Properties shows the part — name, cut, its outline's size, its problems, Flip this piece, Delete part — and the Delete key deletes it whole. Shift-click and Shift-box add to it instead of dropping it, Edit Points edits its outline, and Scale says why it does not resize a whole part. On the way: the panel's Delete was enabled on a feature a locked dependent refused, and did nothing |
| ✅ **Q26** | **bug** · Two findings of the nightly property run ([issue #27](https://github.com/crnlsp/leathercad/issues/27)). A cubic that doubles back on itself measured short — 4 µm on a 94 mm curve, against a 1e-7 mm tolerance — because its speed kinks where it turns, and a kink can make adaptive quadrature's halves agree with the whole while both are wrong. And the nearest point of a line shorter than `EPS_POINT` was always its start, a hair from its other end | The nightly runs of 2026-09-27 to 2026-09-29 (seeds 267645448, 1303645 and 285059694) | ✅ Fixed: a cubic is measured in pieces cut at every turning point of x and of y, where its speed is smooth, and a line is projected on exactly at any length but zero. Both counterexamples are regression tests, and a new property measures cubics along a line against the distance they travel |

### Release engineering

| # | What | Plan |
|---|---|---|
| ✅ **R2** | `develop` was deleted once by merging the `develop` → `main` pull request, and was gone again from 2026-09-26 — so 3.9b–d and the fixes after 1.1.0 went straight into `main` | ✅ Done 2026-09-29. The cause: *Automatically delete head branches* deleted `develop` when a release merged, and the *General* ruleset that should have stopped it named no branch. `develop` is recreated, and each branch has a ruleset: no deletion, no force push, pull requests only with every CI check required — squash merges only into `develop`, bringing a release back included, and merge commits only into `main`, which also requires *Release gate* |
| ✅ **R7** | Releases went out before their section of the roadmap was done: the roadmap's 1.1 shipped as 1.1.0, 1.1.1 and 1.2.0 with ten of its slices still to do, because a release pull request was merged whenever release-please opened one | ✅ A release is its whole section: `develop` reaches `main` only when every item under *the next release* is ✅, and the *Release gate* check refuses a pull request into `main` from anything but `develop` or release-please, and a section with anything not done left in it ([`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases)) |

---

## 1.4 — the release after

Everything 1.3 did not finish, moved here unchanged on 2026-09-30 so that what was done could ship
([`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases)). It becomes *the next release*
once 1.3 has shipped. The order within each group is the suggested order of work, and *The window*
comes before the other groups.

### The window

Left from 1.3's *The window*: nothing says a new release exists.

- ☐ **8.9 Update discovery.** The main process asks GitHub for the latest release and compares it
  with the running version: *Check for updates* in Settings › Updates, the result in About, and a
  quiet mark on Settings when one exists. It links to the release page and installs nothing (see
  *Not planned*). The app's first network request, so `SECURITY.md`'s "no network connections"
  changes with it, in an ADR; the Flatpak skips it, as Flathub updates it. Reads tags in both
  forms (R4).

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
- ☐ **7.6c Printing from Windows.** A transport that can be told not to scale. SumatraPDF is the
  candidate (GPL-3.0, beside the app). It needs its own ADR and a gauge measured on paper. Until
  then the preview saves the PDF.
- ☐ **6.2 SVG export.** Millimetre units, one group per layer, the single Y flip, with the
  accuracy tests from [`printing.md`](printing.md) §14.
- ☐ **6.5 DXF export** (R12), for laser and CNC users.
- ☐ **6.4 The rest of the export dialog.** Presets, layers and bounds. Printing only some sheets is
  the Print Preview's since 7.6.
  `paperOptionsFitting` already answers "what would fit", so the dialog reports rather than
  computes.
- ☐ **7.2 Taped parts, finished.** Edge arrows and a printed assembly sheet. A taped part is never
  turned: since 7.8 a part is taped only when it fits whole neither way.
- ☐ **7.5 Calibration.** Per-printer correction factors, with a ±2 % guard. The verification
  gauge already shows when a printer is off.
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
| ☐ **Q4** | Problems have no stable identity across edits. The panel keys by content today, so nothing breaks yet | UI audit, deferred opportunities | Give a problem a stable key before anything relies on one |
| ☐ **Q7** | The golden-fixture layer [`testing.md`](testing.md) §2 plans — committed geometry outputs, reviewed when they change — was never built. The `.lcp` format fixtures and the SVG snapshots cover part of it | The post-1.0 cleanup | Build it for offsetting and hole distribution first, where silent drift costs leather |
| ☐ **Q27** | `pnpm docs:media` fails where `/tmp` is its own filesystem (`renameSync` across devices, `EXDEV`), and never loads the window while it records video — on `develop` as well. So the README's pictures still show the bar before 8.7, and `print.png` the verification block before 7.8 | 8.7, retaking the README pictures | Copy instead of rename; find why recording stops the window loading; then retake all four on a machine with ffmpeg, gifsicle and pngquant |
| ☐ **Q31** | What resizing a piece should do. Scale acts on what is selected, so an outline scaled alone leaves its slots where they were, and a whole piece scaled evenly grows its rivet holes and labels with it — a 4 mm rivet hole becomes 6 mm. The stitch margin and the iron's pitch already stay | Q30 | Decide which sizes a piece keeps (hardware, labels, card slots) before Scale takes the whole piece |

#### Left from the independent QA pass (2026-09-24)

The two findings still open from the outside QA pass over `main` at `d54b2d7` (v1.0.x); its fixes
are in the [record](history/roadmap-1.1-and-1.2.md). The ids in brackets are the report's.

| # | What | Severity | Plan |
|---|---|---|---|
| ☐ **Q15** | (S1) A dimension to a rounded or seam-allowance corner reads less than the piece: a corner anchor on an arc is the arc's middle, and an outward allowance rounds corners the maker never rounded (97 × 67 reads 94.9) | P2 · investigate | Decide what a corner of a rounded outline *means* to a maker before changing it; 4.10b |
| ✅ **Q17** | (S3) The footer and *Page N of M* print 5 mm from the paper edge, inside the margin the code itself calls unreliable | P3 · investigate | ✅ Fixed in 7.8: everything printed is inside the margins, in the verification strip |

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
| ☐ **R1** | The physical print check (7.7) was done, but its readings are not in [`print-verification-log.md`](print-verification-log.md). Since 7.6 it has two Linux rows: a viewer's print scaled to 96 %, and sheet 1 through *Print* measured true. No platform has a full A–H row yet | Record one row per platform, through *Print* on Linux and macOS. Until then the project does not claim verified 1:1 output in writing |
| ☐ **R3** | 1.0.1's release notes list every fix twice, because pull requests into `develop` were merged with merge commits, which release-please reads as well as the commits inside them. 1.2.0's list every feature twice, for the same reason: #23, #25 and #26 went into `main` with merge commits | Squash-merge into `develop` ([`CONTRIBUTING.md`](../CONTRIBUTING.md)), which the ruleset enforces since 2026-09-29; `CHANGELOG.md` is corrected for both; edit the GitHub release notes of 1.0.1 and 1.2.0 by hand |
| ☐ **R4** | Tags read `leathercad-v1.0.1`, not `v1.0.1` | Decide before 1.4 whether to keep the component in the tag; 1.3 keeps it. Changing it later breaks the link between releases |
| ✅ **R5** | `package.yml` builds Windows and macOS only when packaging could have changed, because a private repository pays for those minutes. The repository is public now, where they are free | ✅ Done 2026-10-07: it runs on every pull request and push, and the unit tests on Windows and macOS moved from the weekly run into CI beside it. Its weekly run went too: it only caught what the path filter let through |
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
