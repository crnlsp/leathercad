import type { Mm } from '@leathercad/core';
import { EXPORT_TOLERANCE_MM, SegmentOps, type Path, type Vec2 } from '@leathercad/geometry';
import { outlinesOf, placedText, textWidthMm, type TextPlacement } from '@leathercad/typography';
import {
  PDFDocument,
  PrintScaling,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  restoreDashPattern,
  setDashPattern,
  setFillingGrayscaleColor,
  setLineCap,
  setLineWidth,
  setStrokingGrayscaleColor,
  stroke,
  type PDFPage,
} from 'pdf-lib';

import { paginate, type Page, type PaginationResult, type Tile } from '../paginate.js';
import {
  DEFAULT_PAGE_SETUP,
  contentAreaMm,
  VERIFICATION_TEXT,
  mmToPt,
  sheetSizeMm,
  verificationLayout,
  type PageSetup,
} from '../paper.js';
import type { ExportPath, ExportScene, ExportText } from '../scene.js';

export interface PdfExportOptions {
  readonly setup?: PageSetup;
  /** Injected so an exported file is reproducible. */
  readonly now?: () => Date;
  readonly applicationVersion?: string;
}

export interface PdfExportResult {
  readonly bytes: Uint8Array;
  readonly pagination: PaginationResult;
}

const APP_NAME = 'LeatherCAD';

/**
 * Page furniture, in millimetres.
 *
 * Everything printed is sized in millimetres now, including the text: there is
 * no font to ask for a point size any more, only outlines at a height.
 */
const NOTE_SIZE_MM = 2.5;

/**
 * Writes a print-ready PDF at exactly 1:1.
 *
 * PDF user space is already 1/72 inch, so geometry goes in at `mm * 72/25.4`
 * and **no scaling transform is ever emitted**. 1:1 is therefore the definition
 * of what was written, not something this code has to achieve.
 *
 * PDF is Y-up like the model, so unlike the canvas renderer and the SVG writer
 * there is no axis flip here at all.
 *
 * The application never drives a printer — the user prints from an ordinary
 * viewer — so correctness is defended three times over: `/PrintScaling /None`
 * in the catalog, a printed instruction to print at 100%, and a 50 mm square
 * the user can measure with a steel rule. Any one can fail silently; all three
 * failing at once is unlikely. See docs/printing.md §8.
 */
export async function exportPdf(
  scene: ExportScene,
  options: PdfExportOptions = {},
): Promise<PdfExportResult> {
  const setup = options.setup ?? DEFAULT_PAGE_SETUP;
  const now = options.now ?? ((): Date => new Date());
  const pagination = paginate(scene, setup);

  const document = await PDFDocument.create();
  document.setTitle(scene.projectName);
  document.setCreator(`${APP_NAME} ${options.applicationVersion ?? ''}`.trim());
  document.setProducer(APP_NAME);
  document.setCreationDate(now());
  document.setModificationDate(now());

  // Honoured by Acrobat and several other viewers, which then default their
  // print dialog to Actual size rather than Fit to page.
  document.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);

  // No font is embedded, in this or any other export: every string is written
  // as filled glyph outlines (ADR 0011). That is also what fixes export on a
  // part named "Przegroda główna" — pdf-lib's standard fonts cannot encode ł.
  const sheet = sheetSizeMm(setup);

  // An empty project still yields one page, so the user gets a file rather
  // than a silent no-op.
  const pages = pagination.pages.length > 0 ? pagination.pages : [{ index: 0, placements: [] }];

  for (const page of pages) {
    const pdfPage = document.addPage([mmToPt(sheet.widthMm), mmToPt(sheet.heightMm)]);
    drawPage(pdfPage, page, pages.length, scene, setup, now());
  }

  return { bytes: await document.save(), pagination };
}

