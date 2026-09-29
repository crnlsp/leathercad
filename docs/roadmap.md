# Roadmap

**Released:** v1.2.0 (2026-09-27) · **Next:** 1.3 · **Last updated:** 2026-09-29

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
Its first half shipped early, as 1.1.0 to 1.2.0; this is the rest. The order within each group is
the suggested order of work, and *The window* comes before the other groups.

### The window

Set first on 2026-09-29, in this order, one pull request each: the window's own frame was still
Electron's default menu, a right-click did nothing, and nothing said a new release existed.

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

- ☐ **6.2 SVG export.** Millimetre units, one group per layer, the single Y flip, with the
  accuracy tests from [`printing.md`](printing.md) §14.
- ☐ **6.5 DXF export** (R12), for laser and CNC users.
- ☐ **6.4 The rest of the export dialog.** Presets, layers, bounds, and printing only some sheets.
  `paperOptionsFitting` already answers "what would fit", so the dialog reports rather than
  computes.
- ☐ **7.2 Taped parts, finished.** Edge arrows and a printed assembly sheet. Pagination still never
  rotates a part: leather stretches across the grain, and the model does not know the grain yet.
- ☐ **7.5 Calibration.** Per-printer correction factors, with a ±2 % guard. The square and ruler
  already show when a printer is off.
- ☐ **7.8 A slimmer verification block.** Needs a new physical measurement before and after.

### Known issues and findings

Everything found along the way that is not fixed yet, with where it was found. The ones marked
**bug** come first.

