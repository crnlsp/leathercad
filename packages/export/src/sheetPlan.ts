import { ORIENTATIONS, PAPER_NAMES, type Orientation, type PaperName } from '@leathercad/domain';

import { paginate, type Page, type PaginationResult } from './paginate.js';
import { pageSetupOf, type PageSetup } from './paper.js';
import type { ExportScene } from './scene.js';

/**
 * Where one part prints: the sheets it is on, numbered from 1 as the PDF's
 * pages are.
 */
export interface PartSheets {
  readonly partId: string;
  /** 1-based sheet numbers, ascending. A packed part has one; a taped one has its tiles'. */
  readonly sheets: readonly number[];
  /** Printed across several sheets to be taped together (7.2a). */
  readonly taped: boolean;
  /** For a taped part, its grid of tiles; 1 × 1 otherwise. */
  readonly rows: number;
  readonly columns: number;
}

/**
 * **The one answer to "what will be printed"** (7.4a).
 *
 * Derived from the export scene and the page setup, and from nothing else:
 * not the window, not the viewport, not where pieces sit on the board — the
 * scene carries each part in its own coordinates and `paginate` places it by
 * its bounds alone. The same scene and setup always give the same plan.
 *
 * The PDF writes it (`exportPdf(plan)`), and every surface that says anything
 * about the paper — the sheet count, Parts, the Sheets view — reads it. There is
 * no second pagination anywhere, so the preview is the print by construction.
 * It is never stored: it is recomputed from the document (invariant 4).
 */
export interface SheetPlan {
  readonly setup: PageSetup;
  readonly scene: ExportScene;
  readonly pagination: PaginationResult;
  /**
   * The sheets in PDF order: sheet `n` is page `n`. Never empty — a project
   * with nothing to print still exports one sheet carrying the scale check,
   * so the plan says so too.
   */
  readonly sheets: readonly Page[];
  /** Keyed by part id. A part absent here does not print. */
  readonly parts: ReadonlyMap<string, PartSheets>;
}

export function planSheets(scene: ExportScene, setup: PageSetup): SheetPlan {
  const pagination = paginate(scene, setup);
  const sheets: readonly Page[] =
    pagination.pages.length > 0 ? pagination.pages : [{ index: 0, placements: [] }];

  const parts = new Map<string, PartSheets>();
  for (const sheet of sheets) {
    for (const placement of sheet.placements) {
      const id = placement.part.id;
      const known = parts.get(id);
      parts.set(id, {
        partId: id,
        sheets: [...(known?.sheets ?? []), sheet.index + 1],
        taped: sheet.tile !== undefined,
        rows: sheet.tile?.rows ?? 1,
        columns: sheet.tile?.columns ?? 1,
      });
    }
  }

  return { setup, scene, pagination, sheets, parts };
}

/** True when nothing in the project prints: the one sheet carries only the scale check. */
export function isScaleCheckOnly(plan: SheetPlan): boolean {
  return plan.scene.parts.length === 0;
}

/**
 * The plan for every paper and orientation the maker can choose, in the order
 * the paper list shows them. The scene is paper-independent, so it is built
 * once and only pagination runs per option.
 */
export function planEveryPaper(
  scene: ExportScene,
): ReadonlyArray<{ paper: PaperName; orientation: Orientation; plan: SheetPlan }> {
  return PAPER_NAMES.flatMap((paper) =>
    ORIENTATIONS.map((orientation) => ({
      paper,
      orientation,
      plan: planSheets(scene, pageSetupOf(paper, orientation)),
    })),
  );
}

/**
 * Whether sheet numbers, in order, run without a gap — so they are said as
 * `2–3` rather than `2, 4`. The one rule for both the paper's words and the
 * interface's (ADR 0018).
 */
export function isContiguous(sheets: readonly number[]): boolean {
  return sheets.length > 0 && sheets[sheets.length - 1]! - sheets[0]! + 1 === sheets.length;
}

/**
 * "Sheet 2", "Sheets 2–3": the sheets a part prints on, as the Sheets view
 * draws them beside the paper. In the paper's language, English, like the
 * footer; the interface says it in its own (ADR 0018).
 */
export function describeSheetNumbers(sheets: readonly number[]): string {
  if (sheets.length === 1) return `Sheet ${String(sheets[0]!)}`;
  return isContiguous(sheets)
    ? `Sheets ${String(sheets[0]!)}–${String(sheets[sheets.length - 1]!)}`
    : `Sheets ${sheets.map(String).join(', ')}`;
}

/**
 * `Sheet 2 of 3`: the one wording of a sheet's number, printed in the PDF's
 * footer and shown above the sheet in the Sheets view, so the two always agree.
 */
export function sheetLabel(sheetNumber: number, sheetCount: number): string {
  return `Sheet ${String(sheetNumber)} of ${String(sheetCount)}`;
}