function drawPage(
  page: PDFPage,
  layout: Page,
  pageCount: number,
  scene: ExportScene,
  setup: PageSetup,
  now: Date,
): void {
  const tile = layout.tile;
  if (tile !== undefined) {
    // One tile of a part too large for the sheet (7.2a): everything outside
    // its window is cropped by the clip, never scaled to fit. The window is
    // the printable area exactly, so nothing reaches the verification block.
    const area = contentAreaMm(setup);
    page.pushOperators(
      pushGraphicsState(),
      rectangle(mmToPt(area.x), mmToPt(area.y), mmToPt(area.widthMm), mmToPt(area.heightMm)),
      clip(),
      endPath(),
    );
  }

  for (const placement of layout.placements) {
    for (const item of placement.part.paths) {
      drawPath(page, item, placement.offsetMm);
    }

    // The caption was laid out with the part, in the part's own coordinates,
    // so it travels with it to wherever the paginator put the piece.
    for (const text of placement.part.texts) {
      drawText(page, text, placement.offsetMm);
    }
  }

  if (tile !== undefined) {
    drawJoins(page, tile, layout.placements[0]!.offsetMm);
    page.pushOperators(popGraphicsState());
    drawTileLabel(page, setup, tile);
  }

  drawVerificationBlock(page, setup);
  drawFooter(page, setup, scene, layout.index + 1, pageCount, now);
}

/**
 * Join lines: light grey, in long dashes no pattern role uses — a cut is
 * solid, a stitch line 2-2, a fold dash-dot — so no one cuts or stitches along
 * one, and the crosses on it say what it is.
 */
const JOIN_GREY = 0.6;
const JOIN_WIDTH_MM = 0.2;
const JOIN_DASH_MM = [6, 3];
/** Half a registration cross's arm. */
const CROSS_MM = 3;

/**
 * The join lines this sheet shares with its neighbours, and registration
 * crosses on them — all in the part's own coordinates, so each lands on the
 * same place in the pattern on every sheet that shows it. A cross sits at the
 * middle of the window's span along each line, and where two lines cross.
 */
function drawJoins(page: PDFPage, tile: Tile, offsetMm: Vec2): void {
  const w = tile.windowMm;
  const at = (x: Mm, y: Mm): [number, number] => [mmToPt(x + offsetMm.x), mmToPt(y + offsetMm.y)];

  const lines = [
    ...tile.joinsMm.x.map((x) => [at(x, w.minY), at(x, w.maxY)] as const),
    ...tile.joinsMm.y.map((y) => [at(w.minX, y), at(w.maxX, y)] as const),
  ];
  page.pushOperators(
    pushGraphicsState(),
    setLineWidth(mmToPt(JOIN_WIDTH_MM)),
    setStrokingGrayscaleColor(JOIN_GREY),
    setDashPattern(JOIN_DASH_MM.map(mmToPt), 0),
    ...lines.flatMap(([from, to]) => [moveTo(...from), lineTo(...to)]),
    stroke(),
    popGraphicsState(),
  );

  const middleX = (w.minX + w.maxX) / 2;
  const middleY = (w.minY + w.maxY) / 2;
  const crosses = [
    ...tile.joinsMm.x.flatMap((x) => [{ x, y: middleY }, ...tile.joinsMm.y.map((y) => ({ x, y }))]),
    ...tile.joinsMm.y.map((y) => ({ x: middleX, y })),
  ];
  page.pushOperators(
    pushGraphicsState(),
    setLineWidth(mmToPt(JOIN_WIDTH_MM)),
    setStrokingGrayscaleColor(0),
    restoreDashPattern(),
    ...crosses.flatMap((c) => [
      moveTo(...at(c.x - CROSS_MM, c.y)),
      lineTo(...at(c.x + CROSS_MM, c.y)),
      moveTo(...at(c.x, c.y - CROSS_MM)),
      lineTo(...at(c.x, c.y + CROSS_MM)),
    ]),
    stroke(),
    popGraphicsState(),
  );
}