| # | What | Where it was found | Plan |
|---|---|---|---|
| ☐ **Q4** | Problems have no stable identity across edits. The panel keys by content today, so nothing breaks yet | UI audit, deferred opportunities | Give a problem a stable key before anything relies on one |
| ☐ **Q7** | The golden-fixture layer [`testing.md`](testing.md) §2 plans — committed geometry outputs, reviewed when they change — was never built. The `.lcp` format fixtures and the SVG snapshots cover part of it | The post-1.0 cleanup | Build it for offsetting and hole distribution first, where silent drift costs leather |
| ☐ **Q27** | `pnpm docs:media` fails where `/tmp` is its own filesystem (`renameSync` across devices, `EXDEV`), and never loads the window while it records video — on `develop` as well. So the README's pictures still show the bar before 8.7 | 8.7, retaking the README pictures | Copy instead of rename; find why recording stops the window loading; then retake all four on a machine with ffmpeg, gifsicle and pngquant |
| ✅ **Q28** | Flip acts on what is selected, so a right-click on a piece's outline flips the outline alone: its cut-outs, hardware holes and fold stay where they were, and an asymmetric piece becomes a wrong pattern without a word. A symmetric outline flipped alone changes nothing visible and still takes an undo step. The panel's *Flip this piece* does the same | 8.8, the leathercraft review | ✅ Fixed: a piece's outline stands for the piece. Flipping it — from the menu, the panel or the part's heading — flips everything in the part about the outline's centre, and each stitch hole lands on its own mirror; a label goes to its mirrored place still reading forwards. Anything locked in the piece refuses the whole flip. Any other feature still flips alone |
| ✅ **Q30** | Moving or turning a piece's outline — dragged, with Rotate, or its X, Y or Turn typed — left its cut-outs, rivets, fold and labels where they were, as Flip did before Q28. Rotate did nothing to a part picked by its heading, and the board never showed one as picked. A gesture part of the selection refused was applied to the rest: a stretched piece left its rivets behind, and a lock refused a drag without a word. And a turn stored a 100 mm panel as 99.99999999999999 mm for one angle in five | Q28, reviewing Move, Rotate and Scale | ✅ Fixed: Q28's rule, one helper for every gesture, typed moves and turns included; hidden features travel, a dragged piece never snaps to itself, and a part picked by its heading shows on the board; a refused gesture is refused whole, and says why, lock first; a turn, move or mirror scales nothing, exactly |
| ☐ **Q31** | What resizing a piece should do. Scale acts on what is selected, so an outline scaled alone leaves its slots where they were, and a whole piece scaled evenly grows its rivet holes and labels with it — a 4 mm rivet hole becomes 6 mm. The stitch margin and the iron's pitch already stay | Q30 | Decide which sizes a piece keeps (hardware, labels, card slots) before Scale takes the whole piece |
| ☐ **Q29** | A part picked by its heading reads "0 selected" in the status bar and "Nothing selected" in Properties, while the right-click menu acts on the whole part | 8.8, the UX review | Count and describe a part selection as the part |
| ✅ **Q26** | **bug** · Two findings of the nightly property run ([issue #27](https://github.com/crnlsp/leathercad/issues/27)). A cubic that doubles back on itself measured short — 4 µm on a 94 mm curve, against a 1e-7 mm tolerance — because its speed kinks where it turns, and a kink can make adaptive quadrature's halves agree with the whole while both are wrong. And the nearest point of a line shorter than `EPS_POINT` was always its start, a hair from its other end | The nightly runs of 2026-09-27 to 2026-09-29 (seeds 267645448, 1303645 and 285059694) | ✅ Fixed: a cubic is measured in pieces cut at every turning point of x and of y, where its speed is smooth, and a line is projected on exactly at any length but zero. Both counterexamples are regression tests, and a new property measures cubics along a line against the distance they travel |

#### Left from the independent QA pass (2026-09-24)

The two findings still open from the outside QA pass over `main` at `d54b2d7` (v1.0.x); its fixes
are in the [record](history/roadmap-1.1-and-1.2.md). The ids in brackets are the report's.

| # | What | Severity | Plan |
|---|---|---|---|
| ☐ **Q15** | (S1) A dimension to a rounded or seam-allowance corner reads less than the piece: a corner anchor on an arc is the arc's middle, and an outward allowance rounds corners the maker never rounded (97 × 67 reads 94.9) | P2 · investigate | Decide what a corner of a rounded outline *means* to a maker before changing it; 4.10b |
| ☐ **Q17** | (S3) The footer and *Page N of M* print 5 mm from the paper edge, inside the margin the code itself calls unreliable | P3 · investigate | Physical prints first (R1), then move it inside the printable area if a printer clips it |

**What the QA pass could not test,** kept here until someone does: physical 1:1 prints on real
printers and viewers, including *Actual size* and `/PrintScaling /None` (R1); whether the footer
survives each printer's bottom dead zone (Q17); taping a multi-sheet piece physically; real OS
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
| ☐ **R1** | The physical print check (7.7) was done, but its readings are not in [`print-verification-log.md`](print-verification-log.md), which still says *pending* on all three platforms | Record one row per platform. Until then the project does not claim verified 1:1 output in writing |
| ✅ **R2** | `develop` was deleted once by merging the `develop` → `main` pull request, and was gone again from 2026-09-26 — so 3.9b–d and the fixes after 1.1.0 went straight into `main` | ✅ Done 2026-09-29. The cause: *Automatically delete head branches* deleted `develop` when a release merged, and the *General* ruleset that should have stopped it named no branch. `develop` is recreated, and each branch has a ruleset: no deletion, no force push, pull requests only with every CI check required — squash merges only into `develop`, bringing a release back included, and merge commits only into `main`, which also requires *Release gate* |
| ☐ **R3** | 1.0.1's release notes list every fix twice, because pull requests into `develop` were merged with merge commits, which release-please reads as well as the commits inside them. 1.2.0's list every feature twice, for the same reason: #23, #25 and #26 went into `main` with merge commits | Squash-merge into `develop` ([`CONTRIBUTING.md`](../CONTRIBUTING.md)), which the ruleset enforces since 2026-09-29; `CHANGELOG.md` is corrected for both; edit the GitHub release notes of 1.0.1 and 1.2.0 by hand |
| ☐ **R4** | Tags read `leathercad-v1.0.1`, not `v1.0.1` | Decide before 1.3 whether to keep the component in the tag; changing it later breaks the link between releases |
| ☐ **R5** | `package.yml` builds Windows and macOS only when packaging could have changed, because a private repository pays for those minutes. The repository is public now, where they are free | Run it on every pull request |
| ☐ **R6** | The renderer loads from `file://`, which keeps the `GrantFileProtocolExtraPrivileges` fuse on | Serve it from a custom `app://` protocol, then turn the fuse off (ADR 0014) |
| ✅ **R7** | Releases went out before their section of the roadmap was done: the roadmap's 1.1 shipped as 1.1.0, 1.1.1 and 1.2.0 with ten of its slices still to do, because a release pull request was merged whenever release-please opened one | ✅ A release is its whole section: `develop` reaches `main` only when every item under *the next release* is ✅, and the *Release gate* check refuses a pull request into `main` from anything but `develop` or release-please, and a section with anything not done left in it ([`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases)) |
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
- **Grain direction** in the model, after which pagination may rotate a part.
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
drag handles for values that are already typed; driving a printer directly — LeatherCAD writes a
PDF and the maker prints it from their own viewer.
