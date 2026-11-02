import type { Mm } from '@leathercad/core';
import type { Vec2 } from '@leathercad/geometry';
import { PAPER_FURNITURE } from '@leathercad/render';

import type { Tile } from './paginate.js';
import type { Neighbours } from './paper.js';
import type { SheetPlan } from './sheetPlan.js';

/** A side of a taped sheet, as `Neighbours` names it. */
export type Side = keyof Neighbours;

/**
 * One edge arrow on a taped sheet (7.2), in the part's own coordinates: it
 * points from `tail` to `tip`, square to the join on `side`, and says which
 * sheet joins there.
 */
export interface EdgeArrow {
  readonly side: Side;
  /** The neighbouring sheet, numbered from 1 as printed. */
  readonly sheet: number;
  readonly tip: Vec2;
  readonly tail: Vec2;
}

const SIDES: readonly Side[] = ['above', 'left', 'right', 'below'];

const DIRECTION: Readonly<Record<Side, Vec2>> = {
  above: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  below: { x: 0, y: -1 },
};

/** The sheets beside a tile, by side, numbered from 1 as printed. */
export function neighboursOf(plan: SheetPlan, tile: Tile): Neighbours {
  const at = (row: number, column: number): number | undefined => {
    const index = plan.sheets.findIndex(
      (other) =>
        other.tile?.part.id === tile.part.id &&
        other.tile.row === row &&
        other.tile.column === column,
    );
    return index < 0 ? undefined : index + 1;
  };
  return {
    above: at(tile.row - 1, tile.column),
    left: at(tile.row, tile.column - 1),
    right: at(tile.row, tile.column + 1),
    below: at(tile.row + 1, tile.column),
  };
}

/**
 * An arrow at each join a taped sheet shares, pointing at it and naming the
 * sheet beyond — so a maker with the sheets spread on a table sees which goes
 * where without reading the strip.
 *
 * Each stops short of its join on this sheet's side, so the sheet can be cut
 * on the line and the arrow stays whole, and its neighbour's arrow faces it
 * from the other side. It sits a little off the middle of the sheet's span,
 * clear of the registration cross there.
 */
export function edgeArrows(tile: Tile, neighbours: Neighbours): EdgeArrow[] {
  const { lengthMm, gapMm, alongMm } = PAPER_FURNITURE.edgeArrow;
  const w = tile.windowMm;
  const middle = { x: (w.minX + w.maxX) / 2, y: (w.minY + w.maxY) / 2 };
  // A tile's joins are listed left before right, and top before bottom.
  const joins: Readonly<Record<Side, Mm | undefined>> = {
    above: tile.row > 1 ? tile.joinsMm.y[0] : undefined,
    left: tile.column > 1 ? tile.joinsMm.x[0] : undefined,
    right: tile.column < tile.columns ? tile.joinsMm.x.at(-1) : undefined,
    below: tile.row < tile.rows ? tile.joinsMm.y.at(-1) : undefined,
  };

  return SIDES.flatMap((side) => {
    const sheet = neighbours[side];
    const join = joins[side];
    if (sheet === undefined || join === undefined) return [];
    const d = DIRECTION[side];
    const tip =
      d.x !== 0
        ? { x: join - d.x * gapMm, y: middle.y + alongMm }
        : { x: middle.x + alongMm, y: join - d.y * gapMm };
    return [{ side, sheet, tip, tail: { x: tip.x - d.x * lengthMm, y: tip.y - d.y * lengthMm } }];
  });
}
