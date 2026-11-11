import { EPS_LENGTH, EPS_POINT, approxEq, type Mm } from '@leathercad/core';
import {
  PathOps,
  SegmentOps,
  dist,
  dot,
  intersectPaths,
  line,
  scale,
  sub,
  selfIntersections,
  type Path,
  type Vec2,
} from '@leathercad/geometry';

import type { PocketContent } from './feature.js';

export interface PocketSize {
  readonly widthMm: number;
  readonly depthMm: number;
}

/**
 * Stitch-centre dimensions of an open U with two straight side runs.
 * Width is the narrowest gap parallel to the endpoint chord over the sides'
 * shared depth. Bottom turns do not count as side runs. Depth is perpendicular
 * to that chord, to the farthest stitching (not to the leather's opening).
 *
 * Curved sides, crossing sides, a bottom returning above the side ends, closed
 * or degenerate paths return null: none has an unambiguous reading by this
 * rule. Collinear subdivision, reversal and rigid transforms change nothing.
 * Takes a validated geometry Path; inputs are never modified.
 */
export function pocketSize(source: Path): PocketSize | null {
  const frame = chordFrame(source);
  if (frame === null) return null;
  const { local, chord } = frame;
  const left = sideEnd(local);
  const right = sideEnd(PathOps.reverse(local));
  if (left === null || right === null) return null;
  const sharedDepth = Math.min(left.point.y, right.point.y);
  if (sharedDepth <= EPS_LENGTH) return null;
  // Straight sides give an affine gap: its minimum is at one of the ends.
  const bottomGap =
    chord +
    ((right.point.x - chord) * sharedDepth) / right.point.y -
    (left.point.x * sharedDepth) / left.point.y;
  const widthMm = Math.min(chord, bottomGap);
  if (widthMm <= EPS_LENGTH) return null;
  const bottom = local.segments.slice(left.count, local.segments.length - right.count);
  if (bottom.length === 0) return null;
  const bounds = PathOps.bbox(PathOps.open(bottom));
  if (bounds === null || bounds.minY < sharedDepth - EPS_POINT) return null;
  if (
    bounds.minX < Math.min(left.point.x, right.point.x) - EPS_POINT ||
    bounds.maxX > Math.max(left.point.x, right.point.x) + EPS_POINT ||
    selfIntersections(local).length > 0
  )
    return null;
  return { widthMm, depthMm: bounds.maxY };
}

/**
 * The stitching in its own frame: x along the endpoint chord, y from the
 * chord toward the first side's far end — into the pocket — with the start at
 * the origin. Null for a closed, too short or degenerate path, or one that
 * does not leave its start along a line.
 */
function chordFrame(
  source: Path,
): { local: Path; chord: Mm; start: Vec2; end: Vec2; into: Vec2 } | null {
  if (source.closed || source.segments.length < 3) return null;
  // Geometry treats segments below EPS_LENGTH as degenerate.
  const path = PathOps.open(
    source.segments.filter((segment) => SegmentOps.length(segment) > EPS_LENGTH),
  );
  const start = PathOps.start(path);
  const end = PathOps.end(path);
  if (start === null || end === null) return null;
  const chord = dist(start, end);
  if (chord <= EPS_LENGTH) return null;
  const x = { x: (end.x - start.x) / chord, y: (end.y - start.y) / chord };
  const first = path.segments[0];
  if (first === undefined || first.kind !== 'line') return null;
  const toward = sub(first.b, first.a);
  const sign = dot(toward, { x: -x.y, y: x.x }) < 0 ? -1 : 1;
  const y = { x: -x.y * sign, y: x.x * sign };
  const local = PathOps.transform(path, {
    a: x.x,
    c: x.y,
    e: -dot(start, x),
    b: y.x,
    d: y.y,
    f: -dot(start, y),
  });
  return { local, chord, start, end, into: y };
}

/** ID-1 (ISO/IEC 7810), a payment card, landscape: across the opening, then into the pocket. */
export const ID1_CARD = { widthMm: 85.6, heightMm: 53.98 } as const;

/** The size a pocket's content needs before ease: across the opening, then into the pocket. */
export function contentSize(content: PocketContent): { widthMm: Mm; heightMm: Mm } {
  switch (content.kind) {
    case 'id-1':
      return ID1_CARD;
    case 'size':
      return { widthMm: content.widthMm, heightMm: content.heightMm };
  }
}

/**
 * Depth from the pocket's opening to the farthest stitching, perpendicular to
 * the endpoint chord (9.14b) — what a card held fully must fit below.
 *
 * The opening is found on the leather, never assumed at the stitch ends: from
 * each stitch end, straight out of the pocket (square to the chord), to where
 * the outline ends the leather. The lower of the two is the opening, so a
 * pocket cut lower on one side holds no more than that side allows. A thumb
 * scoop between the sides does not lower it; one that reaches over a side
 * does. A stitch end on the edge is its own opening.
 *
 * Null when the stitching has no `pocketSize`, when a stitch end lies off the
 * outline's material, or when the leather does not end above it (an open
 * outline). Cut-outs are not read: the outline is what makes an opening.
 * Rigid transforms and walking the stitching backwards change nothing.
 */
export function depthBelowOpening(stitch: Path, outline: Path): Mm | null {
  const size = pocketSize(stitch);
  const frame = chordFrame(stitch);
  const bounds = PathOps.bbox(outline);
  if (size === null || frame === null || bounds === null || !outline.closed) return null;
  // Long enough to leave the outline's box from anywhere inside it.
  const reach = bounds.maxX - bounds.minX + (bounds.maxY - bounds.minY) + 1;
  const riseAbove = (end: Vec2): Mm | null => {
    if (PathOps.isPointOnPath(outline, end, EPS_POINT)) return 0;
    if (!PathOps.containsPoint(outline, end)) return null;
    const ray = PathOps.open([line(end, sub(end, scale(frame.into, reach)))]);
    const hits = intersectPaths(ray, outline).map((hit) => dist(end, hit.point));
    // A ray from inside a closed outline always leaves it; kept so the function stays total.
    return hits.length === 0 ? null : Math.min(...hits);
  };
  const left = riseAbove(frame.start);
  const right = riseAbove(frame.end);
  if (left === null || right === null) return null;
  return size.depthMm + Math.min(left, right);
}

/** Merge the maximal straight run from an endpoint, independent of segmentation. */
function sideEnd(path: Path): { point: Vec2; count: number } | null {
  const first = path.segments[0];
  if (first === undefined || first.kind !== 'line') return null;
  const start = first.a;
  const delta = sub(first.b, start);
  const length = Math.hypot(delta.x, delta.y);
  if (length <= EPS_LENGTH || delta.y <= EPS_LENGTH) return null;
  const direction = { x: delta.x / length, y: delta.y / length };
  let point = first.b;
  let count = 1;
  for (const segment of path.segments.slice(1)) {
    if (segment.kind !== 'line') break;
    const end = SegmentOps.end(segment);
    const fromStart = sub(end, start);
    const offLine = fromStart.x * direction.y - fromStart.y * direction.x;
    if (!approxEq(offLine, 0, EPS_POINT) || end.y < point.y - EPS_POINT) break;
    point = end;
    count++;
  }
  return { point, count };
}
