# Tile a part larger than the sheet (slice 7.2a) — design

**Date:** 2026-09-24
**Status:** Proposed with the slice's pull request.
**Row:** [the 1.0 boundary](../../roadmap.md), item 5 ·
[pre-1.0 audit](2026-09-23-pre-1.0-product-audit.md) §6.1 · `docs/printing.md` §5.2, §7

---

## 1. The gap

Pagination (7.1) packs whole parts onto sheets. A part larger than the sheet's printable area was
**reported and left out**: never scaled and never clipped, but not printed either. A notebook cover,
a tote panel or a long strap could not be printed at all. Choosing a larger paper (6.4a) helps only
while the part fits some paper a desktop printer takes.

## 2. What is built

**A part too large for the chosen sheet is printed across several sheets at 1:1, to be taped
together.** Parts that fit are still packed whole, first, exactly as before. Each tiled part follows
on its own sheets.

### 2.1 The grid (pure, in `paginate`)

The tiled region is the part's bounds plus the room above it for its printed name. Everything uses
the sheet's printable area (`contentAreaMm`, which already keeps the verification block clear) and
an overlap `o` of **10 mm**:

```
step    = content − o                       (per axis)
columns = max(1, ceil((W − o) / (contentW − o)))
rows    = max(1, ceil((H − o) / (contentH − o)))
```

- The grid is **centred** on the region, so its spare width falls evenly on both sides rather than
  all at the right and bottom (`printing.md` §5.2).
- Tiles are numbered row by row from the top left: R1 C1, R1 C2, and so on.
- Each tile is a **window**: a rectangle in the part's own coordinates, exactly the size of the
  printable area, placed on the sheet by a translation only. **No scale appears anywhere**, as with
  every other page.
- Neighbouring windows share a 10 mm band, so both sheets carry the pattern there.
- **Nothing rotates.** Rotating a part to save sheets would change which way the leather's grain
  runs on the pattern (roadmap 7.2's recorded constraint).

### 2.2 On each tiled sheet (the PDF writer)

- **The part, clipped to the window.** The clip is a rectangle in the content stream. Every path is
  still written in full, at 1:1, and the viewer crops it.
- **Join lines**, one down the middle of each overlap band this sheet shares with a neighbour. They
  are drawn at the same model coordinate on both sheets.
- **Registration crosses** on each join line:
  - at the middle of the window's span;
  - where two join lines cross (a corner shared by four sheets).

  Being at the same model coordinates, they land on the same leather on every sheet that shows them.
- **How to assemble:** cut one sheet along a join line, lay it over its neighbour, and put the
  crosses on the crosses. The 10 mm band is the tolerance.
- **The verification block, whole, on every sheet**, from `verificationLayout` as on every other page
  (6.4a).
- **A tile label** in the footer, left of the square:
  - line 1: `Strap · R1 C2 · 1 × 3 sheets`. The part name is shortened with "…" if it would reach
    the square.
  - line 2, how to assemble: *Cut on a dashed line, lay it over the next sheet, match the crosses.*

  Both positions are part of `verificationLayout`, so the layout test checks them on every sheet.
- Join lines and crosses are **page furniture**, like the ruler: grey, dashed and thin, so they can't
  be mistaken for the black cut line. They exist only on paper, so they aren't design roles, and the
  screen-versus-paper audit doesn't cover them.

### 2.3 Telling the maker

- The export no longer shows a tiled part as an error in the status bar. The file is complete.
- The export notice gains a section, **Printed across sheets**, naming each tiled part:
  - its sheet count and grid;
  - the one-line assembly instruction;
  - when the part fits whole on another paper (the chosen paper turned first, as in 6.4a), that
    paper: *It fits whole on A4 landscape*.

## 3. Not in this slice (1.1, roadmap 7.2)

- Edge arrows naming each neighbour, and an assembly sheet with a thumbnail of the whole grid.
- A print preview (7.4).
- A setting for the overlap.
- Rotating parts, which is ruled out until the model knows the grain (7.2's constraint).
- Tiling several small parts together: they keep packing whole.

## 4. Acceptance criteria

1. A part larger than the printable area is printed, at 1:1, across `rows × columns` sheets. None of
   it is missing: every point of the region lies in some window.
2. Neighbouring windows overlap by exactly 10 mm. The join line sits in the middle of that band, at
   the same model coordinate on both sheets.
3. Parts that fit are still packed whole, and come first.
4. Every tiled sheet carries the whole verification block, and the tile label and note, none of
   which overlap one another or the pattern.
5. Measured on paper through poppler: a strap's two halves, laid together on their join line,
   measure its true length.
6. The maker is told what was tiled and how to assemble it, and which paper would hold it whole.

## 5. Tests

- `paginate.test.ts`:
  - the grid for known sizes;
  - properties over random part sizes and every sheet: the windows cover the region, neighbours
    overlap by exactly `o`, every window is the printable area's size, and the grid is centred;
  - join lines are shared by neighbours;
  - packed parts come first.
- `verification.test.ts`: the tile label and note are added to the no-overlap and inside-the-margins
  property over all ten sheets.
- `writer.test.ts` (poppler):
  - a 250 mm strap on A4 portrait makes two sheets;
  - the strap's line on each sheet, measured to its join line, adds up to 250 mm;
  - the verification square measures 50 mm on both sheets.
- `e2e/paper.spec.ts`: the strap exported on A4 portrait makes a two-page PDF, and the notice names
  the tiled part and suggests A4 landscape. Turning the paper gives one page again.
