import { approxEq, approxGte, formatMm, formatNumber, type Mm } from '@leathercad/core';
import { PathOps, RectOps, type Rect, type Vec2 } from '@leathercad/geometry';

import { contentAreaMm, paperOptionsFitting, type PageSetup } from './paper.js';
import type { ExportPart, ExportScene } from './scene.js';

/** Space left between parts on a sheet, so cut lines never touch. */
const PART_GAP_MM = 8;

/** Room above a part for its printed name. */
const LABEL_HEIGHT_MM = 5;

export interface PlacedPart {
  readonly part: ExportPart;
  /**
   * Where the part's bounds origin lands on the sheet, in millimetres from
   * the bottom-left of the paper. Y is up, matching PDF.
   */
  readonly offsetMm: Vec2;
}

export interface Page {
  readonly index: number;
  readonly placements: readonly PlacedPart[];
  /**
   * Present when this sheet is one tile of a part too large for the sheet
   * (7.2a). Its one placement is that part, and only `windowMm` of it is on
   * the paper.
   */
  readonly tile?: Tile;
}

/** One sheet of a tiled part. */
export interface Tile {
  readonly part: ExportPart;
  /** 1-based, row by row from the top left. */
  readonly row: number;
  readonly column: number;
  readonly rows: number;
  readonly columns: number;
  /** `R1 C2`: what the sheet says it is. */
  readonly label: string;
  /**
   * What of the part this sheet shows, in the part's own coordinates: exactly
   * the printable area's size, placed on it by a translation alone.
   */
  readonly windowMm: Rect;
  /**
   * The join lines this sheet shares with its neighbours, in the part's own
   * coordinates: x for a vertical line, y for a horizontal one. Each lies in
   * the middle of an overlap band, at the same place on both sheets.
   */
  readonly joinsMm: { readonly x: readonly Mm[]; readonly y: readonly Mm[] };
}

export interface PaginationResult {
  readonly pages: readonly Page[];
  /**
   * Parts too large for one sheet at 1:1, printed across several instead.
   *
   * Never scaled to fit and never clipped to one sheet — that would silently
   * produce a template that cuts the wrong size, which is the one failure this
   * whole application exists to prevent.
   */
  readonly tiled: readonly TiledPart[];
}

export interface TiledPart {
  readonly part: ExportPart;
  readonly widthMm: Mm;
  readonly heightMm: Mm;
  readonly rows: number;
  readonly columns: number;
  /** The paper it was measured against: the one the maker chose. */
  readonly on: { paper: { name: string }; orientation: string };
  /**
   * Papers that would hold it whole, for telling the user. The chosen paper
   * turned comes first when it fits, since that is the paper in their
   * printer; then the rest in the order of `PAPER_SIZES`.
   */
  readonly fitsOn: ReadonlyArray<{ paper: { name: string }; orientation: string }>;
}

/**
 * How much neighbouring tiles share, in millimetres. Both sheets carry the
 * pattern across this band, so it is the tolerance a maker has when laying
 * one over the other; the join line runs down its middle.
 */
export const TILE_OVERLAP_MM = 10;

/**
 * How far a tape join is kept from a fold, where the grid has the room.
 *
 * A join is a line the maker cuts along and tapes over; a fold is a line they
 * crease. One on top of the other cannot be told apart on the sheet, and the
 * tape stiffens exactly where the leather has to bend (Q13).
 */
export const FOLD_CLEARANCE_MM = 15;

/**
 * Packs whole parts onto sheets.
 *
 * This is **part packing, not tiling**: each part is placed complete on one
 * sheet and the overflow moves to the next page. Leatherworkers print on A4
 * and cut each piece out separately, so the spatial arrangement on the canvas
 * carries no meaning on paper — repacking to save sheets is the better trade.
 *
 * Shelf packing: parts are sorted tallest first and laid left to right in
 * rows. Not optimal — bin packing never is, cheaply — but it wastes little on
 * the handful of parts a real pattern has, and it is predictable, which
 * matters more than optimal when someone is checking their printout.
 */
