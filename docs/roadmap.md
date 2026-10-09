# Roadmap

**Released:** v1.3.5 (2026-10-09) · **Next:** 1.5, then 1.6 · **Last updated:** 2026-10-09

What comes next, and everything known that is not done yet. What already shipped is in
[`CHANGELOG.md`](../CHANGELOG.md). The full record of how 1.0 was built — every slice from 0.1 to
8.6, with what each found — is kept in [`history/roadmap-to-1.0.md`](history/roadmap-to-1.0.md),
what shipped in 1.1.0 to 1.2.0 in [`history/roadmap-1.1-and-1.2.md`](history/roadmap-1.1-and-1.2.md),
what shipped in 1.3.0 in [`history/roadmap-1.3.md`](history/roadmap-1.3.md), and what shipped in
1.3.5 in [`history/roadmap-1.3.5.md`](history/roadmap-1.3.5.md).

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
| **M5** | Print a wallet pattern and measure 100.0 mm with a steel rule | ✅ Measured by the maintainer, and on Linux recorded in [`print-verification-log.md`](print-verification-log.md) (**R1**, 2026-10-09) |

1.0 shipped on Linux, Windows and macOS, unsigned by decision (see *Release engineering*).

---

## 1.5 — the next release

**The window, refined.** The UI/UX final audit's requirements, received 2026-10-08: a refinement pass, not a redesign. The
layout, the look and the words stay, and **printed output does not change**. The theme is *a maker
gets more done at the bench*: the pattern reads at every zoom, the board gets the room, sizes are
typed where the eye already is, and the next step is one click away.
[Requirements](superpowers/specs/2026-10-08-ui-refinement-requirements.md) (R-01 to R-16) and
[mockups](superpowers/specs/2026-10-08-ui-refinement-mockups/); [the
plan](superpowers/plans/2026-10-08-ui-refinement.md) holds each slice's whole task, the answers to
the requirements' open questions, and what reading the code turned up. One pull request per slice,
in this order: U.1 first, and the plan's §0 says why. U.1 to U.3 shipped in 1.3.5, and 1.5 begins at U.4. R-10 and the keys move up into Phase 1 as
U.3, because the controls after them show keys; R-15 leads Phase 3, because R-14 and R-16 read it.

### Phase 1 — the canvas, the keys and the frame

- ✅ **U.4 A zoom control, and true size** (R-03). − · % · + · Fit at the canvas's bottom-right;
  *Fit drawing* `Shift+1`, *Fit selection* `Shift+2`, *True size* `Ctrl+0` — which fits today.
  ✅ Built as described, on Design and on Sheets. Measured in the app: at *True size* a 100 mm
  panel is 378 CSS px across on a 1× and a 2× display (377.95 by the arithmetic). `Ctrl+0` means
  true size now, and fitting moved to `Shift+1`, matched by place, so a German `!` or a French `1`
  fits. *Fit selection* is refused, with its reason, when nothing selected is drawn, and on Sheets.
  100 % is the CSS reference pixel, 96 to the inch, one constant a screen calibration would
  replace. Found on the way, and fixed: the status sent the Design camera's scale even on Sheets,
  and only when the pointer moved — after `Ctrl+=` it still said 124.5 % for a board at 155.6 %,
  and on Sheets the board's zoom for paper at 27.6 % — so the zoom is now read off whichever camera
  is painted; Fit framed hidden features, which it does not draw; choosing from a menu by keyboard
  dropped focus to the page, and now gives it back to the button; `getting-started.md` said a
  German keyboard zooms from the key right of 0, which U.3's review had changed. Printed output did
  not move: no export test, golden fixture or format fixture changed.
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

### Known issues and findings

| # | What | Where it was found | Plan |
|---|---|---|---|
| ☐ **Q27** | `pnpm docs:media` fails where `/tmp` is its own filesystem (`renameSync` across devices, `EXDEV`), and never loads the window while it records video — on `develop` as well. So the README's pictures still show the bar before 8.7, and `print.png` the verification block before 7.8 | 8.7, retaking the README pictures | Copy instead of rename; find why recording stops the window loading; then retake all four on a machine with ffmpeg, gifsicle and pngquant |

### Release engineering

| # | What | Plan |
|---|---|---|
| ☐ **R8** | R1's other platforms: no platform but Linux has a full A–H row in [`print-verification-log.md`](print-verification-log.md) | Record a row through *Print* on macOS, and on Windows from the default viewer at *Actual size*. Moved here from 1.3.5's R1 on 2026-10-09 |

### Decisions this release needs

Each has a recommended default in the plan, which its slice takes unless the maintainer decides
otherwise.

| Slice | Question | Recommended |
|---|---|---|
| U.3 | On a French or German keyboard, does a tool key follow its letter or its position? | Its letter: R stays R. Punctuation and digits keep their position, shown as the local character — but zoom's + and −, named by their symbols, follow what the key types (decided on review) |
| U.7 | If the project's name joins the Project menu's button, how is a project renamed? | Whichever of *Rename…* in the menu or F2 on the name fits what renaming does today |
| U.9 | Measure on the Sheets view, where no tool acts today? | Left out, and added to *Later* |
| U.10 | Every saved preferences file says the legend is closed, chosen or not | Preferences version 2 opens it once |
| U.13 | A default leather thickness "used by folds whose own is not set" | Written into each new fold; evaluation never reads a preference |
| U.16 | Where a typed rectangle goes before any corner is clicked | At the pointer |

---

## 1.6 — after the refinement

What 1.3 did not finish and 1.4 does not take moved here on 2026-10-07, when 1.4 was split
([1.3.5's record](history/roadmap-1.3.5.md) says why): word for word, but for 8.9, which now reads the one tag
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
