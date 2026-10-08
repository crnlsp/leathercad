<!--
  The UI/UX final audit's requirements, as delivered on 2026-10-08, kept word for word below the
  rule so that tasks and commits can cite their stable ids (R-01 … R-16). The images it names are
  in 2026-10-08-ui-refinement-mockups/. The plan that turns it into slices U.1 … U.19 is
  docs/superpowers/plans/2026-10-08-ui-refinement.md, which also answers §7's questions from the
  code. Do not edit the requirements to match what was built: record differences in the plan.
-->

**Status:** final, from the UI/UX audit · **Received:** 2026-10-08 · **Mockups:**
[`2026-10-08-ui-refinement-mockups/`](2026-10-08-ui-refinement-mockups/) · **Plan:**
[`../plans/2026-10-08-ui-refinement.md`](../plans/2026-10-08-ui-refinement.md) · **Roadmap:** 1.5

> Requirement ids are `R-01` … `R-16`, with a hyphen and two digits. They are not the roadmap's
> release-engineering items `R1` … `R7`.

---

# LeatherCAD UI refinement: final requirements

LeatherCAD is an Electron desktop app (Linux, Windows, macOS) for leathercraft patterns that print at exact 1:1 scale. This is a **refinement pass, not a redesign**: keep the layout, the look and the wording, and change only what is listed here.

**How to use this file:** read all of it, then read the codebase. Map each requirement to the code that owns it, and plan the tasks yourself; the phases are a suggested order. Requirement IDs (`R-..`) are stable, so tasks and commits can cite them. The images named in brackets show the target. They are mockups, not pixel specs: where an image and this text disagree, the text wins.

**Images:** `01-design-view` · `02-stitch-holes-selected` · `03-drawing` · `04-sheets` · `05-window-1024` · `06-my-tools` · `07-zoom-levels` · `08-top-bar` · `09-parts-tree` · `10-panel-collapse` · `11-properties-actions` · `12-zoom-control` · `13-inline-values` · `14-stitch-summary` · `15-legend` · `16-tooltip` · `17-option-hints`

---

## 1. Ground rules (every task)

- **Printed output must not change.** The model stays in millimetres. Everything added on screen (fills, labels, chips, the selection bar) never prints.
- **Keep:**
  - the layout: rail | Parts | canvas (options row above, Problems drawer below) | Properties
  - Design and Sheets as separate views
  - the rail's icon + name + key, grouped Draw / Place / Modify
  - the dark shell around the cream drafting ground, with a mm grid, rulers and Y up
  - the right-click menu, the Print dialog, the Problems drawer, the empty-window guidance, and disabled controls that say why
- **Wording:** sentence case and the app's own words: Outline, Stitch line, Stitch holes, Fold, Cut-out, Marking, Hardware, Seam allowance. *Pitch* is the iron's nominal spacing; *Spacing* is what the fit achieved. Labels stay short and allow 30 % longer translations. No words inside icons, and no uppercase with letter-spacing.
- **Style:** IBM Plex Sans 400/500/600 only; a 4 px spacing rhythm; radii of 3 px, 5 px and pill; only dialogs cast a shadow; motion of 120 ms or less, on colour only. Never gradients, blur, textures, emoji, large radii or dashboard cards.
- **Sizes:** desktop only, from 1920 down to the 860 × 600 minimum.

## 2. Platform and accessibility (every task)

