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
 * What the plan comes to, as a maker would say it: `3 sheets of A4, portrait`.
 * The number is the PDF's page count, and nothing else.
 */
export function describeSheets(plan: SheetPlan): string {
  const count = plan.sheets.length;
  const noun = count === 1 ? 'sheet' : 'sheets';
  const paper = `${plan.setup.paper.name}, ${plan.setup.orientation}`;
  const base = `${String(count)} ${noun} of ${paper}`;
  return isScaleCheckOnly(plan) ? `${base}, scale check only` : base;
}

/**
 * Which pieces the plan tapes across sheets, for the paper list:
 * `Strap taped`, `Outer panel and Strap taped`, `3 pieces taped`. Null when
 * everything prints whole.
 */
export function describeTaped(plan: SheetPlan): string | null {
  const names = plan.pagination.tiled.map((entry) => entry.part.name);
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]!} taped`;
  if (names.length === 2) return `${names[0]!} and ${names[1]!} taped`;
  return `${String(names.length)} pieces taped`;
}

/** "Sheet 2", "Sheets 2–3": the sheets a part prints on, as Parts and the Sheets view say it. */
export function describeSheetNumbers(sheets: readonly number[]): string {
  if (sheets.length === 1) return `Sheet ${String(sheets[0]!)}`;
  const first = sheets[0]!;
  const last = sheets[sheets.length - 1]!;
  const contiguous = last - first + 1 === sheets.length;
  return contiguous
    ? `Sheets ${String(first)}–${String(last)}`
    : `Sheets ${sheets.map(String).join(', ')}`;
}

/**
 * `Sheet 2 of 3`: the one wording of a sheet's number, printed in the PDF's
 * footer and shown above the sheet in the Sheets view, so the two always agree.
 */
export function sheetLabel(sheetNumber: number, sheetCount: number): string {
  return `Sheet ${String(sheetNumber)} of ${String(sheetCount)}`;
}
