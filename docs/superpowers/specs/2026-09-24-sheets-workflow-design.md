# Design and Sheets: the paper workflow, the window, and the revised 1.0 boundary — design

**Date:** 2026-09-24
**Status:** Built 2026-09-24, in 7.4a, F.8, 7.4b, 7.4c and 7.4d, in that order. Where the build
differs from a first draft it says so beside the point.
**Row:** [the 1.0 boundary](../../roadmap.md), revised by this document ·
supersedes the paper reference in [paper reference and typography](2026-09-18-paper-reference-and-typography.md) §1 ·
builds on [paper and orientation](2026-09-24-paper-and-orientation-design.md) (6.4a) and
[tiling](2026-09-24-tiling-design.md) (7.2a)

---

## 1. Decision

1. **The board stays the maker's design space.** A second view, **Sheets**, shows the same pieces
   exactly as they will be printed: the physical sheets, what is on each one, and where a large
   piece is taped. The board never becomes page-layout space.
2. **One derived sheet plan, computed by the exporter, feeds everything.** The sheet count, the Parts
   list, the Sheets view and the PDF all read it. The preview is the print, by construction.
3. **The window separates the project from the work.** A project bar holds the project and its
   output. A work bar above the board holds the editing context and the Design / Sheets control.
4. **"Sheet" is the one word**, on screen and on paper.
5. **1.0 is redefined by usefulness to a leatherworker**, not by the labels items carried before.
   The sheet workflow moves into 1.0. The rest of 1.1 stays there (§8, §10).

The maker's question this answers, and 1.0's bar:

> I designed my pieces and chose A4 portrait. Before printing, how many sheets will I need, what goes
> on each, where is a large piece joined, and what will the paper look like?

It must be answerable inside LeatherCAD, without exporting a PDF to find out.

## 2. What was wrong

Found in the 2026-09-24 UX pass and checked against the code:

- **The board's arrangement never reaches paper.** `paginate` packs pieces itself: tallest first,
  left to right, 8 mm apart. It ignores board positions entirely. A maker arranging pieces "nicely"
  is doing work the print discards, and nothing says so.
- **Choosing paper changed nothing visible.** Its only effect was on that hidden arrangement, which a
  maker saw only after exporting. The print test needs 3 sheets of A4 portrait (the strap taped
  across two) or 1 sheet of A4 landscape. The app computed that at every export and showed it
  nowhere beforehand.
- **The paper label overstated what prints.** `A4 · 210 × 297 mm` prints at most 190 × 215 mm,
  because of 10 mm margins and the 62 mm verification block on every sheet. On A5 landscape the
  printable area is 190 × 66 mm, and the print test's 100 × 78 mm panel is taped across two sheets.
- **The top of the window had six concerns in one row and no hierarchy:**
  - *app*: the wordmark;
  - *project*: the name;
  - *files*: New, Open and Save, repeating the File menu one row lower;
  - *history*: Undo and Redo;
  - *output*: the paper choice and Export PDF, styled like Open;
  - *tool guidance*: the hint.

  *Draw as* stayed visible for Rotate and Scale. The board column's left edge lined up with the
  header's *New*, so the two rows read as one toolbar. The window title always said "LeatherCAD".
- **Vocabulary drift.** The PDF footer said "Page 2 of 3". The tile label and export notice said
  "sheets".

## 3. The model

### 3.1 Two views of one pattern

| | Design | Sheets |
|---|---|---|
| Answers | How am I designing and relating these pieces? | How will these pieces become paper? |
| Arrangement | The maker's, free, on an endless board | Computed by pagination, never edited |
| Drawn in | Role colours, drafting ground, grid, rulers | Ink on white sheets, no grid, no rulers |
| Tools | All | Select only |
| Persisted | Piece positions are part of the design | Nothing: it is derived |

Moving between the two is light and reversible:
- Each view keeps its own camera. Returning to Design finds it exactly where it was left.
- Selection is shared: a piece selected in one view is selected in the other.
- Nothing about the document changes by switching.

### 3.2 The sheet

A **sheet** is one physical piece of paper of the chosen size and orientation. It has:
- its **paper edge**;
- **margins** of 10 mm, which printers cannot reach reliably;
- the **verification block**: the 100 mm ruler, the 50 mm square and the instruction, whole on every
  sheet (`verificationLayout`);
