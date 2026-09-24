# Choose the paper (slice 6.4a) — design

**Date:** 2026-09-24
**Status:** Proposed with the slice's pull request.
**Row:** [the 1.0 boundary](../../roadmap.md), item 3 ·
builds on 5.5, [page setup and determinism](2026-09-18-page-setup-and-determinism-decisions.md)

---

## 1. The gap

5.5 put `paper` and `orientation` into `ProjectSettings` (format version 9) and made the PDF export
read them through `pageSetupFor`, the one conversion point. But nothing could change them, so every
export was still A4 portrait. A strap too long for A4 was reported with *"It fits A4 landscape"*, a
paper the maker had no way to choose. A maker with Letter in the printer got an A4 sheet, which is
where a print dialog offers "fit to page".

## 2. What is built

- **Two commands**, `setPaper(name)` and `setOrientation(orientation)`, in `packages/document`.
  *(Replaced in 7.4a by one, `setPageSetup(paper, orientation)`: one choice, one undo step.)*
  - They are ordinary edits: undoable (*Change paper*, *Turn the paper*), they make the project
    unsaved, and they are saved with it and carried into a recovery copy.
  - Choosing what is already chosen returns the same document, so it earns no history and doesn't
    make a clean project unsaved.
  - Every other setting is kept, including one a newer build wrote (5.2's policy).
- **A paper control in the header**, between *Save* and *Export PDF*, the button it affects:
  - a paper-size list (A5, A4, A3, Letter, Legal, each with its size in mm);
  - a portrait / landscape pair.

  It edits the project's settings, so there is no second paper setting to disagree with the export.
  The *Export PDF* tooltip names the paper it will print on.
- **The oversized message names the chosen paper and suggests turning it first.** *"Strap" is 250.0
  × 100.0 mm and will not fit Letter portrait at 1:1. It fits Letter landscape.* Before, it said
  "the current paper", and it suggested the first fit in list order: A4 landscape, which a printer
  loaded with Letter doesn't have. The rest of the suggestions keep the `PAPER_SIZES` order.

No format change: the fields and the v8→v9 migration shipped in 5.5.

## 3. A finding fixed on the way: the square was missing on A5 portrait

The PDF verification block placed its 50 mm square at a fixed 112 mm right of the ruler, and **skipped
the square** where that ran off the sheet. That is A5 portrait (148 mm wide). The page still said
*"Measure the 100 mm ruler or the 50 mm square"*. It went unnoticed while every export was A4, and
choosing the paper made it one click away. The fix:

- `verificationLayout(setup)` in `packages/export/src/paper.ts` is the **one layout** of the block.
  The PDF writer draws from it, and `contentAreaMm` reserves space from it, so the drawing and the
  reservation can't disagree.
- Where the square fits beside the ruler (every sheet at least 182 mm wide), nothing moves. On a
  narrower sheet the square stacks above the ruler at the right margin, clear of the text, and the
  block reserves 8 mm more. A5 portrait's printable area is 128 × 120 mm.
- A test over all ten sheets checks that every piece of the block is inside the margins, that no two
  overlap, and that the pattern area starts at least 4 mm above the block. A poppler raster test
  measures the square at 50 mm on every sheet, where the layout says it is.

## 4. Not in this slice

- **The rest of the export dialog (6.4)**, which is 1.1: presets, layers, bounds.
- SVG and DXF export, print preview (7.4), calibration factors (7.5), custom paper sizes, A2 and
  Tabloid.
- **A part too large for every paper** is still reported, never scaled. Printing it is tiling, 7.2a.
- **An on-canvas paper outline** (the "paper reference" proposal). The screen and the PDF stay
  consistent because both read the one stored setting. The canvas doesn't draw the sheet.
  *Superseded 2026-09-24: the Sheets view (7.4c) shows the real sheets. See
  [Design and Sheets](2026-09-24-sheets-workflow-design.md).*

## 5. Acceptance criteria

1. A new project is A4 portrait, and the control says so.
2. Choosing a paper or orientation changes the exported PDF's sheet to exactly that size (MediaBox,
   read by `pdfinfo`), at 1:1 and never scaled.
3. The choice is unsaved work, is undone and redone like any edit, and survives save and reopen.
4. A part too large for the chosen paper is named, together with the chosen paper and the fit to
   try first: the same paper turned, when that fits.
5. The verification square and ruler are whole on every paper and orientation, and never covered by
   the pattern.

## 6. Tests

- `packages/document/src/store.test.ts`:
  - the two commands, their labels, and no history for no change;
  - unknown settings kept;
  - both commands added to the universal undo/redo arbitrary.
- `packages/export/src/verification.test.ts`: the layout property over all ten sheets, and A4 is
  unchanged.
- `packages/export/src/pdf/writer.test.ts`: the square measured at 50 mm through poppler on every
  sheet.
- `packages/export/src/paginate.test.ts`: the message names the paper, and prefers turning it.
- `e2e/paper.spec.ts` walks the maker's workflow:
  - a strap that doesn't fit A4 portrait;
  - turned to landscape and exported again;
  - Letter;
  - undo and redo;
  - saved, *New*, and reopened.
