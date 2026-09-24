import type { Mm } from '@leathercad/core';
import { RectOps, type Rect, type Vec2 } from '@leathercad/geometry';
import { SHEET } from '@leathercad/render';

import { contentAreaMm, sheetSizeMm } from './paper.js';
import type { SheetPlan } from './sheetPlan.js';

/**
 * Between the sheets of one taped piece, side by side: close, so they read as
 * one piece of pattern.
 */
const TAPED_GAP_MM = 6;

/** One sheet on the Sheets view: where its paper's bottom-left corner sits. */
export interface SheetFrame {
  /** 0-based, as the plan's sheets and the PDF's pages. */
  readonly index: number;
  readonly origin: Vec2;
  readonly widthMm: Mm;
  readonly heightMm: Mm;
}

/** A taped piece's sheets, together in their grid. */
export interface SheetGroup {
  readonly partId: string;
  readonly name: string;
  /** 1-based sheet numbers. */
  readonly sheets: readonly number[];
  readonly rows: number;
  readonly columns: number;
  /** Around its sheets' paper. */
  readonly bounds: Rect;
}

export interface SheetsLayout {
  readonly frames: readonly SheetFrame[];
  readonly groups: readonly SheetGroup[];
  /** Everything the view shows, with room for the labels. */
  readonly extent: Rect;
}

/** Room above a sheet for its number, and below a taped group for its name. */
const LABEL_ROOM_MM = 14;

/** Between a taped piece's rows: room for the lower sheet's number above it. */
const TAPED_ROW_GAP_MM = LABEL_ROOM_MM;

/**
 * Where the sheets sit on the Sheets view (7.4c): in PDF order, left to right,
 * wrapping into rows — laid out from the **plan alone**, never from the
 * window, so resizing never rearranges the paper and the same plan always
 * looks the same.
 *
 * A packed sheet takes one place in a row. A taped piece's sheets take its
 * rows × columns grid, close together, in the order the PDF numbers them —
 * which is row by row, so the grid and the numbering agree. They are drawn
 * apart, never overlapped: the overlap is on the paper, as matching bands and
 * crosses.
 */
export function layoutSheets(plan: SheetPlan): SheetsLayout {
  const { widthMm: w, heightMm: h } = sheetSizeMm(plan.setup);
  const count = plan.sheets.length;
  // A row holds this many sheets' width: all of them up to four, then a
  // roughly landscape-shaped block. A function of the count only.
  const perRow = count <= 4 ? count : Math.ceil(Math.sqrt(count * 1.5));

  // Blocks: a packed sheet, or a taped piece's whole grid.
  interface Block {
    readonly sheets: number[];
    readonly rows: number;
    readonly columns: number;
    readonly partId?: string;
    readonly name?: string;
  }
  const blocks: Block[] = [];
  for (const sheet of plan.sheets) {
    const tile = sheet.tile;
    const last = blocks.at(-1);
    if (tile !== undefined && last?.partId === tile.part.id) {
      last.sheets.push(sheet.index);
    } else if (tile !== undefined) {
      blocks.push({
        sheets: [sheet.index],
        rows: tile.rows,
        columns: tile.columns,
        partId: tile.part.id,
        name: tile.part.name,
      });
    } else {
      blocks.push({ sheets: [sheet.index], rows: 1, columns: 1 });
    }
  }

  const frames: SheetFrame[] = [];
  const groups: SheetGroup[] = [];
  let x = 0;
  let rowTop = 0;
  let rowUnits = 0;
  let rowHeight = 0;

  for (const block of blocks) {
    const blockWidth = block.columns * w + (block.columns - 1) * TAPED_GAP_MM;
    const blockHeight = block.rows * h + (block.rows - 1) * TAPED_ROW_GAP_MM;
    if (rowUnits > 0 && rowUnits + block.columns > perRow) {
      rowTop -= rowHeight + SHEET.gapMm + 2 * LABEL_ROOM_MM;
      x = 0;
      rowUnits = 0;
      rowHeight = 0;
    }

    block.sheets.forEach((index, i) => {
      const r = Math.floor(i / block.columns);
      const c = i % block.columns;
      frames.push({
        index,
        origin: { x: x + c * (w + TAPED_GAP_MM), y: rowTop - (r + 1) * h - r * TAPED_ROW_GAP_MM },
        widthMm: w,
        heightMm: h,
      });
    });
    if (block.partId !== undefined) {
      groups.push({
        partId: block.partId,
        name: block.name ?? '',
        sheets: block.sheets.map((index) => index + 1),
        rows: block.rows,
        columns: block.columns,
        bounds: RectOps.fromCorners(
          { x, y: rowTop - blockHeight },
          { x: x + blockWidth, y: rowTop },
        ),
      });
    }

    x += blockWidth + SHEET.gapMm;
    rowUnits += block.columns;
    rowHeight = Math.max(rowHeight, blockHeight);
  }

  const paper = RectOps.unionAll(
    frames.map((f) =>
      RectOps.fromCorners(f.origin, { x: f.origin.x + f.widthMm, y: f.origin.y + f.heightMm }),
    ),
  )!;
  const extent = {
    minX: paper.minX,
    maxX: paper.maxX,
    minY: paper.minY - LABEL_ROOM_MM,
    maxY: paper.maxY + LABEL_ROOM_MM,
  };
  return { frames, groups, extent };
}

/** The sheet under a point of the view, if any: its frame. */
export function sheetAt(layout: SheetsLayout, point: Vec2): SheetFrame | null {
  return (
    layout.frames.find(
      (f) =>
        point.x >= f.origin.x &&
        point.x <= f.origin.x + f.widthMm &&
        point.y >= f.origin.y &&
        point.y <= f.origin.y + f.heightMm,
    ) ?? null
  );
}

/**
 * What is under a point of the Sheets view (7.4d): the sheet, and the piece
 * on it, if any. A piece is found by its placed bounds — pieces are packed by
 * their bounds, so on a sheet no two overlap — and a tiled sheet's piece only
 * inside the printable area it is cropped to, as printed.
 */
export function pieceAt(
  plan: SheetPlan,
  layout: SheetsLayout,
  point: Vec2,
): { readonly sheet: number; readonly partId: string | null } | null {
  const frame = sheetAt(layout, point);
  if (frame === null) return null;
  const sheet = plan.sheets[frame.index]!;
  const local = { x: point.x - frame.origin.x, y: point.y - frame.origin.y };

  if (sheet.tile !== undefined) {
    const area = contentAreaMm(plan.setup);
    const inside =
      local.x >= area.x &&
      local.x <= area.x + area.widthMm &&
      local.y >= area.y &&
      local.y <= area.y + area.heightMm;
    if (!inside) return { sheet: frame.index, partId: null };
  }

  for (const placement of sheet.placements) {
    const b = placement.part.boundsMm;
    const x = local.x - placement.offsetMm.x;
    const y = local.y - placement.offsetMm.y;
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) {
      return { sheet: frame.index, partId: placement.part.id };
    }
  }
  return { sheet: frame.index, partId: null };
}
