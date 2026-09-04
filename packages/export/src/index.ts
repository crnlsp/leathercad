/**
 * @leathercad/export — turning a project into files people can use.
 *
 * Runs headless: no canvas, no DOM, no editor. See docs/printing.md.
 */

export type { Margins, Orientation, PageSetup, PaperName, PaperSize } from './paper.js';
export {
  DEFAULT_MARGINS,
  DEFAULT_PAGE_SETUP,
  MM_TO_PT,
  PAPER_SIZES,
  contentAreaMm,
  mmToPt,
  paperOptionsFitting,
  ptToMm,
  sheetSizeMm,
} from './paper.js';

export type { ExportPart, ExportPath, ExportScene, PrintStyle } from './scene.js';
export { PRINT_STYLES, buildExportScene, describePart } from './scene.js';

export type { OversizedPart, Page, PaginationResult, PlacedPart } from './paginate.js';
export { describeOversized, paginate } from './paginate.js';

export type { PdfExportOptions, PdfExportResult } from './pdf/writer.js';
export { exportPdf, printableAreaMm } from './pdf/writer.js';
