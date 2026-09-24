# Export and Printing

**Packages:** `packages/export`, `packages/print`
**Status:** Design — no implementation yet
**Last updated:** 2026-09-03

---

## 1. The requirement

A line the user drew as 100.0 mm must measure 100.0 mm on paper, verified with a steel rule.

Everything in this document exists to make that true and, just as importantly, to make it
*checkable* — because the failure mode is silent. A pattern printed at 97 % looks completely normal
until leather has been cut from it.

Accuracy budget:

| Stage | Budget | How it is enforced |
|---|---|---|
| Model → export scene | 0 mm | Exact; no transform applied |
| Curve flattening | ≤ 0.005 mm | Tolerance constant, asserted in tests |
| mm → PDF points | ≤ 1e-9 mm | Exact rational factor, double precision |
| PDF → paper | printer-dependent | Verification square + calibration correction |

The first three are the software's responsibility and are tested automatically. The fourth is the
printer's, and the job of the software is to make any error *visible* rather than to hide it.

## 2. The one rule: never print through the browser

`window.print()`, CSS `@page`, and the Chromium print dialog all sit between the model and the paper
and all of them can scale. "Fit to printable area" is on by default in most print paths and will
silently shrink output by 3–6 % to accommodate the printer's unprintable margin. That single default
is the most likely way this project fails.

**The application generates print-ready PDFs itself, as vector content, with exact coordinates.** It
then either hands the file to the system print queue with scaling explicitly disabled, or saves it
for the user to print from a viewer at "Actual size".

This is also why the choice of Electron over Tauri is not a printing decision: the webview is never
in the print path.

## 3. Pipeline

```
  ResolvedProject
        │  buildExportScene(project, options)
        ▼
  ExportScene            styled geometry in mm, page-independent, Y-up
        │
        ├──────────────────────────────────────────────┐
        │  paginate(scene, pageSetup)                  │  (no pagination)
        ▼                                              ▼
  Page[]                                         single-surface export
        │                                              │
        ├──▶ PdfWriter    ──▶ tiled PDF                ├──▶ SvgWriter ──▶ .svg
        ├──▶ SvgWriter    ──▶ one .svg per page        ├──▶ PdfWriter ──▶ single-page .pdf
        └──▶ Canvas2D     ──▶ on-screen print preview  └──▶ DxfWriter ──▶ .dxf   (v1.1)
```

Two properties this buys, and they are the reason for the shape:

- **The print preview and the printed PDF call the same `paginate()`.** They cannot disagree about
  page count, tile placement, or overlap, because a disagreement would be a bug in one function
  rather than a mismatch between two implementations.
- **All writers consume the same `ExportScene`.** SVG, PDF, and DXF cannot drift apart in what they
  include or where they place it.

`packages/export` and `packages/print` import nothing from `editor` or `ui`, so the whole pipeline
runs headless — from tests, and from the CLI.

## 4. `ExportScene`

```ts
interface ExportScene {                // built (slice 6.1); text built in 4.11a
  projectName: string;
  parts: ExportPart[];                 // the paginator places whole parts (slice 7.1)
}

interface ExportPart {
  id: PartId;
  name: string;                        // the caption, generated: "Card holder — cut 2"
  quantity: number;
  paths: ExportPath[];                 // stitch holes included, as true-size circles
  texts: ExportText[];                 // built 4.11a: the part's caption
  boundsMm: Rect;                      // in the part's own coordinates
}

interface ExportPath {
  role: LayerRole;
  path: Path;
  style: PrintStyle;
}

// Laid out once by packages/typography and written as filled glyph outlines.
// No font is embedded in any export (ADR 0011).
interface ExportText {                 // built 4.11a
  role: LayerRole;
  source: string;                      // the string itself, for tests and diagnostics
  glyphs: readonly Path[];             // filled outlines, in millimetres
  sizeMm: Mm;
}

interface PrintStyle {
  widthMm: Mm;                         // TRUE millimetres, not screen pixels
  dashMm: readonly number[];           // empty is solid
  grey: number;                        // 0 is black, 1 is white; printed templates are black
}
```

Two things worth stating explicitly:

**Stroke widths are true millimetres here**, unlike on screen where construction lines are
screen-constant. A cut line printed at 0.2 mm is 0.2 mm on paper at any zoom. The default set:
cut 0.25 mm, stitch 0.15 mm dashed 2-2, fold 0.15 mm dash-dot, mark 0.10 mm, annotation 0.10 mm.
They come from the role table in `packages/render/src/theme/`, which the canvas reads too: **the dash
rhythm on screen is the one on paper**, in true millimetres, and an audit test in `packages/export`
fails if the two ever differ (F.4).

**Which items are included is an export preset**, resolved from layer roles
([domain-model.md](domain-model.md) §5) — "template print", "laser cut", "stitch guide". The user
chooses an intent; the preset chooses the roles.

**Text on paper is outlines, not a font.** Every string printed — part captions, measurement values,
text labels, the footer, the verification labels — is laid out once in millimetres and written as
filled glyph paths from the vendored typeface. Nothing then depends on a viewer's or a cutter
program's font handling. It also retires pdf-lib's standard Helvetica, which cannot encode Polish
letters such as `ł` and `ę`: with it, exporting a part named "Przegroda główna" throws. The on-screen
canvas draws the same layout with the font itself. See
[ADR 0011](adr/0011-one-vendored-typeface-outlined-on-paper.md).

## 5. Pagination

Pure, fully unit-testable, no I/O. The highest-value function in the print package.

```ts
interface PageSetup {
  paper: PaperSize;                       // named or custom
  orientation: 'portrait' | 'landscape';
  marginsMm: { top: number; right: number; bottom: number; left: number };
  overlapMm: number;                      // default 10
  mode: 'tiled' | 'fit-single-page';
  registration: RegistrationOptions;
  scaleCorrection?: { x: number; y: number };   // see §8
}

function paginate(scene: ExportScene, setup: PageSetup): Page[];

interface Page {
  row: number; column: number;            // 1-based
  label: string;                          // "R1C2"
  paperSizeMm: { w: number; h: number };
  contentRectMm: Rect;                    // region of the scene this page shows
  originOnPaperMm: Vec2;                  // where contentRect's origin sits on the sheet
  neighbours: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}
```

### 5.1 Paper sizes

Stored in mm; converted to points only in the PDF writer.

| Name | mm | Points (× 72/25.4) |
|---|---|---|
| A5 | 148 × 210 | 419.528 × 595.276 |
| A4 | 210 × 297 | 595.276 × 841.890 |
| A3 | 297 × 420 | 841.890 × 1190.551 |
| A2 | 420 × 594 | 1190.551 × 1683.780 |
| Letter | 215.9 × 279.4 | 612 × 792 |
| Legal | 215.9 × 355.6 | 612 × 1008 |
| Tabloid | 279.4 × 431.8 | 792 × 1224 |

Plus user-defined custom sizes, which matter for roll printers and A4+ formats.

**What 1.0 offers** (slice 6.4a): A5, A4, A3, Letter and Legal, portrait or landscape, chosen in the
header beside *Export PDF* and stored in the project (`ProjectSettings.paper`, `.orientation`). A2,
Tabloid and custom sizes are later.

### 5.2 Tile grid

Content area per page:

```
contentW = paperW − marginLeft − marginRight
contentH = paperH − marginTop − marginBottom
```

Adjacent tiles overlap by `overlapMm`, so the step between tile origins is `contentW − overlapMm`.
For a drawing of width `W`:

```
columns = max(1, ceil( (W − overlapMm) / (contentW − overlapMm) ))
rows    = max(1, ceil( (H − overlapMm) / (contentH − overlapMm) ))
```

The grid then covers `(columns − 1) × step + contentW`, which is generally wider than the drawing.
**Centre the grid on the drawing** so the leftover is split evenly rather than dumped on the right
and bottom edges. Users notice.

Worked example — a 400 × 300 mm bag pattern on A4 portrait, 10 mm margins, 10 mm overlap:

```
contentW = 210 − 20 = 190      step = 180
contentH = 297 − 20 = 277      step = 267
columns  = ceil((400 − 10)/180) = ceil(2.167) = 3
rows     = ceil((300 − 10)/267) = ceil(1.086) = 2
→ 6 pages
```