- the **printable area** left over;
- its **number**, "Sheet 2 of 3", which is also its PDF page number.

A sheet carries either whole pieces, packed, or one **tile** of a piece too large for any single
sheet. A tiled piece is **taped**: its sheets share 10 mm overlap bands, with a join line and
registration crosses in each band.

### 3.3 One sheet plan

```
Project ──evaluate──▶ ResolvedProject ──buildExportScene──▶ ExportScene  (paper-independent)
                                                               │
                                     planSheets(scene, setup)  ▼
                                                           SheetPlan ─┬─▶ sheet count, paper list
                                                                      ├─▶ Parts: "Sheet 1", "Sheets 2–3, taped"
                                                                      ├─▶ joins on oversized pieces (Design)
                                                                      ├─▶ the Sheets view
                                                                      └─▶ exportPdf(plan) ─▶ the PDF
```

- `SheetPlan` is the setup, the scene and `paginate`'s result, plus per-part lookups (which sheets
  a part is on, and whether it is taped). It lives in `packages/export`.
- `exportPdf` takes a plan and writes exactly it. It no longer paginates on its own, so the file
  cannot come from a different computation than the one the maker looked at.
- The plan is **derived**: recomputed from the document, never stored (invariant 4). There is no
  format change.

## 4. The window

```
 File  Edit  View  Help
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ LeatherCAD print test  Unsaved changes [Save] New Open    ▯▯▯ [3 sheets of A4, portrait ▾] [Export PDF] │ project bar
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Undo Redo │ Draw as ▢ Outline ▤ Stitch + allowance …  Drag corner to corner…   [Design|Sheets] │ work bar
├──────┬───────────┬─────────────────────────────────────────────────────────────┬─────────────┤
│ Rail │ Parts     │                           board                             │ Properties  │
└──────┴───────────┴─────────────────────────────────────────────────────────────┴─────────────┘
 window title: "• LeatherCAD print test — LeatherCAD"
```

**Built (F.8), and where it differs from the first draft:**

- **The work bar spans the window**, under the project bar, rather than the board column alone. At
  1280 px the board column is 620 px, and the six *Draw as* chips already fill it (the F.6 test
  holds them on screen at 1200 and 1280 px), so history and the view control could not join them
  there. Spanning the window, it still holds only the editing context, and it keeps its fixed
  height, so the board never moves when the tool changes.
- **The unsaved marker is `• ` on every platform**, from `document.title`, which Electron puts on
  the window. macOS's native edited dot would need a new IPC channel for one platform's
  convention, and the prefix says the same thing everywhere.
- **The Design / Sheets control arrives with the Sheets view (7.4c)**, not before: a control for a
  view that does not exist yet would do nothing.

### 4.1 Project bar: the project and its output

- **The project name is the window's one title**: Plex Sans 600, editable in place, not a field
  styled like a button. The header wordmark goes, because the window title and icon carry the
  product's name.
- **Save state beside it:** "Unsaved changes" with *Save*, or "Saved". The dot on the Save label
  and the status bar's "unsaved" go, so the state is said once, where the project is.
- ***New* and *Open*** stay as quiet buttons in the project zone. They are project management, which
  is this bar's job. The File menu keeps them with their shortcuts.
- **Output, at the right, where the workflow ends:**
  - The **sheet indicator** replaces the paper select and the two orientation buttons. It is one
    native select, and every option states its consequence (§5.1).
  - Its **glyph** is the bar's one expressive element: small sheets at the paper's true
    proportions, one per sheet up to four and then a count, with taped sheets drawn joined.
  - ***Export PDF*** is the single primary action (tan, UI Foundations §5), styled differently from
    everything else in the window.
- **The window title** is `LeatherCAD print test — LeatherCAD`, or `Untitled — LeatherCAD`, with a
  leading `• ` while there is unsaved work, on every platform.

### 4.2 Work bar: the active editing context

It spans the window under the project bar (see *Built* above). It keeps F.1's fixed height, so the
board never jumps.

- ***Undo / Redo*** at its left, naming what they will undo as today. They stay available in both
  views, because a paper change is an undoable edit.
- **The active tool's options:**
  - *Draw as* **only for the drawing tools**: Rectangle, Circle, Arc, Line and Polyline.
  - Hardware shows its punch and fastener.
  - Select, Rotate, Scale, Text and Measure show their one-line guidance in that space instead.
