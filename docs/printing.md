# Export and Printing

**Packages:** `packages/export`, `packages/print`
**Status:** Implemented in 1.0. Where the code and this document disagree, one of them is a bug:
fix it in the same change.
**Last updated:** 2026-10-07

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
then shows that file in its own Print Preview and hands the same bytes to the system print queue
with scaling explicitly disabled (§13). Where it cannot, it saves the file for the user to print
from a viewer at "Actual size".

A viewer is not a safe last step even at "Actual size". On Linux the scaling is decided by the
job's `print-scaling` option, and a job without one is fitted into the printer's margins by CUPS
itself (ADR 0019).

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
        ├──▶ PdfWriter    ──▶ tiled PDF                ├──▶ SvgWriter ──▶ .svg   (6.2)
        └──▶ Canvas2D     ──▶ the Sheets view          └──▶ DxfWriter ──▶ .dxf   (6.5)
```

Two properties this buys, and they are the reason for the shape:

- **The print preview and the printed PDF call the same `paginate()`.** They cannot disagree about
  page count, tile placement, or overlap, because a disagreement would be a bug in one function
  rather than a mismatch between two implementations. Built (7.4a–7.4c) as one derived `SheetPlan`:
  the PDF writes it, and the app's sheet count, Parts labels and **Sheets view** read it. Everything
  a sheet prints besides its pieces — the verification strip, a tiled sheet's joins, crosses and
  clip — is one description, `sheetInk`, which the writer prints and the Sheets
  view draws. See [Design and Sheets](superpowers/specs/2026-09-24-sheets-workflow-design.md).
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
text labels, the verification strip's words — is laid out once in millimetres and written as
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

### 5.5 Packing whole parts (7.8)

A part that fits the printable area is printed whole, never tiled. `paginate` packs those parts
before any tiled one:

- **Each part goes to the first sheet with room for it**, at the free place highest up and then
  furthest left (MaxRects, bottom-left rule). A small part fills the room beside a tall one, or
  room left on an earlier sheet. The shelf packer before it filled rows left to right and never
  went back, so a row was as tall as its tallest part and a sheet once left was never revisited.
- **Four orders are tried** — tallest, largest, widest and longest side first — and the one
  needing fewest sheets is kept, tallest first on a tie. The same parts always give the same sheets.
- **Parts are 6 mm apart** (8 mm before 7.8): room to cut each one out, not more paper.
- **A part prints as drawn unless turning saves paper.** The layout is made twice — as drawn, and
  letting a part turn a quarter counter-clockwise where as drawn it would need a sheet of its own
  or be taped — and the turned one is kept only when it needs fewer sheets, or as many with fewer
  taped. A part too large either way is taped, as drawn.
  - The turn is exact: (x, y) becomes (−y, x), by a matrix with no rounding in it. No scale.
  - The part's words turn with it. Its name reads up its left side, from the sheet's right edge,
    as drafting reads a turned dimension, so the cut-out template is the same shape either way.
  - Parts says *Sheet 1, turned*, since the board shows the part as drawn.
  - This lifts roadmap 7.2's "never turn until the model knows the grain", by decision
    (2026-10-01). A cut-out template carries nothing of the sheet it was printed on, and a taped
    join is the least accurate thing on a sheet. When grain arrives it will be an arrow on the
    part, and an arrow turns with it.

The bifold sample on A4 portrait took five sheets, its outer and lining each taped across two;
turned, it takes two, and nothing is taped. Over 2,000 random projects of 3 to 12 parts up to
260 × 200 mm, against the 62 mm block and the shelf packer: about half the sheets of A4 portrait
and of A4 landscape, and taped sheets down from 8,176 to 630 on A4 portrait. No project needed
more.

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
6. Draw the verification strip (§8.1) at the foot of the printable area: the gauge with the
   instruction to print at 100 % in it, and beside it the project name, the sheet label ("Sheet 2
   of 3", from 7.4a; the word is "sheet" on screen and on paper), `1:1`, the date and the
   application's name. Inside the margins, like everything else printed (7.8, Q17).

### 6.3 Document-level metadata

Title, author, creator, and creation date. Set the PDF's `/ViewerPreferences` `/PrintScaling
/None` — Acrobat and several other viewers honour it and will default the print dialog to "Actual
size". It is not universally supported, which is why the printed warning text and the verification
gauge exist as well. Three independent defences against the same failure.

### 6.4 What not to do

- No `Fit` or `FitH` open action that could imply scaling.
- No embedded raster preview of the geometry.
- No reliance on the viewer honouring anything. Assume the user prints from an unknown application
  with unknown defaults; the verification gauge is the backstop.

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
- **Which sheets it joins** goes in the verification strip, after the sheet's number:
  `Bag · Sheet 3 of 5 · Strap, joins sheets 2 left, 4 right`, or with one neighbour `joins sheet 4
  to the right`. That is what a maker with sheets spread on a table needs; the dashed line and its
  crosses show how. A printed sentence of instructions on every taped sheet did not earn its room,
  and `R1 C2` was a grid reference nobody holding paper needs.
- **Not yet (7.2, 1.1):** edge arrows, the assembly sheet, and tape guides.

The grid follows §5.2 (the step is the printable area less the overlap, and the grid is centred). A
tiled part follows the packed parts on sheets of its own. A tiled part is never turned: it is tiled
only when it fits whole neither way (§5.5).

- **Corner crosshairs** at the exact corners of each page's content rect: 8 mm arms, 0.1 mm stroke,
  drawn in the margin so they do not overlay the pattern.
- **Overlap band** shown as a light hatch with a solid trim line along its inner edge, plus the text
  `overlap 10 mm`. The user trims on the line and butts the pages, or leaves the band and laps them.
- **Tile label** in the top-left margin: `R1C2`, plus `sheet 2 of 6`.
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

One strip at the foot of the printable area of every sheet, **inside the margins** (7.8):

- A **100 × 5 mm gauge**: a box, ticked every 5 mm along its bottom like a rule.
- Written in it: *"Print at 100 % / Actual size — this box is 100 × 5 mm"*.
- Beside it, right-aligned in two lines, what the sheet is — `Bifold wallet · Sheet 1 of 2`, and
  on a taped sheet which sheets it joins (§7) — and where it came from: `2026-10-01 · 1:1 ·
  LeatherCAD`.
- In the corner, **LeatherCAD's mark**: the card pocket from the app icon, 5 mm tall, filled black
  with its stitch holes open. Drawn from the icon's own numbers (`brandMark.ts`), so nothing parses
  an SVG or embeds an image.

It turns a silent, expensive failure into a five second check. It is not optional and it is not a
preference.

**Why a long box, not a square.** Length is what shows an error. A print at 97 % — the usual
"fit to page" — is 3 mm short across the gauge's 100 mm, where a 25 mm square would be 0.75 mm
out, under two graduations of a steel rule. A scaled print is scaled both ways, so the long side
catches every viewer and driver setting. The short side catches only a print stretched one way by
10 % or more — at 10 mm it was 5 %, and a 50 mm square's 1 % was no better for the error that
really happens one way, a printer's few tenths of a percent, which no square a sheet could carry
shows: that is calibration's job (§8.2), with 200 mm lines. So the gauge is as tall as the two
lines of words beside it, and no taller; thinner would not make the strip thinner.

**What it replaced.** Until 7.8 a 50 mm square, a 100 mm ruler and two lines of instruction took
62 mm at the foot of every sheet — 21 % of A4 portrait, 30 % of A4 landscape — and the footer was
printed 5 mm from the paper edge, inside the margin the code calls unreliable (Q17). The strip
takes 8.5 mm — 5 mm of ink and 3 mm clear above it — and prints nothing in the margins. A4
portrait prints 190 × 268.5 mm, not 190 × 215; A4 landscape 277 × 181.5, not 277 × 128.

**On every sheet a maker can choose, whole.**
- `verificationLayout` in `packages/export/src/paper.ts` is the strip's one layout. The PDF writer
  draws from it, and `contentAreaMm` keeps the pattern at least 3 mm above it.
- The words sit beside the gauge where the sheet has room for the longest of them. On a narrower
  sheet, A5 portrait, they stack above it with the mark, and the strip reserves 7 mm more.

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

1. Open `fixtures/projects/print-test.lcp` — a panel with a 100.0 mm dimension and a stitch line all
   round, a card pocket with a thumb scoop stitched on three sides, and a 275 mm strap tiled over two
   sheets.
2. Print it from the app: **Print**, then *Print 3 sheets* in its preview (§13). Where the app
   cannot print (Windows), *Save PDF…* there, and print from the system's PDF viewer at 100 %,
   actual size.
3. Measure with a **steel rule** (not a tape), and record the readings, following the procedure in
   `docs/print-verification-log.md`.

Holes are measured across a whole straight run — 25 holes, 24 gaps — rather than between two,
because a per-hole error of 0.05 mm is invisible individually and obvious across a span. The span
is the run's own achieved spacing times its gaps: on the panel's straight bottom run, 24 × 3.875 =
93.0 mm. The nominal pitch is the wrong number (glossary: *pitch* and *spacing*), and so is the
property panel's *Spacing*, which averages every run in the hole set.

`e2e/print-verification.spec.ts` makes the same measurements on the exported PDF, rasterised by
poppler, and `e2e/packaged/packaged.spec.ts` repeats them against the packaged app on each
platform. `e2e/print-preview.spec.ts` checks that what the Print Preview sends to `lp` is that
same PDF, measured the same way, with scaling off (§13). What none of them can reach is the
printer and the paper.

## 10. SVG export (6.2)

*Export SVG…*, in the menu beside *Export PDF*; `packages/export/src/svg/writer.ts`. For a laser
cutter, a plotter or a vector editor.

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="275mm" height="81.608mm" viewBox="0 0 275 81.608">
<title>LeatherCAD print test</title>
<g id="cut" fill="none" stroke="#1d2126" stroke-width="0.25" stroke-linecap="round" stroke-linejoin="round">
<path d="M 0 73.572 L 100 73.572 L 100 13.572 A 10 10 0 0 0 90 3.572 … Z"/>
</g>
<g id="stitch" … stroke-dasharray="2 2">…</g>
<g id="stitch-holes" …><circle cx="96.5" cy="70.072" r="0.5"/>…</g>
<g id="annotation" …><path d="…" fill="#8a5a2b" stroke="none"/></g>
</svg>
```