- **Keyboard:** every action works from the keyboard. `:focus-visible` shows a solid 2 px ring: `accent` on the shell, `accent-ground` on the canvas. No keyboard traps.
- **Shortcuts:**
  - Use `CmdOrCtrl`, shown as `⌘` on macOS.
  - Bind by physical key (`KeyboardEvent.code`) so that `[`, `]`, `\` and `Shift+1` work on every layout; show the local character.
  - Every shortcut is listed and rebindable in Settings › Keyboard shortcuts.
- **Contrast:** WCAG 2.2 AA. Text 4.5:1; marks, borders and focus rings 3:1. Severity always shows as a colour **and** a glyph.
- **Names and announcements:** every icon-only control has an accessible name and a tooltip with its key. Changes in status (the problem count, the save state) are announced politely, once.
- **Targets:** at least 24 × 24 px.
- **OS settings:** honour reduced motion. In high-contrast mode (`forced-colors`), give two-tone buttons, the mode switch and chips real borders.
- **Title bar:** if the window is frameless, keep the OS window controls clear and make the empty parts of the top bar a drag region (double-click maximises).
- **Unsaved state:** also set the window's edited flag (macOS: the dot in the close button).

## 3. Tokens: add or change only these

| Token | Value | Use |
| --- | --- | --- |
| `piece-fill` / `piece-fill-selected` | #FAF8F4 / #F7F1DE | Flat fill inside piece outlines on screen; the selected piece |
| `canvas-label` | #5E5950 | Secondary canvas text, 6.0:1 on the ground (replaces the light grey) |
| `primary` | #46B46B → **#F1EEE8** | Print's main half, in the paper colour. Green is retired from actions: it reads as the fold colour |
| `primary-side` | #D2CBBD | Print's status half when there is nothing to fix |
| `secondary-side` | #3A3F47 | Export PDF's menu half (its main half is `shell-3`) |
| `on-primary` | #14161A | Text and glyphs on both halves of Print; AA on `primary`, `primary-side`, `warning` and `error` |
| `canvas-name` · `canvas-meta` · `canvas-value` | 12/16 600 · 12/16 400 · 12/16 500 | Caption name · caption detail · dimension values and chips |
| `canvas-text-min` | 12px | Smallest canvas text on screen, at any zoom |
| `outline-stroke` | 1.5px | Cut lines on screen (grid lines stay at 1 px) |
| `rail-wide` / `rail-narrow` | 152 / 56 px | The rail with and without names |
| `parts-width` / `properties-width` | 224 / 264 px | Docked panels (Properties was 288) |
| `panel-strip` · `row-height` | 40px · 28px | A folded panel · a Parts row (was 34) |

**Rules:**
- `text-muted` is for disabled controls and placeholders only.
- Never put `text-dim` on `shell-3`.
- Grid colours keep their values; only where they are drawn changes (R-02).
- `sheets-desk` #D6D1C7, `paper` #FFFFFF and `sheet-margin` #D9579B are recorded from the current build, unchanged.

## 4. Requirements

### Phase 1: quick wins

**R-01 Readable canvas text** `[07, 01]` — M
- Piece captions and dimension values draw at a fixed screen size at every zoom, never under 12 px.
  - Name in `canvas-name` and `ink`; detail in `canvas-meta` and `canvas-label`; values in `canvas-value` and `geo-measure`.
- Each has a 4 px `ground` halo. The printed caption keeps its true size.
- Below 40 % zoom a caption shows the name only. When a piece's top is off screen, its caption pins to the canvas's top-left.
- Captions read "Card pocket ×2" over "52 holes · 3.85 mm" (was "Card pocket — cut 2").

**R-02 Pieces read as pieces** `[07, 01]` — S
- Fill each piece with `piece-fill`, or `piece-fill-selected` when selected. The grid is not drawn inside pieces.
- Draw the 1 mm grid only from 6 px/mm (160 %) and the 10 mm grid from 1.5 px/mm.
- Cut lines are 1.5 px; grid lines are 1 px.

**R-03 Zoom control** `[12]` — S
- At the canvas's bottom-right, inset 16 px: − · zoom % · + · Fit. 100 % means true size on screen; use a calibrated "actual size" if the app has one.
- The percentage opens a menu: Fit drawing, Fit selection, True size, 50 / 200 / 400 %.
- Keys: `Ctrl+=`, `Ctrl+−`, `Shift+1` fit, `Shift+2` fit selection, `Ctrl+0` true size.
- Double-click on empty canvas still fits, and the Fit tooltip says so.

**R-04 Collapsible panels and focus mode** `[10, 05]` — M
- Each panel header has a toggle. `[` toggles Parts and `]` toggles Properties.
- `\` is focus mode: both panels hide and the rail shows keys only. Leaving focus mode restores the previous state.
- A folded panel is a 40 px strip with icons only, no rotated text:
  - Parts shows one thumbnail per piece; a click selects that piece.
  - Properties shows the selection's icon, with a tooltip naming the selection.
- From a strip, a panel opens as a non-modal overlay. It takes focus, gives it back on close, and closes on `Esc` or a click on the canvas.
- The status bar always has three chips: Parts `[`, Focus `\`, Properties `]`. A hidden panel's chip has the accent border. **Nothing may become unreachable.**
- Follow the responsive table in §5, and remember the person's own choices.

**R-05 Properties: order and weight** `[02, 11]` — S
- For a hole set, from top to bottom:
  1. Iron, Pitch, Fit, Corners
  2. Holes, Spacing and Runs as 17/22 readouts
  3. One line comparing spacing with the pitch, with a glyph ("Spacing matches the pitch")
  4. Name, Follows
  5. Arrange
  6. Delete
- **Arrange:** Flip ↔ ↕ and Mirror ↔ ↕ as icon pairs with tooltips, plus "Across fold" with its label. Keep the existing disabled reasons.
- **Delete** sits alone in a footer under a rule: red, with its glyph and the `Del` key cap. Deleting is undoable.
- For a feature, the line under the title names the piece and its Cut: "Outer · Cut ×1 › Stitch line › Stitch holes". Name and Cut fields show only when the piece or its outline is selected.
- Field labels are 68 px wide, so values like "A hole on each corner" fit.

**R-06 Top bar in three zones** `[08]` — S
- **Left:**
  - The project menu and the name are one control. A long name truncates with an ellipsis, and its tooltip shows the full name.
  - Then the save state. Saved: a check, "Saved", and Save disabled with the tooltip "Nothing to save". Unsaved: an open dot, "Unsaved changes", and Save enabled with its key cap.
- **Centre:** Design | Sheets as a pill switch on a dark track.
  - Icons: a pen nib for Design; stacked sheets plus the sheet count ("2") for Sheets.
  - The active tab is raised, with an accent outline and an accent icon.
  - It is a tab list: arrow keys move between tabs, and `Ctrl+1` / `Ctrl+2` switch directly.
  - At 860 px it shows the icons and the count only.
  - It moves here from the options row.
- **Right:** a quiet paper button, "2 × A4 portrait". It opens a popover: Paper, Portrait/Landscape, the sheet count and the locked scale, and "See the sheets". Then two **two-tone split buttons**, with no icons on their main halves and no borders. Each half is its own button with its own accessible name.
  - **Export PDF:** the main half (`shell-3`) exports with the last settings (`Ctrl+E`). The narrow half (`secondary-side`) holds the chevron and opens the export menu.
  - **Print**, the only primary button: the main half is `primary` with "Print" in `on-primary` (`Ctrl+P`). The narrow half is the **problems indicator**:
    - nothing to fix: a check on `primary-side`
    - warnings: △ and the count on `warning`
    - errors: the error glyph and the count on `error`; errors outrank warnings, and the tooltip lists both

    A click on the indicator opens the Problems drawer. Print stays enabled; the Print dialog lists the problems first.
  - Hover lightens the main half. Focus draws the ring around the whole button.
- **Far right:** a hairline, then Settings (`Ctrl+,`) and Help (`F1`) as quiet icon buttons.
- **At 1024 px:** "2 × A4", "Unsaved", and Save without its key cap.
- **At 860 px:** the paper button shows "2" and the save state shows only its dot. Both split buttons keep their labels.

### Phase 2: panels, lists and small fixes

**R-07 Parts tree** `[09, 01]` — M
- Pieces fold open and closed: a chevron, a 24 × 16 outline thumbnail, the name, and a `×N` pill when Cut is more than 1.
- Features indent under what they follow (Outline › Stitch line › Stitch holes), joined by thin elbows. Rows are 28 px, and hole counts show at the right.
- Lock and eye show on hover or keyboard focus. When they are on (hidden, locked), they stay visible; the mirror mark always shows.
- Every row action is also on the right-click menu.
- Remove "Sheet N, turned" from the Design view.
- Keys: Up and Down move; Right opens a piece; Left closes it or goes to its parent; Space toggles visibility; F2 renames.
- Selecting on the canvas opens the piece and scrolls its row into view.

**R-08 Sheets view has its own panels** `[04]` — M
- **Rail:** Select, Turn, Measure, and the note "Drawing tools are in Design · Ctrl+1".
- **Parts:** pieces grouped by sheet ("Sheet 1 of 2 · 2 pieces"), each with a turned mark, plus a "Taped across sheets" list.
- **Properties:** Paper, Orientation, Sheets and Scale 100 % (locked); then the selected piece's sheet, placement and fit; then the reminder to measure the 100 × 5 mm box.
- Sheet labels and screen-only piece captions are readable ("Outer, turned 90°"). The printed sheets are unchanged.

**R-09 Legend** `[15]` — S
- It sits at the canvas's bottom-left, open with names by default; "Name the marks…" now defaults to on.
- It folds to a chip, and the choice is remembered. At 1024 px and narrower, or below 720 px tall, it starts folded.

**R-10 Tooltips** `[16]` — S
- One line up to 360 px, then wrap at that width, never narrower.
- They flip and shift to stay 8 px inside the window; this fixes the thin-column bug at the right edge.
- They show after 500 ms of hover and at once on keyboard focus. Keys show as caps.

**R-11 Options-row hints** `[17]` — S
- 3–5 short hints with key caps, written per tool and state.
- The lowest-ranked hints drop first as the row narrows; "? all keys" never drops.
- The row holds Undo/Redo, the tool's options and the hints.

### Phase 3: the craft workflow

**R-12 Value chips beside the selected shape** `[02, 05, 13]` — L
- A selected outline shows four chips on dimension lines, all at 12 px:
  - width, on the side away from the caption
  - height, at the right
  - corner radius, by the corner
  - stitch margin, across the margin
- To edit, click a chip or press `Enter`. The chip shows a caret and the unit. `Tab` / `Shift+Tab` move through W → H → corner → margin, but only while a chip is open. `Enter` applies; `Esc` reverts.
- Chips accept arithmetic (`95-2*3.5`) and other units (`3.75in`); the result shows in mm.
- A value that can't apply keeps the chip open and says why, with a glyph: "Corner is larger than half the height (30.0). Enter uses 30.0."
- No drag handles for typed values.

**R-13 Typing while drawing** `[03, 13]` — M
- While drawing a rectangle, the live "65.5 × 46.8 mm" readout becomes the chips. Typing `105` `Tab` `75` `Tab` `8` `Enter` makes a 105 × 75 mm outline with 8 mm corners. Dragging first and typing after still works.
- A hint under the shape: Tab next · Enter makes it · Esc cancels. Properties mirrors Width, Height and Corner.

**R-14 Selection bar: stitch summary and next step** `[14, 02, 05]` — M
- A small bar on the shell (`shell-1`, border, 5 px radius), anchored under the selection's bounds and below its dimension line. It flips above when there is no room below. It never covers the selected piece, and it hides while dragging.
- **Line 1:** holes · spacing against pitch · runs · Cut ×N. A check glyph when spacing equals pitch; a warning glyph and words ("stretched 1.8 %") when it doesn't.
- **Line 2:** Next: Stitch line › Stitch holes › Seam allowance.
  - Done steps show a check.
  - The first undone step is a button that runs it with the My tools defaults.
  - Later steps are plain text.
- `F6` moves focus to the bar from the canvas. It can be turned off in Settings › Appearance.
- Hole matching and thread length are **not built now**. Show no placeholder, but leave room for a third line.

**R-15 Settings › My tools** `[06]` — M
- A new settings page: the maker's irons (name, pitch, one default). The Iron menu on a hole set lists them.
- Defaults for new pieces: stitch margin (e.g. 3.5 mm) and leather thickness, which folds use when their own thickness is not set.

**R-16 Drawing defaults in Properties** `[03]` — S
- While drawing, an "After the outline" section shows the stitch margin and the iron from My tools. "Stitch + allowance" and the Next steps use them.

## 5. Responsive

| Window | Rail | Parts | Properties | Canvas, today → target |
| --- | --- | --- | --- | --- |
| 1920 | names, 152 | docked 224 | docked 264 | 1260 → 1280 |
| 1440 | names, 152 | docked 224 | docked 264 | 780 → 800 (focus mode 1384) |
| 1280 | names, 152 | docked 224 | docked 264 | 620 → 640 |
| 1024 | keys, 56 | docked 208 | **strip 40** (overlay on `]`) | ~490 → 720 |
| 860 | keys, 56 | overlay | overlay | 804 → 804 |

Space is given up in this order as the window narrows:
1. The rail drops its names (below 1280).
2. Properties folds to a strip (below 1280; **was below 1024**).
3. Parts becomes an overlay (below 900).

At 600 px tall, Properties scrolls with Delete fixed at its foot.

## 6. Keys (defaults; bind by physical key, all rebindable)

`[` Parts · `]` Properties · `\` focus mode · `Ctrl+=` / `Ctrl+−` zoom · `Shift+1` fit · `Shift+2` fit selection · `Ctrl+0` true size · `Ctrl+1` / `Ctrl+2` Design / Sheets · `Ctrl+S` save · `Ctrl+E` export PDF · `Ctrl+P` print · `Ctrl+,` Settings · `F1` Help · `F6` selection bar. In Parts: `Space` visibility, `F2` rename. On a selected shape: `Enter` edits its sizes. `Ctrl` means `⌘` on macOS. The one-letter tool keys (V R C A L P H X M N T S) keep working on the canvas.

## 7. Out of scope, and open questions

**Out of scope:** new drawing features, 3D, cloud, accounts, AI assistants, an onboarding wizard, a rebrand, and any change to printed output.

**Check in the code before building:**
1. Do the new keys clash with existing shortcuts (`Ctrl+E` especially)?
2. Is the window frameless? (This affects §2's title bar rule.)
3. Can a piece be turned by hand on Sheets? If not, drop the Turn button and keep "Turned 90°" as a read-out.
4. Should empty Properties show job totals (pieces, holes to punch, sheets)? They are optional.
5. The mockups use stand-in icons; keep the app's own. Keep the existing dialog shadow.
