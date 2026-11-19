import type { Mm } from '@leathercad/core';
import type { Rect, Vec2 } from '@leathercad/geometry';

import type { AxisCandidate } from './snap.js';

/**
 * Equal spacing (3.19, smart-guides spec §8): a piece moved along one axis
 * between two neighbours lands with equal gaps to both, or repeats the gap of
 * the pair beside it — three card slots 15 mm apart, the third placed by the
 * first two. Gaps are measured between exact extents, as Distribute measures
 * them, and only from a side the outline runs straight along: the extent of a
 * disc or a turned panel is not a face the leather shows.
 */

type Axis = 'x' | 'y';

/** Whether the outline runs straight along its extent's low and high side on one axis. */
export interface Sides {
  readonly low: boolean;
  readonly high: boolean;
}

/** Something a gap can be measured to: its extent, and which sides of it are faces. */
export interface Face {
  readonly featureId: string;
  readonly order: number;
  readonly box: Rect;
  readonly straight: { readonly x: Sides; readonly y: Sides };
}

/** One gap to draw: along the axis from `from` to `to`, at `across` on the other. */
export interface Gap {
  readonly from: number;
  readonly to: number;
  readonly across: number;
}

/** An equal-spacing catch: the gap both labels show, and the two gaps it makes equal. */
export interface SpacingCandidate extends AxisCandidate {
  readonly kind: 'equal-spacing';
  readonly gapMm: Mm;
  readonly gaps: readonly [Gap, Gap];
}

export const isSpacing = (candidate: AxisCandidate): candidate is SpacingCandidate =>
  candidate.kind === 'equal-spacing' && 'gaps' in candidate;

/** A spacing within reach of the moved piece, and the side of it that lands on its value. */
export interface SpacingFound {
  readonly candidate: SpacingCandidate;
  /** The moving reference before the move: the side, or centre, the value is for. */
  readonly reference: number;
  readonly distanceMm: Mm;
  readonly order: number;
}

/**
 * The spacings a piece with extent `box`, carried by `raw`, is within `reach`
 * of on one axis. Its neighbours are the nearest faces below and above it that
 * overlap it on the other axis; one that is not straight where it faces the
 * piece offers nothing, and nor does anything behind it.
 *
 * ponytail: a scan of every face a move, four times — microseconds among the
 * 200-piece benchmark; sort the faces per axis if a board ever holds thousands.
 */
