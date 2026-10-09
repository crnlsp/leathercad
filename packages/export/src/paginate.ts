import { approxCmp, approxEq, approxGte, approxLte, formatMm, type Mm } from '@leathercad/core';
import {
  MatOps,
  PathOps,
  RectOps,
  type Mat2x3,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';

import { contentAreaMm, paperOptionsFitting, type Orientation, type PageSetup } from './paper.js';
import type { ExportPart, ExportScene } from './scene.js';

/**
 * Space left between parts on a sheet, so cut lines never touch and each piece
 * can be cut out on its own. Enough for scissors; more is paper.
 */
const PART_GAP_MM = 6;

/** Room above a part for its printed name. */
const LABEL_HEIGHT_MM = 5;

export interface PlacedPart {
  /** The part as it prints: turned a quarter, words and all, when `turned`. */
  readonly part: ExportPart;
  /**
   * Turned a quarter counter-clockwise from how it was drawn, because that
   * took fewer sheets. Its name then reads upward along its left side.
   */
  readonly turned: boolean;
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
  readonly on: { paper: { name: string }; orientation: Orientation };
  /**
   * Papers that would hold it whole, for telling the user. The chosen paper
   * turned comes first when it fits, since that is the paper in their
   * printer; then the rest in the order of `PAPER_SIZES`.
   */
  readonly fitsOn: ReadonlyArray<{ paper: { name: string }; orientation: Orientation }>;
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
 * sheet. Leatherworkers print on A4 and cut each piece out separately, so the
 * spatial arrangement on the canvas carries no meaning on paper — repacking to
 * save sheets is the better trade.
 *
 * Each part goes to the first sheet with room for it, at the free place
 * highest up and then furthest left — so a small part fills a gap beside a
 * tall one, or on an earlier sheet, rather than opening a row or a sheet of
 * its own. A few orders of parts are tried and the one needing fewest sheets
 * is kept, tallest first on a tie, so the result is the same for the same
 * parts every time.
 *
 * **A part prints as drawn unless turning saves paper.** The layout is made
 * twice: as drawn, and again letting a part turn a quarter where as drawn it
 * would need a sheet of its own or be taped. The turned layout is kept only
 * when it needs fewer sheets, or as many with fewer taped. A turned part
 * carries its words with it, so its name reads up its side and the cut-out
 * template is the same shape either way. A part too large either way is
 * taped across sheets, as drawn.
 */
export function paginate(scene: ExportScene, setup: PageSetup): PaginationResult {
  const area = contentAreaMm(setup);
  const asDrawn = layOut(scene.parts, area, false);
  const turning = layOut(scene.parts, area, true);
  const chosen =
    turning.sheets < asDrawn.sheets ||
    (turning.sheets === asDrawn.sheets && turning.taped < asDrawn.taped)
      ? turning
      : asDrawn;

  const pages: Page[] = chosen.packed.map((placements, index) => ({ index, placements }));

  // Then each part too large for a sheet, on sheets of its own.
  const tiled = chosen.oversized.map(({ part, tiles }) => {
    for (const one of tiles) {
      pages.push({
        index: pages.length,
        placements: [
          {
            part,
            turned: false,
            offsetMm: { x: area.x - one.windowMm.minX, y: area.y - one.windowMm.minY },
          },
        ],
        tile: one,
      });
    }
    const width = RectOps.width(part.boundsMm);
    const height = RectOps.height(part.boundsMm);
    const options = paperOptionsFitting(width, height + LABEL_HEIGHT_MM, setup);
    const turned = options.filter((option) => option.paper.name === setup.paper.name);
    return {
      part,
      widthMm: width,
      heightMm: height,
      rows: tiles[0]!.rows,
      columns: tiles[0]!.columns,
      on: { paper: { name: setup.paper.name }, orientation: setup.orientation },
      fitsOn: [...turned, ...options.filter((option) => !turned.includes(option))].map(
        (option) => ({ paper: { name: option.paper.name }, orientation: option.orientation }),
      ),
    };
  });

  return { pages, tiled };
}

interface Area {
  readonly x: Mm;
  readonly y: Mm;
  readonly widthMm: Mm;
  readonly heightMm: Mm;
}

/** One way to lay the parts out, and what it costs in sheets. */
interface Layout {
  readonly packed: PlacedPart[][];
  readonly oversized: ReadonlyArray<{ readonly part: ExportPart; readonly tiles: Tile[] }>;
  /** Every sheet, packed and taped. */
  readonly sheets: number;
  readonly taped: number;
}

function layOut(parts: readonly ExportPart[], area: Area, mayTurn: boolean): Layout {
  const ways: Footprint[][] = [];
  const oversized: Array<{ part: ExportPart; tiles: Tile[] }> = [];
  for (const part of parts) {
    const options = [asDrawn(part, area), ...(mayTurn ? [turned(part, area)] : [])].filter(
      (option) =>
        approxLte(option.widthMm, area.widthMm) && approxLte(option.heightMm, area.heightMm),
    );
    if (options.length === 0) oversized.push({ part, tiles: tile(part, area) });
    else ways.push(options);
  }

  let packed: PlacedPart[][] = [];
  for (const order of ORDERS) {
    const sheets = pack(
      [...ways].sort((a, b) => order(a[0]!, b[0]!)),
      area,
    );
    if (packed.length === 0 || sheets.length < packed.length) packed = sheets;
  }
  const taped = oversized.reduce((sum, entry) => sum + entry.tiles.length, 0);
  return { packed, oversized, sheets: packed.length + taped, taped };
}

/**
 * A part as the packer sees it: the room it takes, in its own coordinates —
 * its bounds and the name set above them, or beside them once turned.
 */
interface Footprint {
  readonly part: ExportPart;
  readonly turned: boolean;
  readonly room: Rect;
  readonly widthMm: Mm;
  readonly heightMm: Mm;
}

function footprint(part: ExportPart, isTurned: boolean, room: Rect): Footprint {
  return {
    part,
    turned: isTurned,
    room,
    widthMm: RectOps.width(room),
    heightMm: RectOps.height(room),
  };
}

/**
 * As drawn: the bounds, with room above for the name, as wide as the name runs.
 * The fit check is on the bounds: a name longer than the paper is not a reason
 * to tape a part.
 */
function asDrawn(part: ExportPart, area: Area): Footprint {
  const b = part.boundsMm;
  return footprint(part, false, {
    ...b,
    maxX: b.minX + packingWidth(part, area.widthMm),
    maxY: b.maxY + LABEL_HEIGHT_MM,
  });
}

/**
 * A quarter turn counter-clockwise, exactly: (x, y) becomes (−y, x) with no
 * rounding, where `fromRotation(π / 2)` would leave its cosine at 6e-17.
 */
const QUARTER_TURN: Mat2x3 = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };

/**
 * Turned a quarter counter-clockwise, words and all: the name, set above the
 * part as drawn, reads upward along its left side — from the sheet's right
 * edge, as drafting reads a turned dimension.
 */
function turned(part: ExportPart, area: Area): Footprint {
  const b = part.boundsMm;
  const turn = (path: Path): Path => PathOps.transform(path, QUARTER_TURN);
  const piece: ExportPart = {
    ...part,
    paths: part.paths.map((item) => ({ ...item, path: turn(item.path) })),
    texts: part.texts.map((text) => ({ ...text, glyphs: text.glyphs.map(turn) })),
    // Its corners turned by the same matrix as its paths, so the two agree.
    boundsMm: RectOps.fromCorners(
      MatOps.apply(QUARTER_TURN, { x: b.minX, y: b.minY }),
      MatOps.apply(QUARTER_TURN, { x: b.maxX, y: b.maxY }),
    ),
  };
  // The room as drawn, turned: the name's room on the left, and as long as the
  // name runs up the side, never more than the printable height.
  return footprint(piece, true, {
    minX: -b.maxY - LABEL_HEIGHT_MM,
    minY: b.minX,
    maxX: -b.minY,
    maxY: b.minX + packingWidth(part, area.heightMm),
  });
}

/** The orders `paginate` tries: tallest, largest, widest, longest side first. */
const ORDERS: ReadonlyArray<(a: Footprint, b: Footprint) => number> = [
  (a, b) => approxCmp(b.heightMm, a.heightMm),
  (a, b) => approxCmp(b.widthMm * b.heightMm, a.widthMm * a.heightMm),
  (a, b) => approxCmp(b.widthMm, a.widthMm),
  (a, b) => approxCmp(Math.max(b.widthMm, b.heightMm), Math.max(a.widthMm, a.heightMm)),
];

/**
 * Parts onto as few sheets as this order allows: each at the first sheet with
 * room, highest and then leftmost (MaxRects, bottom-left rule).
 *
 * Each part comes with the ways it may lie, as drawn first. A way is tried on
 * every sheet already open before the next is, so a part is turned only when
 * as drawn it would need a new sheet.
 *
 * A sheet's free room is kept as every largest empty rectangle, measured down
 * from the top left of the printable area. Each footprint carries the gap on
 * its right and below, and the sheet one gap's worth of room past its edges,
 * so parts keep the gap between them and still reach the edge.
 */
function pack(parts: ReadonlyArray<readonly Footprint[]>, area: Area): PlacedPart[][] {
  const sheets: Sheet[] = [];
  for (const ways of parts) {
    const placed = ways.some((way) => sheets.some((sheet) => place(sheet, way, area)));
    if (!placed) {
      // Every way `layOut` kept fits a blank sheet.
      const sheet: Sheet = {
        free: [
          {
            minX: 0,
            minY: 0,
            maxX: area.widthMm + PART_GAP_MM,
            maxY: area.heightMm + PART_GAP_MM,
          },
        ],
        placements: [],
      };
      sheets.push(sheet);
      place(sheet, ways[0]!, area);
    }
  }
  return sheets.map((sheet) => sheet.placements);
}

interface Sheet {
  free: Rect[];
  readonly placements: PlacedPart[];
}

/** Puts one way of a part on the sheet, if it has room; says whether it did. */
function place(sheet: Sheet, way: Footprint, area: Area): boolean {
  const w = way.widthMm + PART_GAP_MM;
  const h = way.heightMm + PART_GAP_MM;
  const at = spotFor(sheet.free, w, h);
  if (at === null) return false;
  sheet.free = carve(sheet.free, { minX: at.x, minY: at.y, maxX: at.x + w, maxY: at.y + h });
  sheet.placements.push({
    part: way.part,
    turned: way.turned,
    offsetMm: {
      x: area.x + at.x - way.room.minX,
      // Flip the downward packing space into PDF's upward page space.
      y: area.y + area.heightMm - at.y - way.room.maxY,
    },
  });
  return true;
}

/** The highest, then leftmost, free corner with room for `w` × `h`. */
function spotFor(free: readonly Rect[], w: Mm, h: Mm): Vec2 | null {
  let best: Vec2 | null = null;
  for (const room of free) {
    if (!approxLte(w, RectOps.width(room)) || !approxLte(h, RectOps.height(room))) continue;
    const order = best === null ? -1 : approxCmp(room.minY, best.y) || approxCmp(room.minX, best.x);
    if (order < 0) best = { x: room.minX, y: room.minY };
  }
  return best;
}

/**
 * The free rectangles once `used` is taken: each one it overlaps split into
 * the up to four largest rectangles around it, and any rectangle inside
 * another dropped.
 */
function carve(free: readonly Rect[], used: Rect): Rect[] {
  const pieces: Rect[] = [];
  for (const room of free) {
    const apart =
      approxLte(used.maxX, room.minX) ||
      approxLte(room.maxX, used.minX) ||
      approxLte(used.maxY, room.minY) ||
      approxLte(room.maxY, used.minY);
    if (apart) {
      pieces.push(room);
      continue;
    }
    if (!approxLte(used.minX, room.minX)) pieces.push({ ...room, maxX: used.minX });
    if (!approxGte(used.maxX, room.maxX)) pieces.push({ ...room, minX: used.maxX });
    if (!approxLte(used.minY, room.minY)) pieces.push({ ...room, maxY: used.minY });
    if (!approxGte(used.maxY, room.maxY)) pieces.push({ ...room, minY: used.maxY });
  }
  return pieces.filter(
    (room, i) =>
      !pieces.some(
        (other, j) =>
          j !== i &&
          RectOps.containsRect(other, room) &&
          // Of two equal rectangles, the first stays.
          (j < i || !RectOps.containsRect(room, other)),
      ),
  );
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
 * (docs/printing.md §5.2). Row by row from the top left. A taped part is
 * never turned: it is taped only when it does not fit whole either way.
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