**What is in it, and where.** The scene the PDF is written from, so exactly what the PDF prints:
a hidden feature, a feature that failed to build and a part with only words are not in it
(`buildExportScene` decides, and the writers add no filter of their own). It is placed **as the
maker arranged it on the board**, each part's geometry in model coordinates — not as the sheets
pack it. Pagination, tiling, the verification strip and the registration marks are the paper's; a
laser wants the arrangement the maker made. So pieces that overlap on the board overlap in the
file: the print test lays its panel, pocket and strap on top of one another at the origin, and its
SVG does too. Each part's caption, which the scene sets above it, is in the file, on the
annotation layer.

**The page** is the box of everything drawn: curves and glyphs by their exact bounds, never their
control points, and no margin. Its left edge is `x = 0` and its top edge `y = 0`, wherever the
drawing was on the board (`SvgExportResult.boundsMm` says where). A stroke on the very edge is half
outside the page, which a cutter that follows the centre-line does not mind.

Rules that make the file actually 1:1 rather than merely nominally so:

- `width`/`height` carry **explicit `mm` units**, and the `viewBox` is `0 0` and the same two
  numbers, so one user unit equals one millimetre. Importers that respect physical units then get
  correct dimensions with no configuration.
- **No `transform`, anywhere.** Coordinates are literal millimetres.
- SVG is Y-down, so the writer flips: the drawing's top edge becomes the page's top. That is
  `modelToFile` in `svg/writer.ts`, the only place a Y is turned over in the file, applied by the
  geometry layer's own transform so an arc's sweep reverses with it; the sweep flag reads the
  reversed sweep and needs no flip of its own. A file has no viewport, so it is not
  `worldToScreen`. A test asserts a point at model y = +10 lands above one at y = 0, and another
  that a counter-clockwise arc stays counter-clockwise.
