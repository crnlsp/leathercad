import { EPS_ANGLE, approxZero, type Mm } from '@leathercad/core';
import { SegmentOps, type Path, type PathEdit } from '@leathercad/geometry';

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
    case 'measurement':
      // Nothing measures a measurement. It is a reading of the drawing, not a
      // place on it.
      return [];
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
  return locatedCorners(path).map((corner) => corner.at);
}

/**
 * Where each corner is on the path's own structure, in anchor order: at a
 * point, or on the arc that rounds it.
 *
 * What lets an anchor survive an edit to a drawn path. A stitch run names
 * "corner 2"; after a point is added before it, that corner is the fourth, and
 * the only safe way to know is to follow the point or arc it sits on through
 * the edit — never to look for the nearest corner afterwards (ADR 0010).
 */
export type CornerSite =
  | { readonly kind: 'vertex'; readonly index: number }
  | { readonly kind: 'arc'; readonly segment: number };

export function cornerSites(path: Path): readonly CornerSite[] {
  return locatedCorners(path).map((corner) => corner.site);
}

/**
 * For each corner of `before`, its index among the corners of the edited
 * path, or `null` when the edit took it away — removed its point, split its
 * arc, or straightened it.
 *
 * A corner the edit *made* takes an index of its own and moves the ones after
 * it along; they still map to the corners they were.
 */
export function cornersThroughEdit(before: Path, edit: PathEdit): readonly (number | null)[] {
  const after = cornerSites(edit.path);
  const key = (site: CornerSite): string =>
    site.kind === 'vertex' ? `v${String(site.index)}` : `a${String(site.segment)}`;
  const indexAfter = new Map(after.map((site, k) => [key(site), k] as const));

  return cornerSites(before).map((site) => {
    const moved = siteThrough(site, edit);
    return moved === null ? null : (indexAfter.get(key(moved)) ?? null);
  });
}

/** The site a corner's point or arc became, or `null` if the edit took it. */
function siteThrough(site: CornerSite, edit: PathEdit): CornerSite | null {
  // A corner rounded or sharpened is the same corner in a new shape (3.9d):
  // the point became the arc that rounds it, or the arc the point.
  const reshaped = edit.reshaped;
  if (
    reshaped?.kind === 'rounded' &&
    site.kind === 'vertex' &&
    site.index === reshaped.fromVertex
  ) {
    return { kind: 'arc', segment: reshaped.toSegment };
  }
  if (
    reshaped?.kind === 'sharpened' &&
    site.kind === 'arc' &&
    site.segment === reshaped.fromSegment
  ) {
    return { kind: 'vertex', index: reshaped.toVertex };
  }
  if (site.kind === 'vertex') {
    const index = edit.vertexMap[site.index] ?? null;
    return index === null ? null : { kind: 'vertex', index };
  }
  const segment = edit.segmentMap[site.segment] ?? null;
  return segment === null ? null : { kind: 'arc', segment };
}

interface LocatedCorner {
  readonly at: Mm;
  readonly site: CornerSite;
}

function locatedCorners(path: Path): readonly LocatedCorner[] {
  const segments = path.segments;
  if (segments.length === 0) return [];

  const lengths = segments.map((s) => SegmentOps.length(s));
  const starts: Mm[] = [];
  let cumulative = 0;
  for (const l of lengths) {
    starts.push(cumulative);
    cumulative += l;
  }

  const corners: LocatedCorner[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;

    // A rounded corner: an arc with a straight on each side. On a circle both
    // neighbours are the arc itself, which is how a circle reports none.
    if (segment.kind === 'arc') {
      const before = neighbour(segments, i - 1, path.closed);
      const after = neighbour(segments, i + 1, path.closed);
      if (before?.kind === 'line' && after?.kind === 'line') {
        corners.push({ at: starts[i]! + lengths[i]! / 2, site: { kind: 'arc', segment: i } });
      }
      continue;
    }

    // A sharp corner: the tangent jumps between this segment and the next.
    const next = neighbour(segments, i + 1, path.closed);
    if (next === undefined) continue;

    const turn = SegmentOps.tangentAt(segment, 1);
    const onward = SegmentOps.tangentAt(next, 0);
    if (!approxZero(turn.x * onward.y - turn.y * onward.x, EPS_ANGLE)) {
      // The point at the end of segment i, which on a closed path's last
      // segment is its first point.
      corners.push({
        at: starts[i]! + lengths[i]!,
        site: { kind: 'vertex', index: path.closed && i === segments.length - 1 ? 0 : i + 1 },
      });
    }
  }

  return corners.sort((a, b) => a.at - b.at);
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
