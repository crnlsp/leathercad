/**
 * @leathercad/export — turning a project into files people can use.
 *
 * Runs headless: no canvas, no DOM, no editor. See docs/printing.md.
 */

export type { Margins, Orientation, PageSetup, PaperName, PaperSize } from './paper.js';
export {
  DEFAULT_MARGINS,
  DEFAULT_PAGE_SETUP,
  pageSetupFor,
  pageSetupOf,
  MM_TO_PT,
  PAPER_SIZES,
  contentAreaMm,
  mmToPt,
  paperOptionsFitting,
  ptToMm,
  sheetSizeMm,
} from './paper.js';

export type { ExportPart, ExportPath, ExportScene, ExportText, PrintStyle } from './scene.js';
export { PRINT_STYLES, buildExportScene } from './scene.js';
// The one place a part's caption is worded and sized, shared with the canvas.
export { CAPTION_GAP_MM, CAPTION_SIZE_MM, describePart } from '@leathercad/render';

export type { Page, PaginationResult, PlacedPart, Tile, TiledPart } from './paginate.js';
export { TILE_OVERLAP_MM, describeTiled, paginate } from './paginate.js';

// The one derived answer to "what will be printed" (7.4a): the PDF writes it,
// and the sheet count, Parts and the Sheets view read it.
export type { PartSheets, SheetPlan } from './sheetPlan.js';
export {
  describeSheetNumbers,
  describeSheets,
  describeTaped,
  isScaleCheckOnly,
  planEveryPaper,
  planSheets,
  sheetLabel,
} from './sheetPlan.js';

// What of each part reaches paper, from the same plan (7.4b).
export type { NotPrintedReason, PartPrintStatus } from './printStatus.js';
export { describePrintStatus, printStatusOf } from './printStatus.js';

// The sheet plan drawn on screen: tape joins on the design board (7.4b), and
// the Sheets view (7.4c) — drawn from the same `sheetInk` the PDF prints.
export type { FurnitureOptions, SheetsLayer, SheetsViewOptions } from './sheetsDisplay.js';
export { sheetsView, tapeJoins } from './sheetsDisplay.js';
export type { SheetFrame, SheetGroup, SheetsLayout } from './sheetsLayout.js';
export { layoutSheets, pieceAt, sheetAt } from './sheetsLayout.js';

export type { PdfExportOptions, PdfExportResult } from './pdf/writer.js';
export { exportPdf, printableAreaMm } from './pdf/writer.js';
