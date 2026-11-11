import { EPS_LENGTH, EPS_POINT, approxEq } from '@leathercad/core';
import {
  PathOps,
  SegmentOps,
  dist,
  dot,
  sub,
  selfIntersections,
  type Path,
  type Vec2,
} from '@leathercad/geometry';

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
