import { EPS_ANGLE, approxZero, type Mm } from '@leathercad/core';
import { SegmentOps, type Path } from '@leathercad/geometry';

import type { FeatureSource } from './feature.js';

/**
 * The durable landmarks a source offers, as distances along its path.
 *
 * This is how a partial stitch run is addressed — "from this corner round to
 * that one" — and it is deliberately **not** a segment index. `roundedRect`
 * emits a variable number of segments: eight with 8 mm corners, four with
 * none, six when a radius eats a whole edge. An index-based run would silently
 * move to different edges when a radius changed, and silent wrongness on a
 * pattern about to be cut from leather is the worst failure this can produce.
 *
 * A rectangle has four corners whatever its radii, so its anchors are stable
 * under every dimension change. A circle has none, which is why only a whole
 * run can be taken from one.
 *
 * Ordered along the path, so a run between two of them is contiguous. Index 0
 * is the first corner *after the path's start point*, not a named corner —
 * what matters is that the same index keeps meaning the same corner.
 */
export function anchorsOf(source: FeatureSource, path: Path): readonly Mm[] {
  switch (source.kind) {
    case 'text':
      // A label is words, not an outline; there is nothing to run between.
      return [];
    case 'shape':
      switch (source.shape.type) {
        case 'rect':
          return cornerDistances(path);
        case 'circle':
        case 'arc':
          // Round or already open: there is no corner to name, so a run on one
          // can only be the whole thing.
          return [];
      }
    // eslint-disable-next-line no-fallthrough
    case 'path':
      return cornerDistances(path);
    case 'derived':
      // A run on a derived feature is not something anyone has asked for, and
      // allowing it would mean anchors that move when their own source moves.
      return [];
  }
}

/**
 * Where the path turns a corner, as distances from its start.
 *
 * Two kinds of corner, because leather patterns have both. A **break** is a
 * tangent discontinuity, which is what a sharp corner looks like. A **rounded**
 * corner is an arc between two straights — tangent at both ends, so it breaks
 * nothing, but it is unmistakably a corner and its midpoint is the point that
 * stays put as the radius changes.
 *
 * Used twice: to place run anchors, and to split a stitch line so a hole lands
 * on every corner (docs/domain-model.md §6).
 */
export function cornerDistances(path: Path): readonly Mm[] {
  const segments = path.segments;
  if (segments.length === 0) return [];

  const lengths = segments.map((s) => SegmentOps.length(s));
  const starts: Mm[] = [];
  let cumulative = 0;
  for (const l of lengths) {
    starts.push(cumulative);
    cumulative += l;
  }

  const corners: Mm[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;

    // A rounded corner: an arc with a straight on each side. On a circle both
    // neighbours are the arc itself, which is how a circle reports none.
    if (segment.kind === 'arc') {
      const before = neighbour(segments, i - 1, path.closed);
      const after = neighbour(segments, i + 1, path.closed);
      if (before?.kind === 'line' && after?.kind === 'line') {
        corners.push(starts[i]! + lengths[i]! / 2);
      }
      continue;
    }

    // A sharp corner: the tangent jumps between this segment and the next.
    const next = neighbour(segments, i + 1, path.closed);
    if (next === undefined) continue;

    const turn = SegmentOps.tangentAt(segment, 1);
    const onward = SegmentOps.tangentAt(next, 0);
    if (!approxZero(turn.x * onward.y - turn.y * onward.x, EPS_ANGLE)) {
      corners.push(starts[i]! + lengths[i]!);
    }
  }

  return corners.sort((a, b) => a - b);
}

function neighbour(
  segments: Path['segments'],
  index: number,
  closed: boolean,
): Path['segments'][number] | undefined {
  if (index < 0) return closed ? segments[segments.length - 1] : undefined;
  if (index >= segments.length) return closed ? segments[0] : undefined;
  return segments[index];
}