- **The tool's hint**, moved down from the header, follows the options where there is room.
- **Design | Sheets** is a two-button group at the right end. It changes the board, so it lives on
  the editing context's bar. Shortcuts: Ctrl+1 (Design), Ctrl+2 (Sheets). View › Design and View › Sheets in
  the menu.
- In the Sheets view, the options space carries the **plan in words**, e.g. *"3 sheets of A4,
  portrait. Strap is taped across sheets 2 and 3."* It is also the accessible text alternative to
  the drawn sheets.

### 4.3 The two bars differ in kind

The project bar is a title, a status and two actions: it reads as state. The work bar is chips and
tools: it reads as the thing in your hand. Typography and tokens are unchanged: Plex Sans at
400/500/600, the theme's colours, 3 px radii, no shadows. Nothing is added for appearance.

### 4.4 What the window deliberately does not do

- **No custom or merged title bar.** A frameless window on Linux means reimplementing snapping,
  resizing and decorations across GNOME, KDE, tiling window managers and Wayland. That is a
  refinement for later, not a leathercraft problem.
- **No Design / Print stages.** The Sheets view is a view of the same pattern, not a separate
  application the maker enters.

## 5. The paper choice

### 5.1 The indicator says what you will get

The closed indicator reads **"3 sheets of A4, portrait (Strap taped)"**: the chosen entry, which
names what is taped. Its list has every paper and orientation, each worded as its own result:

```
3 sheets of A4, portrait  (Strap taped)
1 sheet of A4, landscape
1 sheet of A3, portrait
…
5 sheets of A5, landscape  (Outer panel and Strap taped)
```

- **One choice is one edit.** Choosing an option sets paper and orientation together, as a single
  undo step labelled *Change paper*. That needs one new command, `setPageSetup`, beside the two
  existing ones.
- **The tooltip gives the physical facts:** *"A4, 210 × 297 mm. Prints up to 190 × 215 mm per sheet:
  the rest is margins and the scale check."*
- **Nothing to print:** with no printable parts, the indicator reads "1 sheet, scale check only".
  That is what the PDF contains, and a blank sheet with the scale check is a useful printer test.

### 5.2 How a change reads, in each view

- **In Design:**
  - the indicator's words and glyph change;
  - Parts' sheet labels change;
  - join lines appear or disappear on oversized pieces.

  The board itself does not move.
- **In Sheets:**
  - the sheets take the new shape, and pieces move to their new places;
  - the selected piece stays highlighted, so the maker can follow it;
  - the work bar sentence states the new plan.
- **Undo** takes it back in one step, in either view.

## 6. The Sheets view

### 6.1 Ink and not-ink

**The rule that keeps the view honest:** anything that will print is drawn as **ink**, in the print
greys from the role table. Anything that will not print is drawn in **screen-only furniture
colours**: theme tokens that never occur on paper. Nothing screen-only can be mistaken for something
that prints.

| Element | How it is drawn | Prints? |
|---|---|---|
| The sheet | White paper with a hairline edge, on the dimmed ground | It *is* the paper |
| Margins | Plain white | No |
| Printable area | A fine outline in furniture colour | No |
| Verification block | Its real contents in ink: ruler, square, instruction. Its reserved band has a faint furniture tint behind it | Yes |
| Footer line | Its real text in ink | Yes |
| Pieces | The export scene's paths and captions in ink, at their placements | Yes |
| Tile joins and crosses | As printed, in their grey | Yes |
| "Sheet 2 of 3" | Above the sheet, outside the paper, in furniture colour | No: the footer carries the printed number |
| Selection | The tan halo | No |

Consequences a maker will notice, all of them true:
- **A hidden feature is absent**, because hidden features do not print.
- **A failed feature is absent**, because the export drops it. The work bar then says *"2 features
  aren't printed: they have problems"*, linking to the Problems drawer, just as the export notice
  does.
- **A part's caption reads as it prints**, e.g. "Pocket — cut 2", not the canvas caption with the
  iron line.

### 6.2 Where the sheets sit

- **Order.** Sheets run in PDF order, left to right, and wrap into rows. The column count comes from
  the number of sheets alone, never from the window size, so resizing never rearranges the paper.
- **A taped piece's sheets form one group**, laid out in their rows × columns grid, with a label
  above: *"Strap, taped across sheets 2–3"*.
  - They are contiguous in PDF order, so the grid and the numbering agree.
  - They are drawn apart, not overlapped. The overlap is visible as the matching bands and crosses
    on neighbouring sheets, as on paper.
