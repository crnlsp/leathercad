# Roadmap 1.6 — the record

> **Archive.** Everything that shipped in 1.6.0 (2026-11-02), moved here from
> [`docs/roadmap.md`](../roadmap.md) word for word, with what each item found; only its links were
> changed, to reach the files from this folder, and its heading, which said *the next release*. It
> is not updated any more. It carried update discovery (8.9), several projects in one window and
> templates (8.11–8.14), 3.10, 3.12, 4.10b, 4.14, 6.4, 7.2 and 7.5, the whole performance backlog
> (PERF-001 to PERF-017), the findings Q4, Q15, Q31 and Q33 (and Q35, Q36 and Q38 to Q40, added at the end on 2026-11-03),
> the macOS findings #194 and #195, and the release engineering R6. R8 and R10, level-3 items collected from makers, and the decision not
> to sign the installers stay in [`docs/roadmap.md`](../roadmap.md#collected-from-makers-and-decided).
> The record before it is [`roadmap-1.5.md`](roadmap-1.5.md).

## 1.6 — after the refinement

**After the refinement.** What 1.3 did not finish and 1.4 does not take moved here on 2026-10-07, when 1.4 was split
([1.3.5's record](roadmap-1.3.5.md) says why): word for word, but for 8.9, which now reads the one tag
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
  **Done** (2026-10-20), as [ADR 0020](../adr/0020-update-discovery.md): the check runs only when
  the maker asks for it, never as the app starts, by the maintainer's decision (2026-10-23):
  *Check now* in Settings › Updates, or the version at the status bar's left, whose tooltip says
  what it found; a spinner turns while it asks. Answered, the version becomes a chip — a sage tick,
  or a tan arrow and the new number — and Settings › Updates a card with the same glyph; neither
  asks again for five minutes, though a failed check may. The Settings button opens on Updates
  while its mark shows. `SECURITY.md` says why
  the app makes the request and what it carries. No test asks GitHub: `LEATHERCAD_RELEASES_URL`
  points the check at a server of the test's own, or at nothing.

Several projects in one window (2026-10-23). On Linux and Windows a second launch — a `.lcp`
double-clicked while the app runs — started a second process: both wrote `preferences.json`, the
last one winning, and the same project could be open and saved in both. The maintainer chose one
instance, with a project per tab like Notepad's, the tabs on a strip of their own above the project
bar under the system's title bar (variant A; a strip in a frameless title bar stays decided against
by the [sheets workflow design](../superpowers/specs/2026-09-24-sheets-workflow-design.md) §4.4).

- ✅ **8.11 One instance.** A second launch — a `.lcp` double-clicked while the app runs, or the
  Start menu — hands its command line to the running app and ends, before it writes anything. The
  window comes forward, restored if minimised, and opens the project the line names in a tab of its
  own, beside any unsaved work (8.12), as macOS's `open-file` does too; a launch naming no project
  only brings the window forward. The lock is the
  configuration directory's, so the end-to-end tests, each with its own, still run side by side.
  **Done** (2026-10-23).
- ✅ **8.12 Project tabs.** A tab per project on a strip above the project bar, drawn as drawing
  sheets: square, the open one outlined and running into the bar below it. A tab says its
  project's name — its file's for a project with none of its own, *Untitled*, *Untitled 2*… for new
  ones — with a dot where its close button is while it has unsaved work. Each keeps its own
  document, history, selection, view, camera and file; the window's title is the active tab's, and
  macOS's edited dot is lit while any tab has unsaved work.

  The Project menu is an icon at the strip's left, and *+* after the tabs is a menu of a new
  project, *Open…* and the recent projects. Every way a project opens — New, Open, a recent one, a
  template, a launch, a second launch, a `.lcp` dropped on the window — opens it in a tab; one
  already open goes to its tab, which bounces, and an untouched *Untitled* is replaced. *Rename…*
  turns the active tab's name into a field and renames a saved project's file with it, never over
  another file, and Undo and Redo of it rename the file back; a project first saved without a name
  is named after its file. A tab's right-click menu renames, saves, saves as a template, reloads
  from disk, duplicates, shows in the folder, copies the path, moves the file to the Trash (asked
  first) and closes it or the others. A file another program changes, moves or deletes is said over
  the board, with *Reload*, *Keep mine* or *Save it again*.

  Closing a tab with unsaved work asks; closing the last leaves the app open on a start screen —
  new, from a template, open, and the recent projects, pinned or taken off the list one at a time,
  with Settings and Help at the strip's end — which is also where the app starts when the last
  session left no tabs. Closing the window asks about one unsaved project, or once about several:
  *Save all*, *Don't save*, *Cancel*. The tabs come back at the next start, each on its view, place
  and zoom (`session` in `preferences.json`); with *Keep unsaved projects when closing* on in
  Settings › General the window closes without asking, and unsaved projects come back unsaved.

  Ctrl+Page Down and Up go round the tabs, Ctrl+Shift+Page Down and Up move one, Ctrl+W closes one
  and Ctrl+Shift+T opens the project last closed again, all through the keymap — never the digits,
  which Design and Sheets have. Tabs drag along the strip, a middle click closes one, the wheel
  scrolls a strip too full to show them all and *All tabs* lists them. A `tablist` with arrow keys,
  clean under axe. One file dialog at a time. Save looks the same with nothing to save, and is only
  inert. **Done** (2026-10-23).
- ✅ **8.13 A recovery copy per tab.** Each tab with unsaved work keeps its own copy,
  `<pid>-<start>-<tab>.lcp`, written while it is in front or not; saving, reloading or closing the
  tab clears it, and a save while a copy is being written clears that one too. After a crash every
  copy is offered in turn, each into a tab of its own. Copies from 1.5, one per session, are still
  found. **Done** (2026-10-23).
- ✅ **8.14 New from a template.** *New project* is two: *from scratch*, still Ctrl+N, and *from
  template…*. The templates that ship are the sample wallet, a card holder, a key fob and a
  coaster, each built from the app's own commands and clean; the sample has no other way in since,
  and *Open sample project* is gone from Help, the empty Parts panel and the start screen. A
  project from a template opens untitled, unchanged and with an id of its own, so Save asks where
  and the template is never written. *Save as template…*, in the Project menu and a tab's menu,
  saves any project as one of the maker's, never over another of the same name unless asked.

  The picker is a browser: a search over names, descriptions and tags; *Show* (all, built-in,
  mine) and *Sort* (name either way, recently
  used, newest, oldest — by when last changed), the app's own menus, kept between openings; the
  pinned first, in a well of their own that folds away (kept between openings), then the rest,
  both in the order chosen; the
  chosen template drawn large with its facts, *Edit template* (or, for a built-in one, *Duplicate as
  my template*) beside its name and the rest as a row of icons under it, held above the scroll;
  a row pins from the list too. The maker's own are described and tagged through
  *Edit details…* — read until then, saved when asked, not on leaving a field — pinned, renamed, duplicated, edited as a project whose Save writes
  the template, exported, shown in the file manager and removed, with *Undo* for a few seconds; a
  `.lcp` is imported as one (`templates/` beside `preferences.json`). **Done** (2026-10-23).

8.11–8.14 were **done** on 2026-10-23, together, with `pnpm check` and `pnpm test:e2e` green on
Linux; on Windows and macOS they wait for [`release-checklist.md`](../release-checklist.md) §11 and §15
with the packaged app.

### Drawing and editing

- ✅ **3.10 Guides, alignment and distribution.** Persisted horizontal, vertical and diagonal
  guides, placed from the rulers, the Guides tool (a click, or a drag through two points) or
  Properties, and parallel to another guide at a typed distance; snapping, exact editing,
  deletion and undo. Multi-selection alignment and equal-gap distribution move whole pieces and explain
  refusals. Guides stay off paper; format 10 keeps them on reopen.
  [Design and acceptance criteria](../superpowers/specs/2026-10-23-guides-alignment.md).
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
  the rule every drawn path already follows ([geometry](../geometry.md) §4.2 rule 2) — so a stitch line
  round one reports that it cannot follow it (`OFFSET_UNSUPPORTED`) until 9.19; the note beside the
  button says so before the maker converts. No format change: a drawn path was already stored.
  [Domain model §4.8](../domain-model.md#48-converting-a-shape-to-a-drawn-path--built-312).
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
  between its extension lines now, since its line is no longer one stroke. A number with no room
  between the extension lines goes outside, past the arrowhead at the far end and clear of it,
  decided from the number's real width and the arrowheads' real length in each medium, never a
  fixed threshold; the line is then drawn whole. No format change for the drawing itself. [Domain model §3.7](../domain-model.md#37-measurement--linear-built-410a),
  [printing](../printing.md).
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
  [Domain model §3.6a](../domain-model.md#36a-holerow--built-414).

### Output

- ✅ **6.4 The rest of the export dialog.** Presets, layers and bounds. Printing only some sheets is
  the Print Preview's since 7.6.
  `paperOptionsFitting` already answers "what would fit", so the dialog reports rather than
  computes.
  **Done** (2026-10-28): *Export SVG…* and *Export DXF…* open a dialog first. Its intents are rows
  of one table — *Template print* (every layer), *Laser cut* (`cut` and `hardware`) and *Stitch
  guide* (`stitch` and `stitch-holes`) — and each chooses layer roles, which the maker can then tick
  or untick: *Laser cut* with *Stitch holes* is the "if lasered" of the domain model. The filter is
  in `buildExportScene`, once, so no writer has one; a part's box and caption follow what is left,
  and a laser cut has no caption. The dialog reports the page the file will have — the box of what
  the chosen layers draw — and says so, and greys *Export…*, when nothing is left. The choice is an
  application preference, `exportRoles`, shared by both formats, remembered across restarts and
  never in the project; the default, every layer, writes the bytes it wrote before. Bounds is the
  whole drawing as arranged on the board: exporting only some parts, and a paper-fit line, are not
  offered, and the PDF takes no preset (its scene is the sheet plan's, shared with the Sheets view).
  Property tests over every set of roles: only those roles, every item of them unchanged, a part's
  box that of what it holds. The print test exported as a laser cut holds one layer, `cut`, as an
  SVG and as a DXF. [Printing §10](../printing.md#10-svg-export-62).
- ✅ **7.2 Taped parts, finished.** Edge arrows and a printed assembly sheet. A taped part is never
  turned: since 7.8 a part is taped only when it fits whole neither way.
  **Done** (2026-10-27): every edge a taped sheet shares carries an arrow at its join, pointing at
  it and naming the sheet beyond — `Sheet 3`, the number the strip's *joins sheet 3 to the right*
  gives. An arrow is the join's grey and solid, so it is never read as a cut line; it stops 2 mm
  short of the join on its own side, so cutting on the line leaves it whole, faces its neighbour's
  arrow across it, and keeps clear of the registration cross. A part taped into a grid — more than
  one row and more than one column — then gets an assembly sheet, just before its tiles: its tiles
  as a map — each tile's share of the part a cell, the cells meeting at the joins, named with their
  sheets, over the part's outline in grey — headed *Not to scale: a map of how the sheets join.
  Never cut from it.* A strip gets none: its arrows say it all, and a map would waste a sheet, so
  the print test still prints three sheets and the sample on A5 portrait five. The map is the one
  reduced drawing on paper, and it keeps the rule against scaling to fit: the pattern stays at 1:1
  on its tiles, and the map is a picture of the sheets, as printing §7 planned. It is a sheet of the
  plan, so the count, Parts (*Sheets 2–7 · map on sheet 1*), the Sheets view (*Assembly map of
  Gusset*), the Print Preview and the PDF all number it; packing does not count it, so what is
  turned or taped is as 7.8 decides. It belongs to its part: the Print Preview leaves it out with
  the last of the part's sheets and puts it back with the first. Arrows and map are drawn by
  `sheetInk`, so the Sheets view shows what the PDF prints. Property tests: arrows on exactly the
  edges with a neighbour, naming its sheet, one facing pair per join, square to it and short of it,
  clear of every cross, and inside the clip on every paper; one map per grid and none for a strip,
  just before its tiles; the map has a cell per tile named with the plan's sheet, laid as the sheets
  lie, without overlap, reduced alike both ways and never mirrored, and its words fit the narrowest
  sheet. Tape guides are left. Not measured on paper yet.
  [Printing §7](../printing.md#7-registration-and-assembly-aids).
- ✅ **7.5 Calibration.** Per-printer correction factors, with a ±2 % guard. The verification
  gauge already shows when a printer is off.
  **Done** (2026-10-28): the Print Preview has *Calibrate this printer…* under the printer chosen
  there. It prints a calibration page to that printer, uncorrected and with the job every print
  gets: a horizontal line across the paper and a vertical line along it, ticked every 10 mm, each
  the longest the margins take in whole centimetres up to 200 mm — 190 × 200 mm on A4, since
  200 mm does not fit across 210. The maker enters what the lines measure, and the correction —
  drawn over measured on each axis, exactly — is stored against the printer's CUPS name in
  `printers.json` in the configuration directory, never in the `.lcp`. A reading more than 2 % off
  on either axis is refused with printing §8.2's sentence about print settings; the main process,
  the file's reader and the PDF writer refuse one too. From then on Print writes that printer's PDF
  with one scale first on each page, on the paper's axes and about its middle, and the preview
  shows those bytes; Print waits until the printer's correction is known. A corrected sheet says
  `corrected for its printer: x 1.0050, y 0.9988` where it says `1:1` otherwise, because in its own
  units it is no longer 1:1. *Export PDF*, the Sheets view and *Save PDF…* — offered only where the
  app cannot print, so with no printer — never carry one. *Remove correction* goes back to
  `{1, 1}`, which writes the same bytes as before 7.5. Property tests: the correction is exactly
  drawn ÷ measured; the guard holds at its edge; every length on paper is the drawn one times its
  paper axis's factor, a landscape sheet's width taking `y`; a printer's ratio times its correction
  gives the drawn length back; `{1, 1}` changes no byte on any paper in either form. Through
  poppler, a 1.005 correction prints 0.5 % larger and the calibration page's lines measure their
  lengths; an end-to-end test calibrates the fake CUPS printer and measures its next print's gauge.
  Not measured on paper yet: no real printer has been calibrated with it.
  [Printing §8.2](../printing.md#82-correction--opt-in-per-printer-a-last-resort).

### Performance

The whole [performance backlog](../performance-backlog.md), **PERF-001 to PERF-017** from the
2026-10-25 audit, is in 1.6 by the maintainer's decision (2026-10-28): the release waits for all
of it. The backlog owns each task's evidence, acceptance and
[order](../performance-backlog.md#recommended-implementation-order); the marks here mirror its
[register](../performance-backlog.md#task-register), and a task's pull request ticks both. How the
work is done — measured on current `develop`, before and after, a guard against coming back, one
pull request each, accuracy never traded, every platform retested — is
[`.claude/rules/performance.md`](../../.claude/rules/performance.md).

- ✅ **[PERF-001](../performance-backlog.md#perf-001)** Share export geometry across history revisions.
- ✅ **[PERF-002](../performance-backlog.md#perf-002)** Reduce tiled PDF duplication and blocking.
- ✅ **[PERF-003](../performance-backlog.md#perf-003)** Cull Sheets pages and separate interaction decoration.
- ✅ **[PERF-004](../performance-backlog.md#perf-004)** Avoid full snap-index rebuilds during complex edits.
- ✅ **[PERF-005](../performance-backlog.md#perf-005)** Reuse geometry diagnostics for unaffected inputs.
- ✅ **[PERF-006](../performance-backlog.md#perf-006)** Reduce self-intersection candidate pairs.
- ✅ **[PERF-007](../performance-backlog.md#perf-007)** Isolate pointer-driven React updates.
- ✅ **[PERF-008](../performance-backlog.md#perf-008)** Reuse Design content and cull off-screen geometry.
- ✅ **[PERF-009](../performance-backlog.md#perf-009)** Keep persistence work off the interaction path.
- ✅ **[PERF-010](../performance-backlog.md#perf-010)** Release previous-project view/tool caches.
- ✅ **[PERF-011](../performance-backlog.md#perf-011)** Resize backing stores on DPI-only changes; emulated transitions guarded, physical mixed-DPI release verification remains open.
- ✅ **[PERF-012](../performance-backlog.md#perf-012)** Preflight excessive allocation/work requests.
- ✅ **[PERF-013](../performance-backlog.md#perf-013)** Bound thumbnail work and cancel obsolete PDF loading.
- ✅ **[PERF-014](../performance-backlog.md#perf-014)** Schedule canvas frames only when needed.
- ✅ **[PERF-015](../performance-backlog.md#perf-015)** Avoid repeated deep dependency walks.
- ✅ **[PERF-016](../performance-backlog.md#perf-016)** Prune obsolete collapsed-part IDs.
- ✅ **[PERF-017](../performance-backlog.md#perf-017)** Make benchmarks representative and interpretable.

### Known issues and findings

Everything found along the way that is not fixed yet, with where it was found. The ones marked
**bug** come first.

| # | What | Where it was found | Plan |
|---|---|---|---|
| ✅ **[#194](https://github.com/crnlsp/leathercad/issues/194)** | **bug** · Shift+F10 opened no context menu on macOS although the shortcut was advertised | First macOS E2E probe | The app hears the fixed shortcut through the keymap on every platform and dispatches one keyboard `contextmenu` PointerEvent through the existing board, Parts, tab and field handlers. It prevents the browser default to avoid duplicate menus on Linux/Windows; mouse and accessibility events keep their native route. Four macOS skips removed; regressions cover absent browser defaults, tab ownership and one event per key |
| ✅ **[#195](https://github.com/crnlsp/leathercad/issues/195)** | The PDF responsiveness test failed on macOS: a frame gap over its 200 ms bound while the 5.8 m strap was exported | First macOS E2E probe | ✅ Explained (2026-11-02): the export never froze the window. In ten cold runs every gap over the bound came before the click — the cold window's first frame — or after the writer's answer, as macOS's compositor first presented the notice; from the click to the answer the longest was 50 ms. The test now watches only that, with the same bound, and checks that the worker wrote the file; 10/10 on `macos-latest`. [Performance backlog, PERF-002](../performance-backlog.md#perf-002) |
| ✅ **Q33** | **bug** · A hardware hole is checked by its centre alone. `OUTSIDE_PART` and `HOLE_TOO_CLOSE_TO_EDGE` read a hardware hole's centre (`holePoints` in `validate.ts`) and never its radius, so a 6 mm hole centred 2 mm inside the edge cuts 1 mm through it and nothing is said, and a 4 mm rivet hole whose rim crosses the edge is only *too close* | The product roadmap refresh (2026-10-17), reading the rules for hardware clearance | ✅ Fixed (2026-10-25): a hardware hole is its circle. It is off the material when an edge — the outline's or a cut-out's — passes nearer its centre than its radius, which is exact rather than sampled, and too close when its rim is under 1.5 mm from one. A rim within a storage quantum of an edge is on it, as a line's end is (Q2). The clearance stays the stitch hole's 1.5 mm, measured from the rim: what tears is the same strip of leather between a cut and an edge, whatever made the cut, and hardware that pulls harder is 9.23's footprint question, not a second figure now. A stitch hole stays a point. Property tests over centre and radius: the verdict matches the exact rim clearance on a square panel, a rim leaving a round part is always off, and shrinking a hole never finds a new problem. The two sentences now say *leave the material* and *a hole needs* |
| ✅ **Q4** | Problems have no stable identity across edits. The panel keys by content today, so nothing breaks yet | UI audit, deferred opportunities | ✅ Fixed (2026-10-27): `problemKey` already existed but named only code and subject, so two problems of one code on one feature (a feature's `PARAMETER_INVALID` for different parameters, `SOURCE_FAILED` for different sources, `OUTSIDE_PART` for holes and for a line) could share a key. It now adds the id or parameter name that tells them apart — never a coordinate, a measured value, a name or a list position — and the Problems panel keys rows by it alone, no longer by the part too, so a feature moved to another part keeps its row. Property tests: unchanged by translating the part and by an unrelated feature appearing, unique within a result, different for a different feature. 9.16 can store it |
| ✅ **Q31** | What resizing a piece should do. Scale acts on what is selected, so an outline scaled alone leaves its slots where they were, and a whole piece scaled evenly grows its rivet holes and labels with it — a 4 mm rivet hole becomes 6 mm. The stitch margin and the iron's pitch already stay | Q30 | ✅ Fixed (2026-10-28): Scale takes the whole piece, as Move, Rotate and Flip do (`pieceScope`): an outline, or a part picked by its heading, scales all of it about the outline's centre, hidden features included, and a lock or anything that cannot take the scale refuses it whole. Positions scale; what is made to a size keeps it and only moves (`keepsItsSize`): a hardware hole keeps its diameter, a label its text size, a logo placement the size of its stamp, and a cut-out typed as a rectangle or circle — a card slot, a hole for a snap — its width, height and radius. A cut-out drawn as a path is drawing and scales, and *Convert to path* is how a typed one joins it. Rows of holes re-derive along their scaled line at the same pitch and diameter; stitching keeps its margin and pitch as before; a dimension re-reads its ends. So a stretched piece keeps its rivet round instead of refusing, and a turned outline still refuses a stretch (`WOULD_SHEAR`). A diagonal mirror, captured or fold-tracked, refuses an uneven scale its axis cannot follow (`MIRROR_WOULD_SCALE`); an even scale carries its fixed-size slot to the right centre. A rivet or slot picked alone still scales alone, and a typed width is still a reshape of the outline alone. `WHOLE_PART_NOT_SCALED` is gone. Property tests over the scale: every hole's diameter is unchanged, each kept thing's centre goes where the scale sends it, drawn geometry scales by the factor, k then 1/k gives the piece back within the storage quantum, and a lock anywhere refuses the whole scale; an end-to-end test grows a piece by its outline and reads its rivet and slot sizes |

#### Left from the independent QA pass (2026-09-24)

The finding still open from the outside QA pass over `main` at `d54b2d7` (v1.0.x). Its fixes are
in the [record](roadmap-1.1-and-1.2.md) and, for Q17, in 1.4's 7.8. The id in brackets is
the report's.

| # | What | Severity | Plan |
|---|---|---|---|
| ✅ **Q15** | (S1) A dimension to a rounded or seam-allowance corner reads less than the piece: a corner anchor on an arc is the arc's middle, and an outward allowance rounds corners the maker never rounded (97 × 67 reads 94.9) | P2 · investigate | ✅ Settled (2026-10-26): a corner and the piece's size are two measurements, and a dimension never silently changes which it is. A dimension between corners reads what it always did — between the middles of the roundings, 94.1 on a 97 × 67 panel rounded at 5 mm. *Add overall size*, on a selected outline, dimensions its width and height between corners of the box its actual outline fills, read from the outline's exact bounds: the 97 × 67 panel and the band a 3.5 mm allowance grows round a 90 × 60 stitch line both read 97 × 67. Not the virtual sharp, which no two edges have past a half turn and which runs off the piece near one. Format 12, an `extent` end; identity migration and `fixtures/format/v12.lcp`. With it, a rectangle keeps its four corner anchors at every radius, rounded to a circle too — they were read off its path, which lost them once a rounding took a whole side |

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
[performance audit](../performance-backlog.md#measurement-record) recorded user-visible problems
with history retention, complex outlines and tiled output. Its tasks are in this release, under
[Performance](#performance), since 2026-10-28.

### Release engineering

| # | What | Plan |
|---|---|---|
| ✅ **R6** | The built renderer loads from `app://leathercad`, and `GrantFileProtocolExtraPrivileges` is off | The protocol serves only bundled renderer files, checks decoded paths and real targets, and preserves CSP and sandboxing. Packaged tests cover the origin, denied paths, fonts, PDF preview worker and measured PDF export; a packaged app ignores the development URL override. [ADR 0014](../adr/0014-electron-builder-and-release-please.md#r6-amendment--a-bundled-app-origin-2026-10-23) |
| — **R8** | R1's other platforms: no platform but Linux has a full A–H row in [`print-verification-log.md`](../print-verification-log.md) | **A level-3 item, collected from makers** (2026-10-31). It was monitored by decision on 2026-10-18: moved out of 1.5 unverified, as it had moved out of 1.3.5's R1 on 2026-10-09. The maintainer measures prints on Arch only, so a row for another platform comes from a maker with that system and a printer, through the print-report form (until the form exists, an issue with the readings A–H): through *Print* on macOS, and on Windows from the default viewer at *Actual size*. Until one arrives the log says neither platform is verified. It never holds a release; to make one wait, the maintainer would have to mark it planned, which is a decision of its own ([`release-checklist.md`](../release-checklist.md), *What a failure holds, by level*) |
| — **R10** | U.7's window edited flag is unverified on macOS, the one platform that shows it: it was checked on Linux, where Electron ignores it, and through the test host and a mock of `setDocumentEdited` | **A level-3 item, collected from makers** (2026-10-31). It was monitored by decision on 2026-10-18: moved out of 1.5 unverified, since no Mac is at hand. A maker with a Mac reports it through the print-report form (until the form exists, an issue): check 12 of [`release-checklist.md`](../release-checklist.md) on a real Mac, with the packaged dmg: an edit sets the window's edited dot, *Save* clears it. Tick this only then, saying the macOS version and the date — never from Linux, the test host or a mock. Check 13, ⌘A outside a field ([#97](https://github.com/crnlsp/leathercad/issues/97)), fits the same session |
| — | Code signing | **Not done, by decision** (2026-09-24). LeatherCAD is free and open source and signing costs money every year, so installers ship unsigned; [`getting-started.md`](../getting-started.md) says how to open them and how to check a download against its build provenance. If it is ever wanted, electron-builder signs when `CSC_LINK` is set |

### Found by the post-1.5 stabilization, shipped in 1.6.0

Moved here on 2026-11-03, word for word but for Q39's heading, which had run into Q38's text. These
were fixed before 1.6.0 and shipped in it (its changelog lists #149, #150, #157, #159 and #164),
but were left under the roadmap's *Later* when this record was made. Q37 is not fixed and stays in
the roadmap.

- ✅ **Q35 A save is not flushed to disk before it replaces the file.** `writeFileAtomic`
  (`apps/desktop/src/main/atomicWrite.ts`) renamed a temporary file into place without `fsync`ing
  it or its folder, so a power cut just after a save could leave an empty `.lcp` on some file
  systems; the rename also replaced a symlink with a plain file and reset the file's permissions.
  **Done (2026-10-26):** the temporary file is flushed before the rename and the folder after it
  (not on Windows, which cannot open a folder to flush it; a file system that refuses with
  `EINVAL`/`ENOTSUP` is the only error let go). A symlink is resolved first, so the target is
  replaced and the link stays, even a link to a file not there yet; the file keeps its permission
  bits. On any failure the previous file is untouched, the scrap is removed and the error reaches
  the caller. *Export template to a file* used `copyFile` over the maker's file and now goes through
  the same write.
- ✅ **Q36 Ctrl+S during a drag saves the drag's preview,** not the document before it
  (`useProjectFile.ts`); the crash-recovery copy already waits for the gesture to end.
  **Done (2026-10-26):** `DocumentStore.committedDocument` is the document without a gesture under
  way — what the drag began from. *Save*, *Save As* (and so the save before closing or switching),
  *Save as template* and the copy kept when the window closes all write it, and a tab saved
  mid-drag is saved as of that document, so it is unsaved once the drag commits and clean if it is
  cancelled. An *Untitled* project being named by its first save still ends the drag, as any
  command does.
- ✅ **Q38 Local epsilons,** which invariant 7 forbids: `glide.ts`, `mat2x3.ts`, `segment/types.ts`,
  `arc.ts` and `flatten.ts`'s step counts, `polynomial.ts`, `export/sheetsDisplay.ts` and
  `persist/schema.ts`; and `arc.ts`'s `toCubics` checks a radius against `EPS_ANGLE`. Each moves
  numbers on the geometry or export path, so they want one change with property tests and a lint
  rule for `e-N` literals outside `core`. Fixed (2026-10-26): every tolerance is one from
  `core/epsilon.ts`, which gains `EPS_RATIO` for dimensionless quantities and the root finders'
  five; an ESLint rule refuses an `e-N` literal outside `core` and the tests, and the four that
  are not tolerances say so where they stand. Two bugs of the same kind went with them. `toCubics`
  judges a degenerate arc by its length, so a long arc with a tiny sweep keeps its end; and
  point-in-path judged a seam in `t` and radians while its rays move in millimetres, so the centre
  of any circle over 1000 mm in radius read as outside. Moved: the glide axis snaps within
  `EPS_ANGLE` of a half turn (was 1e-12), Sheets view joins merge within `EPS_POINT` (was 1e-6), a
  cubic's ray crossing is near-tangent below `EPS_POINT` (was 1e-9), the path measure's table
  spacing is floored at `EPS_LENGTH` (was 1e-6), and the scale tool's grab is on the pivot within
  `EPS_POINT` (was 1e-6). No snapshot or golden file changed.
  Follow-up fixed (2026-10-28): `solveCubic` resolved every root only to the rounding of the
  largest, so a t³ term of rounding noise on a circle 2 m out turned a tangent touch into a false
  crossing, and two close roots beside a far one were lost; it now keeps only the largest root and
  divides it out, finding the rest as a quadratic.
- ✅ **Q39 A tool under way is not reset when a project opens** — only an open drag is rolled back,
  so a polyline half drawn continues into the new project. Fixed (2026-10-28): opening, a template,
  a recent project and a tab switch already made the board again — `CanvasHost` is keyed by the tab
  — so its tools started idle; the one route that kept them was *Reload from disk*, which replaces
  the tab's document in place. `DocumentStore.reset` now tells `onReset` listeners, and the board
  answers with `ToolManager.cancel()`: the active tool gives up what it had half done, as Escape
  does, and stays selected. The e2e tests open a project over a half-drawn polyline and reload one.
- ✅ **Q40 `export.bench.ts` times the render package's SVG backend,** not the `exportSvg` and DXF
  writers that ship; fixing it moves the committed baseline. Fixed (2026-10-26): *write the SVG*
  and *write the DXF* time `exportSvg` and `exportDxf` on the benchmark strap, through the
  package's index as the app calls them. The shipped SVG writer takes 2.1 ms where the old case's
  baseline read 0.37 ms; `bench/svg.json` is re-recorded and `bench/dxf.json` is new, and only
  compare on the machine that recorded them ([PERF-017](../performance-backlog.md#perf-017)).
