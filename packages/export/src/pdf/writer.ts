import type { Mm } from '@leathercad/core';
import { EXPORT_TOLERANCE_MM, SegmentOps, type Path, type Vec2 } from '@leathercad/geometry';
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

import type { Page } from '../paginate.js';
import {
  DEFAULT_PAGE_SETUP,
  contentAreaMm,
  mmToPt,
  sheetSizeMm,
  type PageSetup,
} from '../paper.js';
import type { ExportPath, ExportText } from '../scene.js';
import { sheetInk, type SheetInk } from '../sheetInk.js';
import type { SheetPlan } from '../sheetPlan.js';

export interface PdfExportOptions {
  /** Injected so an exported file is reproducible. */
  readonly now?: () => Date;
  readonly applicationVersion?: string;
}

export interface PdfExportResult {
  readonly bytes: Uint8Array;
}

const APP_NAME = 'LeatherCAD';

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
  plan: SheetPlan,
  options: PdfExportOptions = {},
): Promise<PdfExportResult> {
  const { scene, setup } = plan;
  const now = options.now ?? ((): Date => new Date());

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

  // Exactly the plan's sheets, in its order: sheet n is page n. The plan
  // already holds the one scale-check sheet an empty project exports, so the
  // count the maker was shown is the count written.
  for (const page of plan.sheets) {
    const pdfPage = document.addPage([mmToPt(sheet.widthMm), mmToPt(sheet.heightMm)]);
    drawPage(pdfPage, page, sheetInk(plan, page.index, now()));
  }

  return { bytes: await document.save() };
}

function drawPage(page: PDFPage, layout: Page, ink: SheetInk): void {
  if (ink.clip !== null) {
    // One tile of a part too large for the sheet (7.2a): everything outside
    // its window is cropped by the clip, never scaled to fit. The window is
    // the printable area exactly, so nothing reaches the verification block.
    const { clip: area } = ink;
    page.pushOperators(
      pushGraphicsState(),
      rectangle(
        mmToPt(area.minX),
        mmToPt(area.minY),
        mmToPt(area.maxX - area.minX),
        mmToPt(area.maxY - area.minY),
      ),
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

  if (ink.clip !== null) {
    for (const item of ink.clipped) drawFurniturePath(page, item);
    page.pushOperators(popGraphicsState());
  }

  // The verification block, the tile label and the footer: `sheetInk`, the one
  // description the Sheets view draws too (7.4c).
  for (const item of ink.paths) drawFurniturePath(page, item);
  for (const text of ink.texts) drawText(page, text, { x: 0, y: 0 });
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

/**
 * Page furniture — the ruler, the square, joins and crosses — as it has always
 * been printed: square ends, not the pattern's round caps, so a ruler's ends
 * are where its millimetres say.
 */
function drawFurniturePath(page: PDFPage, item: ExportPath): void {
  page.pushOperators(
    pushGraphicsState(),
    setLineWidth(mmToPt(item.style.widthMm)),
    setStrokingGrayscaleColor(item.style.grey),
    item.style.dashMm.length > 0
      ? setDashPattern(item.style.dashMm.map(mmToPt), 0)
      : restoreDashPattern(),
    ...tracePath(item.path, { x: 0, y: 0 }),
    stroke(),
    popGraphicsState(),
  );
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

/** The millimetre area a pattern may occupy, for callers checking fit. */
export function printableAreaMm(setup: PageSetup = DEFAULT_PAGE_SETUP): {
  widthMm: Mm;
  heightMm: Mm;
} {
  const area = contentAreaMm(setup);
  return { widthMm: area.widthMm, heightMm: area.heightMm };
}