- **Gaps between sheets** are wide and clearly not paper.

### 6.3 Zoom

- **Planning, zoomed out:**
  - white sheets on a quiet ground;
  - large sheet numbers, piece silhouettes and piece names;
  - the verification band as a flat tint.

  The questions it answers are how many sheets, what is on each, and which are taped.
- **Checking, zoomed in:** exact ink, including stitch-hole centres, join lines, crosses, the ruler's
  ticks and the caption text.
- **Readable at every zoom.** Sheet labels and group labels stay a constant size on screen, like part
  captions. The existing zoom bands decide which details draw.
- **Framing.**
  - Entering the Sheets view the first time frames all sheets. After that the view keeps its own
    camera until the plan's extent changes, when it frames again.
  - Double-click fits, as in Design.

### 6.4 Interaction

- **Selecting.** Clicking a piece selects its outline, as a click on the board would, so
  Properties shows the part — name, how many to cut, size — and editing a value there updates the
  plan live. Clicking empty paper clears the selection.
- **Other tools.** Choosing any tool other than Select returns to Design with that tool active.
  Nothing is drawn onto sheets.
- **Dragging** does not move a piece: no tool acts on paper, so a left drag pans the sheets, as the
  middle button does. Pressed on a piece, a notice near the pointer says *"LeatherCAD places pieces
  on sheets for you. Choose another paper to change the layout."* It never moves design positions.
- **Pointing.** The status bar's readout names the sheet under the pointer: *"Sheet 2 of 3"*. There
  are no rulers and no coordinates: sheet positions are not something the maker edits.
- **Linking with Parts.** Hovering a part in Parts highlights it on its sheets. Hovering a piece on
  a sheet highlights its row in Parts.
- **No layout controls.** The view has none. The paper choice is its only input.

### 6.5 An empty project

One blank sheet showing its printable area and verification block, with *"Pieces you draw are laid
out on sheets here."* That matches the PDF, which is one scale-check sheet.

## 7. Additions to the Design view

- **Parts shows where each part prints:**
  - *"Sheet 1"*;
  - *"Sheets 2–3, taped"*;
  - *"Not printed"*, with the reason: *It is hidden*, *What is shown has problems*, *It has only
    words, no lines to cut*, or *Nothing is drawn in it*;
  - for a part that prints, what stays off the paper: *"1 hidden feature and 1 feature with a
    problem aren't printed"*.

  This answers "which sheet?" without leaving Design.
- **Oversized pieces show their joins.** A piece too large for the chosen sheet shows its join
  lines in Design, at the plan's model coordinates, in the same dash rhythm as the printed join,
  in the furniture magenta and labelled *Tape join*. The maker sees before printing where the tape
  will go, and whether a join crosses a stitch line or a curve.

## 8. The product pass

Checked before implementation against the maker's path from screen to paper to leather. Each finding
is resolved in the sections above.

1. **Does the Sheets view read as printing, not as another design canvas?** It would have, drawn on
   the drafting ground with the grid, rulers and role colours. Resolved by:
   - white sheets on a dimmed ground;
   - ink versus not-ink (§6.1);
   - no grid and no rulers;
   - the printed captions and footer;
   - no drawing tools.
2. **Large pieces, joins and many sheets?**
   - Taped pieces are grouped in their assembly grid, labelled with their sheet range, and carry the
     printed joins and crosses.
   - Joins are visible in Design too.
   - The sheet layout is independent of the window, so many sheets stay stable (§6.2).
3. **Is the hierarchy useful zoomed out and zoomed in?** Zoomed out answers count, content and
   taping. Zoomed in answers exact ink. Labels stay a constant size on screen (§6.3).
4. **Does a paper change read immediately?**
   - The choice states its consequence before it is made (§5.1).
   - Afterwards it shows in both views, and undoes in one step (§5.2).
   - Two edits for one choice was a trap; `setPageSetup` removes it.
5. **What is still hidden for a leathercrafter?**
   - Hidden and failed features silently not printing: now visible (§6.1), and named in Parts (§7).
   - The blank-project scale-check sheet the count would have denied: fixed (§5.1).
   - *Cut 2* prints one template. The printed caption says so, and printing copies stays deferred.
   - Rotation for paper economy stays off until the model knows the grain. The drag notice doesn't
     offer it.
   - Reprinting a spoiled sheet is now "print page N", because sheet N is PDF page N.