export function paginate(scene: ExportScene, setup: PageSetup): PaginationResult {
  const area = contentAreaMm(setup);
  const oversized: TiledPart[] = [];
  const fitting: ExportPart[] = [];

  for (const part of scene.parts) {
    const width = RectOps.width(part.boundsMm);
    const height = RectOps.height(part.boundsMm) + LABEL_HEIGHT_MM;

    if (width > area.widthMm || height > area.heightMm) {
      const options = paperOptionsFitting(width, height, setup);
      const turned = options.filter((option) => option.paper.name === setup.paper.name);
      oversized.push({
        part,
        widthMm: width,
        heightMm: height - LABEL_HEIGHT_MM,
        rows: 0,
        columns: 0,
        on: { paper: { name: setup.paper.name }, orientation: setup.orientation },
        fitsOn: [...turned, ...options.filter((option) => !turned.includes(option))].map(
          (option) => ({ paper: { name: option.paper.name }, orientation: option.orientation }),
        ),
      });
    } else {
      fitting.push(part);
    }
  }

  // Tallest first, so short parts fill the gaps beside them rather than
  // starting a row of their own.
  const ordered = [...fitting].sort(
    (a, b) => RectOps.height(b.boundsMm) - RectOps.height(a.boundsMm),
  );

  const pages: Page[] = [];
  let placements: PlacedPart[] = [];
  let cursorX = 0;
  // Y measures downward from the top of the content area while packing; it is
  // converted to PDF's bottom-up origin when a part is placed.
  let rowTop = 0;
  let rowHeight = 0;

  const flushPage = (): void => {
    if (placements.length > 0) pages.push({ index: pages.length, placements });
    placements = [];
    cursorX = 0;
    rowTop = 0;
    rowHeight = 0;
  };

  for (const part of ordered) {
    const width = packingWidth(part, area.widthMm);
    const height = RectOps.height(part.boundsMm) + LABEL_HEIGHT_MM;

    // Wrap to the next row when this part would run off the right edge.
    if (cursorX > 0 && cursorX + width > area.widthMm) {
      rowTop += rowHeight + PART_GAP_MM;
      cursorX = 0;
      rowHeight = 0;
    }

    // Start a new page when the row would run off the bottom.
    if (rowTop + height > area.heightMm) {
      flushPage();
    }

    placements.push({
      part,
      offsetMm: {
        x: area.x + cursorX - part.boundsMm.minX,
        // Flip the downward packing cursor into PDF's upward page space.
        y: area.y + area.heightMm - rowTop - height - part.boundsMm.minY,
      },
    });

    cursorX += width + PART_GAP_MM;
    rowHeight = Math.max(rowHeight, height);
  }

  flushPage();

  // Then each part too large for a sheet, on sheets of its own.
  const tiled = oversized.map((entry) => {
    const tiles = tile(entry.part, area);
    for (const one of tiles) {
      pages.push({
        index: pages.length,
        placements: [
          {
            part: entry.part,
            offsetMm: { x: area.x - one.windowMm.minX, y: area.y - one.windowMm.minY },
          },
        ],
        tile: one,
      });
    }
    return { ...entry, rows: tiles[0]!.rows, columns: tiles[0]!.columns };
  });

  return { pages, tiled };
}

/**
 * How wide a part is on the sheet: its geometry, or its caption where the
 * caption runs further.
 *
 * The caption is set from the piece's left edge and can be longer than a
 * narrow piece is wide. Packing by the geometry alone printed a keeper's long
 * name over the next piece's, or past the edge of the paper (Q12). Never more
 * than the printable width: a name longer than the paper is not a reason to
 * give it a sheet of its own, and a piece is only ever tiled for its size.
 */
function packingWidth(part: ExportPart, printableWidthMm: Mm): Mm {
  let right = part.boundsMm.maxX;
  for (const text of part.texts) {
    for (const glyph of text.glyphs) {
      const box = PathOps.bbox(glyph);
      if (box !== null) right = Math.max(right, box.maxX);
    }
  }
  return Math.max(
    RectOps.width(part.boundsMm),
    Math.min(right - part.boundsMm.minX, printableWidthMm),
  );
}

/**
 * The tiles of one part: a grid of windows the size of the printable area,
 * overlapping by `TILE_OVERLAP_MM` and centred on the part and its name
 * (docs/printing.md §5.2). Row by row from the top left. Nothing rotates:
 * which way a piece lies on the paper is which way it is cut (7.2).
 */
