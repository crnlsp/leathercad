import { EPS_ANGLE, EPS_POINT, approxZero, type Mm } from '@leathercad/core';

import * as Seg from '../segment/index.js';
import { dist, lerp, vec, type Vec2 } from '../vec2.js';
import { SCREEN_TOLERANCE_MM } from '../tolerance.js';
import { unsafePath, type Path } from './path.js';

/**
 * Turns curves into polylines within a stated tolerance.
 *
 * Nearly every hard operation in the engine reduces to this — offsetting,
 * boolean ops, hit testing on curves, export to formats without curve
 * primitives.
 *
 * **Deterministic by construction.** The subdivision decisions depend only on
 * the input geometry and the tolerance, never on iteration order or floating
 * point accumulated elsewhere. Golden fixtures and byte-stable saves depend on
 * that, so the recursion below must stay free of any state.
 *
 * See docs/geometry.md §5.1.
 */

/** Guards against a degenerate curve subdividing forever. */
const MAX_DEPTH = 32;

/**
 * The largest angle a chord may span on a circle of `radius` while staying
 * within `tolerance` of the arc.
 *
 * From the sagitta: a chord subtending θ sits `r(1 − cos(θ/2))` below the arc
 * at its midpoint, so θ = 2·acos(1 − tolerance/radius).
 */
export function maxAngleStepForSagitta(radius: Mm, tolerance: Mm): number {
  if (radius <= 0 || tolerance <= 0) return Math.PI;
  if (tolerance >= radius) return Math.PI;
  return 2 * Math.acos(1 - tolerance / radius);
}

/** Points along one segment, including both endpoints. */
export function flattenSegment(s: Seg.Segment, tolerance: Mm = SCREEN_TOLERANCE_MM): Vec2[] {
  switch (s.kind) {
    case 'line':
      return [s.a, s.b];

    case 'arc': {
      if (s.radius <= 0 || approxZero(s.sweepAngle, EPS_ANGLE)) {
        return [Seg.start(s), Seg.end(s)];
      }

      const step = maxAngleStepForSagitta(s.radius, tolerance);
      const count = Math.max(1, Math.ceil(Math.abs(s.sweepAngle) / step - 1e-9));

      const points: Vec2[] = [];
      for (let i = 0; i <= count; i++) {
        const angle = s.startAngle + (s.sweepAngle * i) / count;
        points.push(
          vec(s.centre.x + Math.cos(angle) * s.radius, s.centre.y + Math.sin(angle) * s.radius),
        );
      }
      return points;
    }

    case 'cubic': {
      const points: Vec2[] = [s.p0];
      subdivideCubic(s.p0, s.p1, s.p2, s.p3, tolerance, 0, points);
      points.push(s.p3);
      return points;
    }
  }
}

/**
 * Whether the control polygon is flat enough to replace with its chord.
 *
 * The Sederberg bound: the curve never strays further from the chord than a
 * quarter of the largest control-point deviation. Cheap, conservative, and the
 * same test Skia and AGG use.
 */
function isFlatEnough(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: Mm): boolean {
  let ux = 3 * p1.x - 2 * p0.x - p3.x;
  let uy = 3 * p1.y - 2 * p0.y - p3.y;
  const vx = 3 * p2.x - 2 * p3.x - p0.x;
  const vy = 3 * p2.y - 2 * p3.y - p0.y;

  ux *= ux;
  uy *= uy;
  const vxs = vx * vx;
  const vys = vy * vy;

  if (vxs > ux) ux = vxs;
  if (vys > uy) uy = vys;

  return ux + uy <= 16 * tolerance * tolerance;
}

/** Appends interior points only; the caller supplies the endpoints. */
function subdivideCubic(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  tolerance: Mm,
  depth: number,
  out: Vec2[],
): void {
  if (depth >= MAX_DEPTH || isFlatEnough(p0, p1, p2, p3, tolerance)) return;

  const p01 = lerp(p0, p1, 0.5);
  const p12 = lerp(p1, p2, 0.5);
  const p23 = lerp(p2, p3, 0.5);
  const p012 = lerp(p01, p12, 0.5);
  const p123 = lerp(p12, p23, 0.5);
  const mid = lerp(p012, p123, 0.5);

  subdivideCubic(p0, p01, p012, mid, tolerance, depth + 1, out);
  out.push(mid);
  subdivideCubic(mid, p123, p23, p3, tolerance, depth + 1, out);
}

/**
 * The whole path as a point list, with coincident joins collapsed.
 *
 * For a closed path the repeated final point is dropped, matching `vertices`.
 */
export function flattenPath(p: Path, tolerance: Mm = SCREEN_TOLERANCE_MM): Vec2[] {
  const out: Vec2[] = [];

  for (const segment of p.segments) {
    for (const point of flattenSegment(segment, tolerance)) {
      const last = out[out.length - 1];
      if (last !== undefined && dist(last, point) <= EPS_POINT) continue;
      out.push(point);
    }
  }

  if (p.closed && out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (dist(first, last) <= EPS_POINT) out.pop();
  }

  return out;
}

/** The path rebuilt as straight segments. */
export function flattenToPolyline(p: Path, tolerance: Mm = SCREEN_TOLERANCE_MM): Path {
  const points = flattenPath(p, tolerance);
  if (points.length < 2) return unsafePath([], p.closed);

  const segments: Seg.Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push(Seg.line(points[i]!, points[i + 1]!));
  }
  if (p.closed) segments.push(Seg.line(points[points.length - 1]!, points[0]!));

  return unsafePath(segments, p.closed);
}
