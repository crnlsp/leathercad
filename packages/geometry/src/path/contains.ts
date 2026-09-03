import { solveCubic } from '../polynomial.js';
import * as Seg from '../segment/index.js';
import { closestPointOnSegment, type Vec2 } from '../vec2.js';
import type { Path } from './path.js';

export type FillRule = 'nonzero' | 'evenodd';

/**
 * The winding number of the path around a point.
 *
 * Computed by casting a ray in +X and summing signed crossings: +1 where the
 * path crosses upward, −1 downward. Exact for every segment kind — arcs are
 * solved trigonometrically and cubics by root-finding, so nothing is
 * flattened and no tolerance enters.
 *
 * A point exactly on the path has no well-defined answer; use
 * `isPointOnPath` for that question instead.
 */
export function windingNumber(p: Path, point: Vec2): number {
  for (const nudge of RAY_NUDGES) {
    const probe = { x: point.x, y: point.y + nudge };
    const result = windingAlongRay(p, probe);
    if (result !== null) return result;
  }
  return 0;
}

/**
 * How far a curve crossing must sit from a segment boundary to be trusted.
 *
 * Well below the 1e-4 mm storage quantum, so real geometry never trips it —
 * only exact hits do.
 */
const RAY_AMBIGUITY = 1e-9;

/**
 * Ray heights to try, in order.
 *
 * The first is the point itself. The rest exist because a ray can land exactly
 * on a curve's seam or a tangent, where rounding rather than geometry decides
 * the answer. Nudging the ray resolves it: the winding number is constant
 * everywhere except on the boundary, and a point *on* the boundary has no
 * defined answer anyway.
 *
 * This is not hypothetical. A circle's arc conventionally starts at angle 0,
 * and asking whether its own centre is inside casts a ray straight through
 * that seam — the most ordinary query there is.
 */
const RAY_NUDGES = [0, 1e-9, -1e-9, 1e-6, -1e-6] as const;

/** Null when the ray grazes something and the count cannot be trusted. */
function windingAlongRay(p: Path, point: Vec2): number | null {
  let winding = 0;

  for (const segment of p.segments) {
    const crossings = segmentCrossings(segment, point);
    if (crossings === null) return null;
    winding += crossings;
  }

  // An open path is treated as closed by a straight chord, matching signedArea.
  if (!p.closed && p.segments.length > 0) {
    const last = Seg.end(p.segments[p.segments.length - 1]!);
    const first = Seg.start(p.segments[0]!);
    winding += lineCrossing(last, first, point);
  }

  return winding;
}

/**
 * Whether the point lies inside the region the path encloses.
 *
 * Defaults to the **non-zero** rule, matching SVG's and PDF's default, so that
 * what the screen shows, what gets exported and what the geometry engine
 * computes all agree.
 */
export function containsPoint(p: Path, point: Vec2, rule: FillRule = 'nonzero'): boolean {
  const winding = windingNumber(p, point);
  // A winding number is an integer count of crossings, not a measurement,
  // so exact comparison is correct here.
  // eslint-disable-next-line no-restricted-syntax
  return rule === 'nonzero' ? winding !== 0 : winding % 2 !== 0;
}

function segmentCrossings(s: Seg.Segment, point: Vec2): number | null {
  switch (s.kind) {
    case 'line':
      // The half-open rule already resolves shared vertices deterministically,
      // so a line is never ambiguous.
      return lineCrossing(s.a, s.b, point);
    case 'arc':
      return arcCrossings(s, point);
    case 'cubic':
      return cubicCrossings(s, point);
  }
}

/**
 * Half-open in y: a crossing counts when the ray's height is in `[y0, y1)`.
 *
 * That convention is what stops a vertex shared by two segments being counted
 * twice, which would otherwise flip inside to outside along every horizontal
 * line through a vertex.
 */
function lineCrossing(a: Vec2, b: Vec2, point: Vec2): number {
  const upward = a.y <= point.y && b.y > point.y;
  const downward = b.y <= point.y && a.y > point.y;
  if (!upward && !downward) return 0;

  const t = (point.y - a.y) / (b.y - a.y);
  const x = a.x + t * (b.x - a.x);
  if (x <= point.x) return 0;

  return upward ? 1 : -1;
}