6. **Are we becoming a page-layout application?** No, by rule:
   - the Sheets view has no layout controls;
   - no pinning, rotating or adding sheets;
   - no margin, overlap or per-sheet paper settings;
   - the paper choice is its only input.

   Anything that would add a control to the Sheets view needs its own case.
7. **Is screen → paper → leather clearer?**
   - One word, "sheet", and one number: on screen, in the PDF footer, on the paper.
   - Joins are seen before printing.
   - The verification block is shown as what the maker will measure.
   - The price is one two-button control, which leaves the design untouched.

## 9. The revised 1.0 boundary

**The criterion.** 1.0 contains what a leatherworker needs to go from a blank project to a correct
printed pattern and understand every step: design, **see the sheets before printing**, export, print
at 1:1, verify. An item belongs to 1.0 if that workflow is incomplete, misleading or untrustworthy
without it, whatever it was labelled before. Everything else waits, however cheap it looks. The
scope-freeze rule stays, with this criterion as its test.

**Moved into 1.0:**
- the sheet preview (7.4), as the Sheets view and its supporting slices;
- the parts of 6.4 about the paper's consequences: the sheet count and printable size;
- the header work, as F.8.

**Still 1.0, unchanged:**
- the physical print measurement (7.7), done last so it measures the build that ships;
- release (8.6).

## 10. Slices

Each ends with the app running and something a maker can see.

| Slice | Delivers | Demonstrable |
|---|---|---|
| **F.8** ✅ Project bar and work bar | §4 without the Design / Sheets control: the regrouped bars, the title, the save state, Export PDF as primary, *Draw as* only for drawing tools, the hint in the work bar, the window title | The window reads as project above and work below |
| **7.4a** ✅ How many sheets | `SheetPlan`; `exportPdf(plan)`; `setPageSetup`; the sheet indicator and its list (§5.1); "Sheet N of M" in the PDF footer | Change paper and the count changes. The count equals the PDF's page count |
| **7.4b** ✅ Where each part prints | Parts' sheet labels and "Not printed" reasons (§7); joins on oversized pieces in Design | In Design: "Strap: Sheets 2–3, taped", and its joins |
| **7.4c** ✅ The Sheets view | The Design / Sheets control, shortcuts and menu items; two cameras; the sheets drawn per §6.1–6.3 and §6.5; the plan in words; live reflow | Toggle, see the three sheets, turn the paper, see one |
| **7.4d** ✅ Pointing at sheets | Selection in the Sheets view, shared with Design; hover links with Parts; the sheet readout; tools returning to Design; the drag notice; the maker's end-to-end workflow in E2E | Click the strap on sheet 2, edit it, go back to Design |

Built in the order 7.4a, F.8, 7.4b, 7.4c, 7.4d: the sheet plan first, so every later slice
consumed it. Then **7.7** (the physical measurement) and **8.6** (release).

**Acceptance criteria for all five** (each slice states its own share):
1. The sheet count, Parts' labels, the Sheets view and the PDF agree for every paper and orientation
   on the fixtures. A test binds them to one plan.
2. The board's arrangement is unchanged by anything in this document. Moving a piece on the board
   changes no sheet.
3. Nothing new is persisted. The format version is unchanged. View and camera state are not saved.
4. The verification block's printed output is unchanged: layout, sizes and position. Only the footer
   word changes from "Page" to "Sheet".
5. Every screen-only element uses a furniture token. The theme audit test proves no furniture colour
   is a print grey.
6. Choosing a paper is one undo step.
7. The Sheets view has no control that changes the layout.

**Tests, by layer:**
- **`export`, pure:**
  - `planSheets`: per-part sheet lookups, taped ranges, and "not printed" reasons;
  - the sheet arrangement on screen as a property over sheet counts: no two sheets overlap, taped
    groups keep their grid, and the arrangement doesn't depend on the viewport;
  - `exportPdf(plan)` writes the plan's pages. Its poppler tests keep passing unchanged, except the
    footer word.
