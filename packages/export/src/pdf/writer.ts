import type { Mm } from '@leathercad/core';
import { EXPORT_TOLERANCE_MM, SegmentOps, type Path, type Vec2 } from '@leathercad/geometry';
import {
  PDFDocument,
  PrintScaling,
  StandardFonts,
  appendBezierCurve,
  closePath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  restoreDashPattern,
  setDashPattern,
  setLineCap,
  setLineWidth,
  setStrokingGrayscaleColor,
  stroke,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';

import { paginate, type Page, type PaginationResult } from '../paginate.js';
import {
  DEFAULT_PAGE_SETUP,
  contentAreaMm,
  mmToPt,
  sheetSizeMm,
  type PageSetup,
} from '../paper.js';
import type { ExportPath, ExportScene } from '../scene.js';

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

  const font = await document.embedFont(StandardFonts.Helvetica);
  const sheet = sheetSizeMm(setup);

  // An empty project still yields one page, so the user gets a file rather
  // than a silent no-op.
  const pages = pagination.pages.length > 0 ? pagination.pages : [{ index: 0, placements: [] }];

  for (const page of pages) {
    const pdfPage = document.addPage([mmToPt(sheet.widthMm), mmToPt(sheet.heightMm)]);
    drawPage(pdfPage, page, pages.length, scene, setup, font, now());
  }

  return { bytes: await document.save(), pagination };
}

function drawPage(
  page: PDFPage,
  layout: Page,
  pageCount: number,
  scene: ExportScene,
  setup: PageSetup,
  font: PDFFont,
  now: Date,
): void {
  for (const placement of layout.placements) {
    for (const item of placement.part.paths) {
      drawPath(page, item, placement.offsetMm);
    }

    // The part's name sits just above its bounding box, so a printed sheet
    // says what each piece is without needing the screen.
    const label = placement.part.name;
    page.drawText(label, {
      x: mmToPt(placement.offsetMm.x + placement.part.boundsMm.minX),
      y: mmToPt(placement.offsetMm.y + placement.part.boundsMm.maxY + 1.5),
      size: 8,
      font,
    });
  }

  drawVerificationBlock(page, setup, font);
  drawFooter(page, setup, font, scene, layout.index + 1, pageCount, now);
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
function drawVerificationBlock(page: PDFPage, setup: PageSetup, font: PDFFont): void {
  const sheet = sheetSizeMm(setup);
  const baseY = setup.marginsMm.bottom + 8;
  const x = setup.marginsMm.left;

  drawRuler(page, x, baseY, 100);

  const squareX = x + 112;
  const squareSize = 50;
  const squareY = baseY;
  if (squareX + squareSize <= sheet.widthMm - setup.marginsMm.right) {
    page.pushOperators(
      pushGraphicsState(),
      setLineWidth(mmToPt(0.2)),
      setStrokingGrayscaleColor(0),
      restoreDashPattern(),
      moveTo(mmToPt(squareX), mmToPt(squareY)),
      lineTo(mmToPt(squareX + squareSize), mmToPt(squareY)),
      lineTo(mmToPt(squareX + squareSize), mmToPt(squareY + squareSize)),
      lineTo(mmToPt(squareX), mmToPt(squareY + squareSize)),
      closePath(),
      stroke(),
      popGraphicsState(),
    );
    page.drawText('50 mm', {
      x: mmToPt(squareX + 2),
      y: mmToPt(squareY + squareSize - 5),
      size: 7,
      font,
    });
  }

  page.drawText('Print at 100% / Actual size — do not scale or fit to page.', {
    x: mmToPt(x),
    y: mmToPt(baseY + 16),
    size: 8,
    font,
  });
  page.drawText('Measure the 100 mm ruler or the 50 mm square to confirm.', {
    x: mmToPt(x),
    y: mmToPt(baseY + 11.5),
    size: 7,
    font,
  });
}

/** A 100 mm ruler with 10 mm major and 5 mm minor ticks. */
function drawRuler(page: PDFPage, x: Mm, y: Mm, lengthMm: Mm): void {
  const operators = [
    pushGraphicsState(),
    setLineWidth(mmToPt(0.2)),
    setStrokingGrayscaleColor(0),
    restoreDashPattern(),
    moveTo(mmToPt(x), mmToPt(y)),
    lineTo(mmToPt(x + lengthMm), mmToPt(y)),
  ];

  for (let mm = 0; mm <= lengthMm; mm += 5) {
    const height = mm % 10 === 0 ? 3.5 : 2;
    operators.push(moveTo(mmToPt(x + mm), mmToPt(y)), lineTo(mmToPt(x + mm), mmToPt(y + height)));
  }

  operators.push(stroke(), popGraphicsState());
  page.pushOperators(...operators);
}

function drawFooter(
  page: PDFPage,
  setup: PageSetup,
  font: PDFFont,
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

  page.drawText(left, { x: mmToPt(setup.marginsMm.left), y: mmToPt(y), size: 7, font });
  page.drawText(right, {
    x: mmToPt(sheet.widthMm - setup.marginsMm.right) - font.widthOfTextAtSize(right, 7),
    y: mmToPt(y),
    size: 7,
    font,
  });
}

/** The millimetre area a pattern may occupy, for callers checking fit. */
export function printableAreaMm(setup: PageSetup = DEFAULT_PAGE_SETUP): {
  widthMm: Mm;
  heightMm: Mm;
} {
  const area = contentAreaMm(setup);
  return { widthMm: area.widthMm, heightMm: area.heightMm };
}