function arcCrossings(s: Seg.ArcSegment, point: Vec2): number | null {
  if (s.radius <= 0) return 0;

  const sine = (point.y - s.centre.y) / s.radius;
  if (sine < -1 || sine > 1) return 0;

  const base = Math.asin(Math.min(1, Math.max(-1, sine)));
  // Both angles on the circle at this height, and their 2π translates, since
  // the arc's own angles are unnormalised.
  const candidates = [base, Math.PI - base];

  let winding = 0;
  for (const candidate of candidates) {
    for (let turn = -2; turn <= 2; turn++) {
      const angle = candidate + turn * Math.PI * 2;

      const position = sweepPosition(s, angle);
      if (position === 'ambiguous') return null;
      if (position === 'outside') continue;

      const x = s.centre.x + Math.cos(angle) * s.radius;
      if (x <= point.x) continue;

      // dy/dθ = r·cosθ, travelled in the direction of the sweep.
      const direction = Math.cos(angle) * Math.sign(s.sweepAngle);
      if (Math.abs(direction) < RAY_AMBIGUITY) return null; // grazes the extreme
      winding += direction > 0 ? 1 : -1;
    }
  }
  return winding;
}

/**
 * Where an angle sits relative to the arc's sweep.
 *
 * Half-open, for the same reason `lineCrossing` is half-open in y: a shared
 * endpoint must be counted by one segment only. Angles landing on either
 * boundary report `ambiguous` so the caller can re-cast the ray, because at
 * the boundary floating-point rounding rather than geometry decides which side
 * they fall on.
 */
function sweepPosition(s: Seg.ArcSegment, angle: number): 'inside' | 'outside' | 'ambiguous' {
  const sweep = s.sweepAngle;
  const delta = angle - s.startAngle;

  if (Math.abs(delta) < RAY_AMBIGUITY || Math.abs(delta - sweep) < RAY_AMBIGUITY) {
    return 'ambiguous';
  }

  if (sweep >= 0) return delta > 0 && delta < sweep ? 'inside' : 'outside';
  return delta < 0 && delta > sweep ? 'inside' : 'outside';
}

function cubicCrossings(s: Seg.CubicSegment, point: Vec2): number | null {
  // y(t) − point.y = 0, expanded from the Bernstein basis into powers of t.
  const y0 = s.p0.y - point.y;
  const y1 = s.p1.y - point.y;
  const y2 = s.p2.y - point.y;
  const y3 = s.p3.y - point.y;

  const a = -y0 + 3 * y1 - 3 * y2 + y3;
  const b = 3 * y0 - 6 * y1 + 3 * y2;
  const c = -3 * y0 + 3 * y1;
  const d = y0;

  let winding = 0;
  for (const t of solveCubic(a, b, c, d)) {
    // Half-open in t, so a shared endpoint is counted by one segment only.
    // A root sitting on either boundary is decided by rounding, not geometry.
    if (Math.abs(t) < RAY_AMBIGUITY || Math.abs(t - 1) < RAY_AMBIGUITY) return null;
    if (t < 0 || t > 1) continue;

    const x = Seg.CubicOps.pointAt(s, t).x;
    if (x <= point.x) continue;

    const slope = Seg.CubicOps.derivativeAt(s, t).y;
    // A tangent touch does not change the winding, but a near-tangent crossing
    // does — and the two are indistinguishable here. Let the caller re-cast.
    if (Math.abs(slope) < RAY_AMBIGUITY) return null;
    winding += slope > 0 ? 1 : -1;
  }
  return winding;
}

/** Distance-based test, for "did the user click the line" rather than "inside". */
export function isPointOnPath(p: Path, point: Vec2, tolerance: number): boolean {
  return p.segments.some((s) => distanceToSegment(s, point) <= tolerance);
}

function distanceToSegment(s: Seg.Segment, point: Vec2): number {
  // Exact for a line. Sampling its endpoints would miss a click in the middle
  // of a long one entirely.
  if (s.kind === 'line') {
    const closest = closestPointOnSegment(point, s.a, s.b);
    return Math.hypot(closest.x - point.x, closest.y - point.y);
  }

  // Sampling is adequate for curves: the caller supplies a pick tolerance
  // derived from a ~10 px radius, orders of magnitude above the sampling
  // error at any usable zoom.
  const samples = 64;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= samples; i++) {
    const p = Seg.pointAt(s, i / samples);
    best = Math.min(best, Math.hypot(p.x - point.x, p.y - point.y));
  }
  return best;
}