- **`document`:** `setPageSetup` in the universal undo/redo arbitrary, with no history for no change.
- **`render`:** the furniture-versus-print audit.
- **Renderer:** the indicator's wording for each paper, "scale check only", and the Parts labels.
- **E2E:**
  - `e2e/sheets.spec.ts` walks the maker's workflow on the print test: read the count, open Sheets,
    find the taped strap on sheet 2 by pointing, select it, drag it (nothing moves), move it on the
    board and shrink the window (no sheet changes), turn the paper, export, and check the PDF's
    page count, page size and that no coloured pixel reached it. The footer's wording is proven
    where it is made, in `sheetInk`;
  - the axe scan covers both bars and the Sheets view's text alternative.
- **Visual:** new baselines for both bars and the Sheets view, each image inspected before commit.

## 11. Deferred, explicitly

| Deferred | Why |
|---|---|
| Pinning or dragging pieces onto sheets | Would make the Sheets view a layout tool. Revisit only with evidence makers need to group pieces or place joins. It would be a format change with a migration |
| Rotating pieces for paper economy | Wrong for leather until grain direction exists (7.2's constraint) |
| Printing *N* copies for *cut N* | A print option with its own questions (mirrored pairs, sheet count). The caption already says "cut N" |
| Grain-aware optimisation, nesting | Needs the grain model; nesting is v2 |
| A slimmer verification block | Changes printed output that 7.7 is about to measure. Revisit with evidence and a new physical test |
| Pieces gliding between Design and Sheets | Shared selection and kept cameras already carry the correspondence. The glide is polish, and it needs a reduced-motion alternative |
| A complete native menu (Draw, zoom, paper) | Only View › Design and View › Sheets are added. The rest is 1.1 |
| Merged or custom title bar; Design / Print stages | §4.4 |
| Printed assembly sheet, edge arrows, overlap setting | 7.2's remainder, 1.1. The Sheets view's grouped grid covers understanding on screen |
| Printing selected sheets only, custom paper, margins | 6.4's export dialog, 1.1 |
| Rulers or coordinates in the Sheets view | Positions on a sheet aren't the maker's to edit |

## 12. Architecture check

| Principle | How it holds |
|---|---|
| Pagination is derived | `SheetPlan` is recomputed from the document on every change and never stored |
| The exporter is the source of truth | `planSheets` lives in `export`. The PDF writes the plan. Every other surface reads it |
| Preview equals print | The Sheets view draws the plan's placements and the PDF writes them. `printing.md` §14's deep-equality test binds them |
| Design stays independent | `paginate` already ignores board positions. Nothing here writes a position |
| Layering (`pnpm depcruise`) | The plan and the sheets' display list are built in `export`, which may import `render` for the display-list types. The app layer calls both. `render` and `editor` import nothing new. No rule changes |
| Millimetres, Y up | The sheet arrangement is in millimetres, Y up, and the flip stays in `worldToScreen`. Nothing in `export` converts between millimetres and pixels. The few screen sizes its builders need — a label's size, a hairline, the outline's rhythm — are `SHEET` tokens in `render`'s theme, so `export` names tokens and holds no pixel numbers. The taped sheets' clip is applied inside `render`, in millimetres (`clipMm`) |
| Only commands mutate | The paper choice dispatches `setPageSetup`. Switching views, cameras and hover are view state in the renderer |
| No view state in the document | Neither the view choice nor either camera is saved |
| Tokens in the theme | Sheet paper, dimmed ground and the furniture colours are new tokens in `packages/render/src/theme/`. The join-line style moves there from the PDF writer, so screen and paper share one dash rhythm. `styles.css` defines none |
| Performance | The export scene is built once per document change, since it is paper-independent. Pagination for the ten options is arithmetic. `export.bench.ts` gains a plan-building case on the benchmark strap, and the view recomputes on committed changes, not per frame |
| Determinism | The plan uses no clock. The footer's date comes from the injected clock, in the view as in the writer |

## 13. What this changes elsewhere

- **`roadmap.md`:**
  - the 1.0 boundary is revised and its working sequence gains F.8 and 7.4a–7.4d;
  - 7.4 moves into 1.0;
  - the two deferred opportunities about paper are superseded.
- **`printing.md`:** §3's on-screen preview is the Sheets view, and §6.2's footer says "Sheet N of
  M".
- **`glossary.md`:** *Sheet*, *Printable area*, *Taped piece*, *Sheet plan*, *Design view*,
  *Sheets view*; *Paginator* now refers to the Sheets view.
- **The paper reference** (2026-09-18 §1) is superseded. F.5 built only its visual language, which
  is not used.