function tile(part: ExportPart, area: { widthMm: Mm; heightMm: Mm }): Tile[] {
  const region = { ...part.boundsMm, maxY: part.boundsMm.maxY + LABEL_HEIGHT_MM };
  const width = RectOps.width(region);
  const height = RectOps.height(region);
  const stepX = area.widthMm - TILE_OVERLAP_MM;
  const stepY = area.heightMm - TILE_OVERLAP_MM;
  if (stepX <= 0 || stepY <= 0) {
    throw new RangeError(
      `A sheet printing ${formatMm(area.widthMm, 1)} × ${formatMm(area.heightMm, 1)} is too small to tile with a ${formatMm(TILE_OVERLAP_MM, 0)} overlap.`,
    );
  }

  const columns = Math.max(1, Math.ceil((width - TILE_OVERLAP_MM) / stepX));
  const rows = Math.max(1, Math.ceil((height - TILE_OVERLAP_MM) / stepY));

  // Centred — the grid's spare falls evenly on every side, not all at one —
  // unless that puts a join on a fold, when the grid slides along its spare.
  const spareX = (columns - 1) * stepX + area.widthMm - width;
  const spareY = (rows - 1) * stepY + area.heightMm - height;
  const folds = straightFolds(part);
  const left = clearOfFolds(
    region.minX - spareX / 2,
    region.minX - spareX,
    region.minX,
    Array.from({ length: columns - 1 }, (_, i) => (i + 1) * stepX + TILE_OVERLAP_MM / 2),
    folds.x,
  );
  const top = clearOfFolds(
    region.maxY + spareY / 2,
    region.maxY,
    region.maxY + spareY,
    Array.from({ length: rows - 1 }, (_, i) => -((i + 1) * stepY + TILE_OVERLAP_MM / 2)),
    folds.y,
  );

  const tiles: Tile[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const minX = left + c * stepX;
      const maxY = top - r * stepY;
      const x: Mm[] = [];
      const y: Mm[] = [];
      if (c > 0) x.push(minX + TILE_OVERLAP_MM / 2);
      if (c < columns - 1) x.push(left + (c + 1) * stepX + TILE_OVERLAP_MM / 2);
      if (r > 0) y.push(maxY - TILE_OVERLAP_MM / 2);
      if (r < rows - 1) y.push(top - (r + 1) * stepY - TILE_OVERLAP_MM / 2);
      tiles.push({
        part,
        row: r + 1,
        column: c + 1,
        rows,
        columns,
        label: `R${String(r + 1)} C${String(c + 1)}`,
        windowMm: RectOps.fromCorners(
          { x: minX, y: maxY - area.heightMm },
          { x: minX + area.widthMm, y: maxY },
        ),
        joinsMm: { x, y },
      });
    }
  }
  return tiles;
}

/** Where a part's straight, square folds run: x for an upright one, y for a level one. */
function straightFolds(part: ExportPart): { x: Mm[]; y: Mm[] } {
  const x: Mm[] = [];
  const y: Mm[] = [];
  for (const item of part.paths) {
    if (item.role !== 'fold') continue;
    const box = PathOps.bbox(item.path);
    if (box === null || item.path.segments.some((segment) => segment.kind !== 'line')) continue;
    if (approxEq(box.minX, box.maxX)) x.push(box.minX);
    else if (approxEq(box.minY, box.maxY)) y.push(box.minY);
  }
  return { x, y };
}

/**
 * Where to start a grid so that no join lands on a fold.
 *
 * The grid may start anywhere in `[lo, hi]` and still cover the piece; its
 * joins are at `start + offset`. The centred start is kept when it is clear;
 * otherwise the clear start nearest the centre, trying each place that puts a
 * join exactly the clearance away from a fold. With no clear start — the grid
 * has no room to move — it stays centred: covering the piece comes first.
 */
function clearOfFolds(
  centred: Mm,
  lo: Mm,
  hi: Mm,
  offsets: readonly Mm[],
  folds: readonly Mm[],
): Mm {
  const clear = (start: Mm): boolean =>
    offsets.every((offset) =>
      folds.every((fold) => approxGte(Math.abs(start + offset - fold), FOLD_CLEARANCE_MM)),
    );
  if (folds.length === 0 || offsets.length === 0 || clear(centred)) return centred;

  const candidates = offsets.flatMap((offset) =>
    folds.flatMap((fold) => [fold - offset - FOLD_CLEARANCE_MM, fold - offset + FOLD_CLEARANCE_MM]),
  );
  let best = centred;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const start of candidates) {
    if (start < lo || start > hi || !clear(start)) continue;
    const distance = Math.abs(start - centred);
    if (distance < bestDistance) {
      best = start;
      bestDistance = distance;
    }
  }
  return best;
}

/** A sentence a user can act on: what was tiled, and what would hold it whole. */
export function describeTiled(entry: TiledPart): string {
  const size = `${formatNumber(entry.widthMm, 1)} × ${formatMm(entry.heightMm, 1)}`;
  const sheets = entry.rows * entry.columns;
  const printed = `"${entry.part.name}" is ${size}, larger than ${entry.on.paper.name} ${entry.on.orientation}: printed on ${String(sheets)} sheets, ${String(entry.rows)} × ${String(entry.columns)}.`;
  const best = entry.fitsOn[0];
  return best === undefined
    ? `${printed} No supported paper holds it whole.`
    : `${printed} It fits whole on ${best.paper.name} ${best.orientation}.`;
}