Rotating to landscape gives `contentW = 277`, `contentH = 190`, hence 2 columns × 2 rows = 4 pages.
The export dialog should compute both and say so, because saving two sheets on every print matters
to people who print a lot of patterns.

### 5.3 Margins and the unprintable area

Almost no consumer printer prints to the paper edge; 4–6 mm of unprintable border is typical.
Content placed there is silently clipped.

- Default margins **10 mm**, comfortably outside any consumer printer's dead zone.
- Warn below 5 mm: "Most printers cannot print within 5 mm of the paper edge. Content here may be
  cut off."
- Never auto-shrink content to fit the printable area. That is exactly the behaviour this whole
  design exists to prevent. If content does not fit, add a page.

### 5.4 `fit-single-page`

For small patterns — a card holder fits on one A4 — skip tiling entirely. This mode still refuses to
scale: if the drawing does not fit at 1:1, it reports that and offers a larger paper size or tiled
mode. It never silently shrinks.

## 6. PDF output

Generated with `pdf-lib`. Pure vector; nothing is rasterised.

### 6.1 The unit conversion

PDF's default user space is **1/72 inch per unit**, so:

```ts
const MM_TO_PT = 72 / 25.4;    // 2.834645669291339…
```

Set the MediaBox to the paper size in points, place content at `mm * MM_TO_PT`, and **emit no
scaling transform anywhere**. Then 1:1 is not something the code achieves — it is the definition of
what it wrote. The only transforms in the content stream are translations (to position a tile) and
the single Y-flip if one is needed, which it is not: PDF is Y-up like the model, so the flip that
Canvas2D and SVG require is absent here. One fewer place to get it wrong.

### 6.2 Per-page structure

1. MediaBox = exact paper size in points.
2. Translate so the tile's `contentRectMm` origin lands at `originOnPaperMm`.
3. Clip to the content rect **plus the overlap band**, so overlapping content appears on both
   neighbouring pages, which is what makes taping possible.
4. Draw the scene items intersecting that rect.
5. Draw registration marks (§7) outside the clip.
6. Draw the calibration block (§8) in the bottom margin.
7. Draw the footer: project name, page label, `1:1 — print at 100 %, do not fit to page`, and the
   generation timestamp.

### 6.3 Document-level metadata