/**
 * Which tile this is, and how the sheets go together, in the footer beside
 * the square. A long part name is shortened rather than run into the square.
 */
function drawTileLabel(page: PDFPage, setup: PageSetup, tile: Tile): void {
  const layout = verificationLayout(setup);
  const size = VERIFICATION_TEXT.tileSizeMm;
  const grid = ` · ${tile.label} · ${String(tile.rows)} × ${String(tile.columns)} sheets`;
  let name = tile.part.name.trim() === '' ? 'Part' : tile.part.name.trim();
  while (name.length > 1 && textWidthMm(`${name}${grid}`, size) > layout.tileTextMaxWidthMm) {
    name = `${name.slice(0, -2)}…`;
  }
  drawFurniture(page, `${name}${grid}`, size, layout.tileLabel);
  drawFurniture(page, VERIFICATION_TEXT.tileNote, size, layout.tileNote);
}

/** Fills one laid-out string's glyph outlines. */
function drawText(page: PDFPage, text: ExportText, offsetMm: Vec2, grey = 0): void {
  if (text.glyphs.length === 0) return;

  const operators = [
    pushGraphicsState(),
    setFillingGrayscaleColor(grey),
    ...text.glyphs.flatMap((glyph) => tracePath(glyph, offsetMm)),
    // Non-zero winding, as TrueType outlines assume: the counter of an "o"
    // comes out as a hole rather than a filled blob.
    fill(),
    popGraphicsState(),
  ];

  page.pushOperators(...operators);
}

/** Lays out and fills a line of page furniture — not part of the design. */
function drawFurniture(
  page: PDFPage,
  content: string,
  sizeMm: Mm,
  at: Vec2,
  placement: TextPlacement = {},
): void {
  const placed = placedText(content, sizeMm, at, placement);
  drawText(
    page,
    { role: 'annotation', source: content, glyphs: outlinesOf(placed), sizeMm },
    { x: 0, y: 0 },
  );
}

/** Emits one path in millimetre-derived points. */
function drawPath(page: PDFPage, item: ExportPath, offsetMm: Vec2): void {
  const operators = [
    pushGraphicsState(),
    setLineWidth(mmToPt(item.style.widthMm)),
    setStrokingGrayscaleColor(item.style.grey),
    setLineCap(1 /* round */),
    item.style.dashMm.length > 0
      ? setDashPattern(item.style.dashMm.map(mmToPt), 0)
      : restoreDashPattern(),
    ...tracePath(item.path, offsetMm),
    stroke(),
    popGraphicsState(),
  ];
  page.pushOperators(...operators);
}