export function spacingFor(
  faces: readonly Face[],
  box: Rect,
  raw: Vec2,
  axis: Axis,
  reach: number,
): SpacingFound[] {
  const moved = {
    minX: box.minX + raw.x,
    maxX: box.maxX + raw.x,
    minY: box.minY + raw.y,
    maxY: box.maxY + raw.y,
  };
  const size = hi(box, axis) - lo(box, axis);
  const found: SpacingFound[] = [];
  const offer = (
    value: number,
    reference: number,
    gapMm: number,
    gaps: readonly [Gap, Gap],
    near: Face,
    far: Face,
    which: number,
  ): void => {
    const distanceMm = Math.abs(value - (reference + raw[axis]));
    if (distanceMm > reach) return;
    found.push({
      candidate: {
        kind: 'equal-spacing',
        axis,
        value,
        featureId: near.featureId,
        otherFeatureId: far.featureId,
        gapMm,
        gaps,
      },
      reference,
      distanceMm,
      order: Math.min(near.order, far.order) * 3 + which,
    });
  };

  const below = nearestBelow(faces, moved, axis, lo(moved, axis) + reach);
  const above = nearestAbove(faces, moved, axis, hi(moved, axis) - reach);
  const facing = (face: Face | null, side: keyof Sides): face is Face =>
    face !== null && face.straight[axis][side];

  // Between two neighbours: its centre midway between their faces.
  if (facing(below, 'high') && facing(above, 'low')) {
    const room = lo(above.box, axis) - hi(below.box, axis) - size;
    if (room >= 0) {
      const gap = room / 2;
      const value = (hi(below.box, axis) + lo(above.box, axis)) / 2;
      offer(
        value,
        (lo(box, axis) + hi(box, axis)) / 2,
        gap,
        [
          {
            from: hi(below.box, axis),
            to: hi(below.box, axis) + gap,
            across: middle(below.box, moved, axis),
          },
          {
            from: lo(above.box, axis) - gap,
            to: lo(above.box, axis),
            across: middle(above.box, moved, axis),
          },
        ],
        below,
        above,
        0,
      );
    }
  }

  // The gap of the pair below it, repeated above that pair.
  if (facing(below, 'high') && facing(below, 'low')) {
    const beyond = nearestBelow(faces, below.box, axis, lo(below.box, axis));
    if (facing(beyond, 'high')) {
      const gap = lo(below.box, axis) - hi(beyond.box, axis);
      const value = hi(below.box, axis) + gap;
      offer(
        value,
        lo(box, axis),
        gap,
        [
          {
            from: hi(beyond.box, axis),
            to: lo(below.box, axis),
            across: middle(beyond.box, below.box, axis),
          },
          { from: hi(below.box, axis), to: value, across: middle(below.box, moved, axis) },
        ],
        below,
        beyond,
        1,
      );
    }
  }

  // The gap of the pair above it, repeated below that pair.
  if (facing(above, 'low') && facing(above, 'high')) {
    const beyond = nearestAbove(faces, above.box, axis, hi(above.box, axis));
    if (facing(beyond, 'low')) {
      const gap = lo(beyond.box, axis) - hi(above.box, axis);
      const value = lo(above.box, axis) - gap;
      offer(
        value,
        hi(box, axis),
        gap,
        [
          { from: value, to: lo(above.box, axis), across: middle(above.box, moved, axis) },
          {
            from: hi(above.box, axis),
            to: lo(beyond.box, axis),
            across: middle(above.box, beyond.box, axis),
          },
        ],
        above,
        beyond,
        2,
      );
    }
  }
  return found;
}

const lo = (box: Rect, axis: Axis): number => (axis === 'x' ? box.minX : box.minY);
const hi = (box: Rect, axis: Axis): number => (axis === 'x' ? box.maxX : box.maxY);
const other = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');

/** Whether two extents overlap on the axis across `axis`: a gap between them is a gap across them. */
function overlaps(a: Rect, b: Rect, axis: Axis): boolean {
  const across = other(axis);
  return lo(a, across) < hi(b, across) && lo(b, across) < hi(a, across);
}

/** The middle of where two extents overlap, across `axis`: where their gap is drawn. */
function middle(a: Rect, b: Rect, axis: Axis): number {
  const across = other(axis);
  return (Math.max(lo(a, across), lo(b, across)) + Math.min(hi(a, across), hi(b, across))) / 2;
}

/** The face overlapping `of` whose high side is nearest below `limit`; ties by document order. */
function nearestBelow(faces: readonly Face[], of: Rect, axis: Axis, limit: number): Face | null {
  let best: Face | null = null;
  for (const face of faces) {
    if (hi(face.box, axis) > limit || hi(face.box, axis) >= hi(of, axis)) continue;
    if (!overlaps(face.box, of, axis)) continue;
    if (best === null || hi(face.box, axis) > hi(best.box, axis)) best = face;
  }
  return best;
}

/** The face overlapping `of` whose low side is nearest above `limit`; ties by document order. */
function nearestAbove(faces: readonly Face[], of: Rect, axis: Axis, limit: number): Face | null {
  let best: Face | null = null;
  for (const face of faces) {
    if (lo(face.box, axis) < limit || lo(face.box, axis) <= lo(of, axis)) continue;
    if (!overlaps(face.box, of, axis)) continue;
    if (best === null || lo(face.box, axis) < lo(best.box, axis)) best = face;
  }
  return best;
}
