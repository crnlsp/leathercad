import type { Project } from '@leathercad/domain';
import type { PartSheets, SheetPlan } from '@leathercad/export';

/**
 * What the Sheets view's panels read out of the sheet plan (U.9, R-08).
 *
 * Reading only: grouping the plan's own placements by sheet, and listing what
 * it tapes. Every number is the plan's — the sheet a piece is on, whether it
 * is turned, how many sheets it takes — so the panels, the board and the PDF
 * cannot disagree (7.4a: there is no second pagination).
 */

/** One piece on one sheet. */
export interface SheetPiece {
  readonly partId: string;
  readonly name: string;
  readonly quantity: number;
  /** Turned a quarter on the paper to save a sheet. */
  readonly turned: boolean;
  /** One tile of a piece printed across several sheets. */
  readonly taped: boolean;
}

/** A sheet and what is on it, in the PDF's order. */
export interface SheetContents {
  /** 1-based, as the PDF's pages. */
  readonly number: number;
  readonly count: number;
  readonly pieces: readonly SheetPiece[];
}

export function sheetContents(plan: SheetPlan): readonly SheetContents[] {
  return plan.sheets.map((sheet) => ({
    number: sheet.index + 1,
    count: plan.sheets.length,
    pieces: sheet.placements.map((placement) => ({
      partId: placement.part.id,
      name: placement.part.name,
      quantity: placement.part.quantity,
      turned: placement.turned,
      taped: sheet.tile !== undefined,
    })),
  }));
}

/** A piece printed across sheets: which, and in what grid. */
export interface TapedPiece {
  readonly partId: string;
  readonly name: string;
  readonly sheets: readonly number[];
  readonly rows: number;
  readonly columns: number;
}

/** What the plan tapes, in the order it reports it. */
export function tapedPieces(plan: SheetPlan): readonly TapedPiece[] {
  return plan.pagination.tiled.map((entry) => ({
    partId: entry.part.id,
    name: entry.part.name,
    sheets: plan.parts.get(entry.part.id)?.sheets ?? [],
    rows: entry.rows,
    columns: entry.columns,
  }));
}

/** Where one piece prints, or null when it does not (hidden, empty, failed). */
export function placementOf(plan: SheetPlan, partId: string): PartSheets | null {
  return plan.parts.get(partId) ?? null;
}

/**
 * The parts to show as selected on the Sheets view: selected themselves, or
 * holding a selected feature — selection is shared with the design board.
 */
export function selectedParts(
  project: Project,
  selection: { readonly parts: ReadonlySet<string>; readonly features: ReadonlySet<string> },
): ReadonlySet<string> {
  return new Set(
    project.parts
      .filter(
        (part) =>
          selection.parts.has(part.id) ||
          part.features.some((feature) => selection.features.has(feature.id)),
      )
      .map((part) => part.id),
  );
}