Title, author, creator, and creation date. Set the PDF's `/ViewerPreferences` `/PrintScaling
/None` — Acrobat and several other viewers honour it and will default the print dialog to "Actual
size". It is not universally supported, which is why the printed warning text and the verification
square exist as well. Three independent defences against the same failure.

### 6.4 What not to do

- No `Fit` or `FitH` open action that could imply scaling.
- No embedded raster preview of the geometry.
- No reliance on the viewer honouring anything. Assume the user prints from an unknown application
  with unknown defaults; the verification square is the backstop.

## 7. Registration and assembly aids

For tiled output, the difference between a usable pattern and a jigsaw puzzle.

**What 1.0 builds (slice 7.2a)**, which differs from the list below where marked:
- **Join lines** replace corner crosshairs and the trim line. There is one down the middle of each
  overlap band a sheet shares with a neighbour, in light grey 6-3 dashes, a rhythm no pattern role
  uses. It is drawn at the same model coordinate on both sheets.
- **Registration crosses** sit on the join lines, at the middle of the window's span and where two
  join lines cross. Being in model coordinates, they land on the same place in the pattern on every
  sheet. The maker cuts one sheet on a join line, lays it over the next, and matches the crosses.
- **The overlap is 10 mm**, with no setting yet.
- **A tile label and the assembly note** go in the footer beside the verification square:
  `Strap · R1 C2 · 1 × 3 sheets`.
- **Not yet (7.2, 1.1):** edge arrows, the assembly sheet, and tape guides.

The grid follows §5.2 (the step is the printable area less the overlap, and the grid is centred). A
tiled part follows the packed parts on sheets of its own. Nothing rotates.

- **Corner crosshairs** at the exact corners of each page's content rect: 8 mm arms, 0.1 mm stroke,
  drawn in the margin so they do not overlay the pattern.
- **Overlap band** shown as a light hatch with a solid trim line along its inner edge, plus the text
  `overlap 10 mm`. The user trims on the line and butts the pages, or leaves the band and laps them.
- **Tile label** in the top-left margin: `R1C2`, plus `page 2 of 6`.
- **Edge arrows** on each side that has a neighbour, labelled with the neighbour's tile id — so a
  user with pages spread on a table knows what joins what.
- **Assembly sheet** as page 1 when there is more than one tile: a thumbnail of the whole pattern
  with the tile grid drawn over it and each cell labelled. Cheap to produce and it removes almost
  all of the confusion of tiled printing.
- **Fold/tape guides**: a 5 mm dotted line at the outer edge of the overlap band marking where to
  apply tape without covering pattern lines.

## 8. Scale verification and printer calibration

Two distinct mechanisms, deliberately separated.

### 8.1 Verification — on every page, always

Printed in the bottom margin of every page:

- A **50 × 50 mm square** with its dimensions labelled.
- A **100 mm ruler** with 10 mm major ticks and 1 mm minor ticks, numbered.
- The line: *"Measure the square. If it is not exactly 50 mm, your print is scaled. Reprint at
  100 % / Actual size."*

This costs a few square centimetres of margin and turns a silent, expensive failure into a five
second check. It is not optional and it is not a preference.

**On every sheet a maker can choose, whole.**
- `verificationLayout` in `packages/export/src/paper.ts` is the block's one layout. The PDF writer
  draws from it, and `contentAreaMm` keeps the pattern at least 4 mm above it.
- The square sits beside the ruler where the sheet is wide enough (182 mm or more). On a narrower
  sheet, A5 portrait, it stacks above the ruler at the right margin, and the block reserves 8 mm more.
  It used to be skipped there.

### 8.2 Correction — opt-in, per printer, a last resort

Some printers are genuinely, measurably off — laser printers commonly differ by a few tenths of a
percent, and often **differ between the two axes**, because the paper-feed direction and the
scanning direction have independent error sources.

A calibration wizard:

1. Prints a test page with a 200 mm horizontal line and a 200 mm vertical line, each with tick
   marks.
2. Asks the user to measure both and enter the actual lengths.
3. Stores `scaleCorrection = { x: 200 / measuredX, y: 200 / measuredY }` per printer in
   `~/.config/leathercad/printers.json`.
4. Applies the correction as a scale on the PDF content stream for that printer only.

Guard rails, because this feature can also *cause* the problem it solves:

- Default is always `{ x: 1, y: 1 }`.
- A correction beyond ±2 % is rejected with: "This is almost certainly a print-settings problem, not
  a printer problem. Check that scaling is set to 100 % / Actual size and try again."
- The correction is stored against a printer name and **never travels in the `.lcp` file** — it
  describes the user's hardware, not the pattern.
- Any PDF exported with a correction applied says so in its footer, so a corrected file shared with
  someone else is identifiable.

## 9. Physical verification ritual

Automated tests prove the PDF contains the right numbers. They cannot prove the paper does. Every
release, and at the end of every slice that touches export or printing:

1. Open `fixtures/projects/calibration-target.lcp` — a 200 × 200 mm frame, a 100 mm cross, a 50 mm
   square, and a stitch line at 3.5 mm inset with 3.85 mm holes.
2. Export to PDF, A4 portrait, default margins.
3. Print at 100 %, actual size.
4. Measure with a **steel rule** (not a tape): the 200 mm frame both ways, the 100 mm cross both
   ways, the 50 mm square, and the span across 20 stitch holes (should be 19 × 3.85 = 73.15 mm).
5. Record the results in `docs/print-verification-log.md` with the date, printer, driver, and paper.

Twenty holes rather than two, because a per-hole error of 0.05 mm is invisible individually and
obvious across a span.

## 10. SVG export

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     width="210mm" height="297mm"
     viewBox="0 0 210 297">
  <g id="cut"    fill="none" stroke="#000" stroke-width="0.25">…</g>
  <g id="stitch" fill="none" stroke="#00f" stroke-width="0.15" stroke-dasharray="2 2">…</g>
  <g id="stitch-holes" fill="#00f" stroke="none">…</g>
  <g id="fold"   …>…</g>
  <g id="mark"   …>…</g>
</svg>
```

Rules that make the file actually 1:1 rather than merely nominally so:

- `width`/`height` carry **explicit `mm` units**, and the `viewBox` is in the same numeric space, so
  one user unit equals one millimetre. Importers that respect physical units then get correct
  dimensions with no configuration.
- **No `transform` on the root.** Coordinates are literal millimetres.
- SVG is Y-down, so the writer applies the flip by negating Y and translating by the bounds height —
  in exactly one place, with a test asserting a point at model y = +10 lands above one at y = 0.
- Grouped by layer role with stable `id`s, so laser cutters, plotters, and Cricut-class machines can
  select what to cut.
- Numbers written with 4 decimal places (0.1 µm), matching the model's quantisation.

## 11. DXF export (v1.1)

- **R12 ASCII** as the default target: the most widely readable DXF dialect, accepted by essentially
  every CAM and CNC package.
- R12 has no SPLINE entity, so cubics flatten to `LWPOLYLINE` at 0.005 mm. Lines become `LINE`,
  circular arcs `ARC`, full circles `CIRCLE`, stitch holes `POINT` or small `CIRCLE` depending on an
  export option.
- Header: `$INSUNITS = 4` (millimetres) and `$MEASUREMENT = 1` (metric). Without these, importers
  guess, and guessing is how a pattern arrives at 25.4× the intended size.
- One DXF layer per layer role, named identically to the SVG group ids.
- Y-up matches DXF, so no flip.
- An R2000 variant with true `SPLINE` entities is worth adding later for users whose CAM handles it.

## 12. Other formats

- **PNG at a stated DPI** — for forum posts and messaging. Must burn the scale bar into the image
  and must never be presented as a printable pattern.
- **Hole and thread report (CSV / Markdown)** — per part: contour length, stitch line length, hole
  count, achieved pitch, estimated thread length at 4× seam length. Trivial to generate from data
  the evaluator already produces, and genuinely useful before starting a project.
- **G-code** — out of scope. Users with laser cutters have their own CAM and want DXF or SVG.

## 13. Print submission on Linux

Two paths, both offered:

**Primary — export and let the user print.** Write the PDF, then `xdg-open` it, with an on-screen
reminder to select "Actual size" or 100 %. This works everywhere and keeps the user in a print
dialog they already understand.

**Secondary — submit directly to CUPS** for users who print patterns constantly:

```bash
lp -d <printer> -o media=A4 -o print-scaling=none -o fit-to-page=false <file.pdf>
```

`print-scaling=none` is the IPP attribute honoured by CUPS 2.4 and later; `fit-to-page=false` covers
older versions. Printers are enumerated with `lpstat -e`. If neither option is supported by the
detected CUPS version, fall back to the primary path rather than submitting a job that might be
scaled — **when scaling cannot be guaranteed off, do not print.**

## 14. Automated tests

Full strategy in [testing.md](testing.md) §6; the obligations specific to this pipeline:

| Test | Asserts |
|---|---|
| PDF dimension round trip | Export a 100 × 50 mm rectangle, parse with `pdfjs-dist`, convert points back to mm, assert within 0.01 mm |
| MediaBox exactness | A4 page MediaBox equals 595.276 × 841.890 pt within 0.001 pt |
| No scaling transform | The content stream contains no `cm` operator with non-unit scale factors |
| Tiling coverage | For a 400 × 300 mm scene on A4, exactly 6 pages; the union of content rects covers the bounds with no gap; every adjacent pair overlaps by exactly 10 mm |
| Tiling edge cases | Drawing smaller than one page → 1 page; exactly one page wide; overlap ≥ content width rejected; zero-size scene handled |
| Grid centring | Leftover space is split evenly between the first and last tile |
| SVG units | `width="210mm"`, `viewBox="0 0 210 297"`, no root transform |
| Y-axis orientation | A point at model y = +10 exports above one at y = 0, in both SVG and PDF |
| Stroke widths | Exported widths are the specified true millimetres, not screen widths |
| Preview equals print | `paginate()` output used by the preview is deep-equal to the one used by the PDF writer for the same setup |
| Calibration correction | A 1.005 correction produces geometry 0.5 % larger, and a 1.03 correction is rejected |
| Layer presets | A laser-cut export contains cut and hardware items and no stitch-line or annotation items |