function tracePath(path: Path, offsetMm: Vec2): ReturnType<typeof moveTo>[] {
  const operators: ReturnType<typeof moveTo>[] = [];
  const at = (p: Vec2): [number, number] => [mmToPt(p.x + offsetMm.x), mmToPt(p.y + offsetMm.y)];

  let previousEnd: Vec2 | null = null;

  for (const segment of path.segments) {
    const start = SegmentOps.start(segment);
    if (previousEnd === null || !samePoint(previousEnd, start)) {
      operators.push(moveTo(...at(start)));
    }

    if (segment.kind === 'line') {
      operators.push(lineTo(...at(segment.b)));
    } else {
      // PDF has no arc primitive, so every arc becomes cubics here. This is
      // the path that made toCubics tolerance-driven rather than fixed at a
      // quarter turn: at 90° the radial error is 0.027 mm on a 100 mm radius,
      // five times the export budget. See docs/geometry.md §5.1.
      for (const cubic of SegmentOps.toCubics(segment, EXPORT_TOLERANCE_MM)) {
        operators.push(appendBezierCurve(...at(cubic.p1), ...at(cubic.p2), ...at(cubic.p3)));
      }
    }

    previousEnd = SegmentOps.end(segment);
  }

  if (path.closed && path.segments.length > 0) operators.push(closePath());
  return operators;
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

/**
 * A 50 mm square and a 100 mm ruler, on every page.
 *
 * Costs a few square centimetres of margin and turns a silent, expensive
 * failure into a five-second check with a steel rule. Not optional.
 */
function drawVerificationBlock(page: PDFPage, setup: PageSetup): void {
  // Laid out once, in `verificationLayout`, which is also what keeps the
  // pattern off it — so what is drawn and what is reserved cannot disagree.
  const layout = verificationLayout(setup);
  const { square, squareSizeMm: size } = layout;

  drawRuler(page, layout.ruler.x, layout.ruler.y, layout.rulerLengthMm, layout.rulerHeightMm);

  page.pushOperators(
    pushGraphicsState(),
    setLineWidth(mmToPt(0.2)),
    setStrokingGrayscaleColor(0),
    restoreDashPattern(),
    moveTo(mmToPt(square.x), mmToPt(square.y)),
    lineTo(mmToPt(square.x + size), mmToPt(square.y)),
    lineTo(mmToPt(square.x + size), mmToPt(square.y + size)),
    lineTo(mmToPt(square.x), mmToPt(square.y + size)),
    closePath(),
    stroke(),
    popGraphicsState(),
  );
  drawFurniture(page, '50 mm', NOTE_SIZE_MM, { x: square.x + 2, y: square.y + size - 5 });

  drawFurniture(
    page,
    VERIFICATION_TEXT.instruction,
    VERIFICATION_TEXT.instructionSizeMm,
    layout.instruction,
  );
  drawFurniture(page, VERIFICATION_TEXT.note, VERIFICATION_TEXT.noteSizeMm, layout.note);
}

/** A 100 mm ruler with 10 mm major and 5 mm minor ticks. */
function drawRuler(page: PDFPage, x: Mm, y: Mm, lengthMm: Mm, majorMm: Mm): void {
  const operators = [
    pushGraphicsState(),
    setLineWidth(mmToPt(0.2)),
    setStrokingGrayscaleColor(0),
    restoreDashPattern(),
    moveTo(mmToPt(x), mmToPt(y)),
    lineTo(mmToPt(x + lengthMm), mmToPt(y)),
  ];

  for (let mm = 0; mm <= lengthMm; mm += 5) {
    const height = mm % 10 === 0 ? majorMm : 2;
    operators.push(moveTo(mmToPt(x + mm), mmToPt(y)), lineTo(mmToPt(x + mm), mmToPt(y + height)));
  }

  operators.push(stroke(), popGraphicsState());
  page.pushOperators(...operators);
}

function drawFooter(
  page: PDFPage,
  setup: PageSetup,
  scene: ExportScene,
  pageNumber: number,
  pageCount: number,
  now: Date,
): void {
  const sheet = sheetSizeMm(setup);
  const y = setup.marginsMm.bottom - 5;
  if (y < 0) return;

  const name = scene.projectName.trim() === '' ? 'Untitled' : scene.projectName.trim();
  const date = now.toISOString().slice(0, 10);
  const left = `${name} · ${date} · ${APP_NAME}`;
  const right = `Page ${pageNumber} of ${pageCount} · 1:1`;

  drawFurniture(page, left, NOTE_SIZE_MM, { x: setup.marginsMm.left, y });
  // Right-aligned by the layout's own measurement, rather than by asking a
  // font how wide it thinks the string is.
  drawFurniture(
    page,
    right,
    NOTE_SIZE_MM,
    { x: sheet.widthMm - setup.marginsMm.right, y },
    { align: 'right' },
  );
}

/** The millimetre area a pattern may occupy, for callers checking fit. */
export function printableAreaMm(setup: PageSetup = DEFAULT_PAGE_SETUP): {
  widthMm: Mm;
  heightMm: Mm;
} {
  const area = contentAreaMm(setup);
  return { widthMm: area.widthMm, heightMm: area.heightMm };
}