- **Numbers to the model's quantum**: four decimals of a millimetre (0.1 µm), written without
  trailing zeros (`100`, not `100.0000`). A coordinate that is not a number stops the export; it is
  never written.
- Plain `\n` line ends and UTF-8 on every platform, with an XML declaration and a `<title>` of the
  project's name, escaped, and with what XML cannot hold left out.

**Layers.** One `<g>` for each layer role, with the domain's role name as its `id` — `cut`,
`stitch`, `stitch-holes`, `fold`, `mark`, `hardware`, `annotation` — in that order and only for roles
with something in them. The DXF's layers have the same names. A stroke is its role's **true width in
millimetres** and a dash its **true rhythm**, from the one role table the canvas and the PDF read,
with the same round caps and joins the PDF draws.

*Colour is the canvas's*, not the PDF's black. A paper template is black and told apart by line
style, because it is photocopied; a file is read by software that sorts a drawing by colour — a
laser's layers — as well as by group, so each role has the colour it has on the canvas. Stitch lines
and their holes share the canvas's blue, so a laser operator separates those two by group.

**What is a circle, an arc, a curve.**

- A **stitch hole is a `<circle>`**, stroked and unfilled like the PDF's, at the 1 mm size the scene
  gives a hole marker, in the `stitch-holes` group. (The hole size a laser wants is not the
  template's marker; choosing it is 6.4.)
- Any path that is one whole turn of an arc is a `<circle>`: a hardware hole is one.
- **Arcs stay arcs** (`A`), and **cubics stay cubics** (`C`): nothing is flattened. An arc is cut
  into pieces of at most a quarter turn. SVG writes an arc by its endpoints and radius, and the
  reader works the centre out from them; for a half turn that is as sensitive as a square root at
  zero, and rounding an endpoint by 0.1 µm moves the far side of a 12.5 mm radius — a strap's
  rounded end — by up to 0.035 mm. Within a quarter turn rounding moves the arc by no more than it
  moved the endpoint. A property test finds the failure in a few runs if the rule is lifted.
- **Words are outlines**: one filled `<path>` for a string, all its contours in `d`, non-zero fill, in
  the `annotation` group. No `<text>`, no font, in this file or any other (ADR 0011).

**Nothing to export.** A scene that draws nothing has no size to give a page, so `exportSvg`
throws a `RangeError`, and the interface greys the item and says why.

**Tests.** `svg/writer.test.ts` parses the output back by hand — no SVG library — and checks the
frame, the flip, the groups and their styles, curves, numbers and title, and that the groups hold
what the plan puts on paper. Two properties over random lines, arcs (half and whole turns among
them) and cubics: the file's curves are the model's, flipped and moved, to within 0.5 µm, read
back through the SVG specification's own endpoint-to-centre conversion; and everything is inside
the page the file declares. `e2e/vector-export.spec.ts` exports the print test through the app and
measures the file: the panel 100.0 mm, its 25 holes 3.875 mm apart, the strap 275.0 mm, and the
dimension under the panel. Rendered by librsvg at 254 dpi (2026-10-07), the print test came out
2750 × 817 px: 275 × 81.6 mm, the right way up, its arcs bulging the right way.

Not yet: presets, choosing layers and the bounds (6.4).

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

## 13. Printing from the app (7.6)

**Print → LeatherCAD's Print Preview → the printer.** The decision and what was measured are in
[ADR 0019](adr/0019-print-from-the-app.md).

**One PDF.** *Print* (green, the window's primary action, Ctrl+P) writes the PDF from the same
`SheetPlan` as *Export PDF*. The preview draws **that file** with pdf.js, so the sheets shown are
the bytes sent, not a second drawing. `lp` then receives those bytes on its standard input. Its
choices are only those that cannot change the size of what prints:

| Choice | What it does |
|---|---|
| Printer | One `lpstat -e` lists; the system default first |
| Paper, orientation | The project's own page setup, `setPageSetup`: one undo step, and the PDF is written again |
| Which sheets | Ticked in the sheet list; sent as `-P`, so CUPS leaves the rest out of the same file |
| Copies | 1–99, `-n` |

Scale is shown as *100 % — locked*: there is no fit, shrink or percentage anywhere. Every job is:

```bash
lp -d <printer> -t <project> -n <copies> -P <sheets> \
   -o media=<paper> -o print-scaling=none -o fit-to-page=false        # the PDF on stdin
```

`print-scaling=none` is the IPP attribute CUPS 2.x and cups-filters' `pdftopdf` honour. Without it,
libcupsfilters defaults to `auto`, which fits the page into the printable area: 96 % on an A4 laser
with 4.23 mm margins. `fit-to-page=false` covers older CUPS. Printers and their paper sizes come
from `lpstat -e`, `lpstat -d` and `lpoptions -p <printer> -l`. These only read: the app never
changes a printer's settings. A printer that lists its paper and lacks the chosen size is not
sent the job. The main process checks every job (`apps/desktop/src/main/printing.ts`): the printer
must be one CUPS lists now, offering the paper when it lists its sizes, and nothing runs through a
shell.

The preview says what the app can and cannot promise. It sends the job with scaling off — *✓ No
scaling* — but a driver or a printer could still scale, so it asks for the gauge to be measured
(§8.1). That measurement, recorded in `print-verification-log.md`, is the only claim of 1:1.

**Never send `orientation-requested` or `landscape`.** Through `pdftopdf` either one turns the page
*and* fits it into the margins, even with `print-scaling=none`.

**Landscape is not sent yet.** CUPS cannot turn a landscape page onto upright paper without
scaling it. With scaling off, `pdftopdf` leaves it unturned and `pdftoraster` lays it on the upright
sheet with everything past 210 mm cut off. With scaling on, it is turned and shrunk to 0.96. The
preview shows landscape and says why it will not print it. The fix is for the writer to put every
sheet in the PDF upright, with a landscape layout turned a quarter inside it, which changes §6.1.

**Where the app does not print, it saves.** The same preview's last step is *Save PDF…*, with the
reminder to print at *Actual size (100 %), never Fit or Shrink*:

- **Windows** — no CUPS; no transport chosen yet (SumatraPDF is the candidate, ADR 0019).
- **The Flatpak** — its runtime has libcups and `lpr`, but no `lp`, `lpstat` or `lpoptions`. The
  app finds no `lpstat`, so it saves.
- **No CUPS scheduler running**, or no printer set up.

**macOS** runs the Linux path against Apple's CUPS, whose `cgpdftopdf` is not open source. It
counts as unverified until a gauge printed there is in the log.

*Export PDF* stays, for a file to keep or send. Its tooltip says how to print one from another
application.

## 14. Automated tests

Full strategy in [testing.md](testing.md) §6; the obligations specific to this pipeline:

| Test | Asserts |
|---|---|
| PDF dimension round trip | Export, rasterise with poppler's `pdftoppm` at 254 dpi, and measure the square, the ruler and the pattern in pixels, within a pixel (0.1 mm) |
| MediaBox exactness | A4 page MediaBox equals 595.276 × 841.890 pt within 0.001 pt |
| No scaling transform | The content stream contains no `cm` operator with non-unit scale factors |
| Tiling coverage | For a 400 × 300 mm scene on A4, exactly 6 pages; the union of content rects covers the bounds with no gap; every adjacent pair overlaps by exactly 10 mm |
| Tiling edge cases | Drawing smaller than one page → 1 page; exactly one page wide; overlap ≥ content width rejected; zero-size scene handled |
| Grid centring | Leftover space is split evenly between the first and last tile |
| SVG units | The export, read back by hand: `width`/`height` in `mm`, `viewBox="0 0 W H"` in the same numbers, no `transform` anywhere (`svg/writer.test.ts`) |
| Y-axis orientation | A point at model y = +10 exports above one at y = 0, in both SVG and PDF |
| Stroke widths | Exported widths are the specified true millimetres, not screen widths |
| Preview equals print | `paginate()` output used by the preview is deep-equal to the one used by the PDF writer for the same setup |
| Calibration correction | A 1.005 correction produces geometry 0.5 % larger, and a 1.03 correction is rejected |
| Export round trip | Random lines, arcs and cubics exported to SVG and read back by hand are the model's curves, flipped and moved, within 0.5 µm; everything is inside the declared page (`svg/writer.test.ts`). The print test exported through the app measures 100.0 mm, 25 holes 3.875 mm apart and 275.0 mm in the file (`e2e/vector-export.spec.ts`) |
| Layer presets | A laser-cut export contains cut and hardware items and no stitch-line or annotation items |
| The print job | `lp`'s arguments for any paper, copies and sheets ask for `print-scaling=none` and `fit-to-page=false` and nothing else that scales; a printer CUPS does not list, a paper it lists its sizes without, or a job no one could have chosen, never reaches `lp` (`printing.test.ts`) |
| Preview equals what is sent | Print previews the print test, and what the fake `lp` receives measures true like an exported PDF; where `pdftopdf` is installed, it measures true after that filter too, with the job's options (`e2e/print-preview.spec.ts`) |
