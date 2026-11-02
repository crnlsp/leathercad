import { MatOps, RectOps, type Mat2x3, type Rect } from '@leathercad/geometry';

import type { Assembly } from './sheetPlan.js';

/** One sheet of a taped part on its assembly sheet: where its share of the part is drawn. */
export interface AssemblyCell {
  /** The sheet it stands for, numbered from 1 as printed. */
  readonly sheet: number;
  readonly row: number;
  readonly column: number;
  /** On the assembly sheet, in millimetres from its bottom-left. */
  readonly rectMm: Rect;
}

export interface AssemblyDiagram {
  readonly cells: readonly AssemblyCell[];
  /** The part's own coordinates onto the assembly sheet: a reduction and a move, nothing else. */
  readonly placement: Mat2x3;
  /** How much the map is reduced: under 1, the same both ways. */
  readonly scale: number;
}

/**
 * A taped part's tiles as a map (7.2): each tile's share of the part — from
 * the join on one side to the join on the other, or to the window's edge
 * where it has no neighbour — reduced by one factor and centred in `regionMm`.
 * The cells meet at the joins, where the maker cuts, so the map is the
 * sheets as they will lie once taped.
 *
 * A map, not the pattern: the one drawing on paper that is not to scale,
 * because nothing is cut from it. The pattern itself is never reduced.
 */
export function assemblyDiagram(assembly: Assembly, regionMm: Rect): AssemblyDiagram {
  const shares = assembly.tiles.map(({ tile, sheet }) => {
    const w = tile.windowMm;
    // A tile's joins are listed left before right, and top before bottom.
    const share = {
      minX: tile.column > 1 ? tile.joinsMm.x[0]! : w.minX,
      maxX: tile.column < tile.columns ? tile.joinsMm.x.at(-1)! : w.maxX,
      maxY: tile.row > 1 ? tile.joinsMm.y[0]! : w.maxY,
      minY: tile.row < tile.rows ? tile.joinsMm.y.at(-1)! : w.minY,
    };
    return { sheet, row: tile.row, column: tile.column, share };
  });

  const grid = RectOps.unionAll(shares.map(({ share }) => share));
  if (grid === null) throw new RangeError('An assembly needs at least one tile; it had none.');
  const scale = Math.min(
    RectOps.width(regionMm) / RectOps.width(grid),
    RectOps.height(regionMm) / RectOps.height(grid),
  );
  const from = RectOps.centre(grid);
  const to = RectOps.centre(regionMm);
  const placement = MatOps.composeAll(
    MatOps.fromTranslation({ x: -from.x, y: -from.y }),
    MatOps.fromScale(scale),
    MatOps.fromTranslation(to),
  );

  return {
    cells: shares.map(({ sheet, row, column, share }) => ({
      sheet,
      row,
      column,
      rectMm: RectOps.transform(share, placement),
    })),
    placement,
    scale,
  };
}
