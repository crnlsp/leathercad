import { approxLte, approxZero, EPS_ANGLE, EPS_PARAM, EPS_POINT } from '@leathercad/core';

import { flattenSegment, type Path } from '../path/index.js';
import {
  ArcOps,
  bbox,
  pointAt,
  type ArcSegment,
  type LineSegment,
  type Segment,
} from '../segment/index.js';
import { rootsInUnitInterval, solveQuadratic } from '../polynomial.js';
import type { Rect } from '../rect.js';
import { EXPORT_TOLERANCE_MM } from '../tolerance.js';
import { add, cross, dist, dot, lenSq, scale, sub, type Vec2 } from '../vec2.js';

/** A point where two curves meet, with the parameter on each. */
export interface Intersection {
  readonly point: Vec2;
  /**
   * Parameter on the first curve. On a segment this is `0..1`. On a path the
   * integer part is the segment index and the fraction is the parameter
   * within it, so `2.5` is halfway along the third segment.
   */
  readonly tA: number;
  readonly tB: number;
}

/**
 * Where two segments meet.
 *
 * Analytic for line/line, line/arc and arc/arc — the common cases, and exact.
 * Anything involving a cubic is located on the flattened polylines and then
 * polished by Newton iteration on the true parametric forms, so the returned
 * point sits on both curves rather than on their approximations.
 *
 * Collinear overlapping segments have infinitely many intersections; the
 * overlap endpoints are returned instead, which is the only finite answer that
 * loses nothing. See docs/geometry.md §7.
 */
export function intersectSegments(a: Segment, b: Segment): Intersection[] {
  // De-duplicated here rather than in each branch, so a segment and a path
  // report the same crossing count for the same geometry. A collinear overlap
  // shorter than EPS_POINT is one point, not two.
  const out: Intersection[] = [];
  for (const hit of dispatch(a, b)) push(out, hit);
  return out;
}

function dispatch(a: Segment, b: Segment): Intersection[] {
  if (a.kind === 'line' && b.kind === 'line') return lineLine(a, b);
  if (a.kind === 'line' && b.kind === 'arc') return lineArc(a, b, false);
  if (a.kind === 'arc' && b.kind === 'line') return lineArc(b, a, true);
  if (a.kind === 'arc' && b.kind === 'arc') return arcArc(a, b);

  return refined(a, b);
}

/** Where two paths meet, with segment indices in the parameters' integer parts. */
export function intersectPaths(a: Path, b: Path): Intersection[] {
  const out: Intersection[] = [];

  for (let i = 0; i < a.segments.length; i++) {
    const sa = a.segments[i]!;
    const ba = bbox(sa);

    for (let j = 0; j < b.segments.length; j++) {
      const sb = b.segments[j]!;
      // Cheap rejection first: most segment pairs on two real outlines are
      // nowhere near each other.
      if (!boxesOverlap(ba, bbox(sb))) continue;

      for (const hit of intersectSegments(sa, sb)) {
        push(out, { point: hit.point, tA: i + hit.tA, tB: j + hit.tB });
      }
    }
  }

  return out;
}

/**
 * Where a path crosses itself.
 *
 * Consecutive segments share a vertex by construction, and a closed path's
 * last and first do too. Reporting those would make every path
 * self-intersecting, so neighbours are skipped.
 */
export function selfIntersections(p: Path): Intersection[] {
  const out: Intersection[] = [];
  const n = p.segments.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Neighbours: j always exceeds i, so `j <= i + 1` is "the next segment",
      // and on a closed path the first and last meet too. Written as
      // inequalities because the float-equality rule cannot tell an array
      // index from a millimetre, and it is right to be suspicious by default.
      const adjacent = j <= i + 1 || (p.closed && i < 1 && j >= n - 1);
      if (adjacent) continue;

      for (const hit of intersectSegments(p.segments[i]!, p.segments[j]!)) {
        push(out, { point: hit.point, tA: i + hit.tA, tB: j + hit.tB });
      }
    }
  }

  return out;
}

/**
 * Line against line, symmetric by construction.
 *
 * Every tolerance below is a threshold, and a quantity computed from `a`'s
 * side lands on the other side of it from the same quantity computed from
 * `b`'s often enough for fast-check to find (Q1). Solving the pair in one
 * canonical order and swapping the parameters back makes `(a, b)` and
 * `(b, a)` the same arithmetic, so they cannot disagree.
 */
function lineLine(a: LineSegment, b: LineSegment): Intersection[] {
  if (!precedes(a, b))
    return lineLineOrdered(b, a).map(({ point, tA, tB }) => ({ point, tA: tB, tB: tA }));
  return lineLineOrdered(a, b);
}

/**
 * A total order on lines by their coordinates. Exact comparison, not
 * tolerant: it only picks which argument goes first, and two lines equal in
 * every bit give the same answer in either order anyway.
 */
function precedes(a: LineSegment, b: LineSegment): boolean {
  const ka = [a.a.x, a.a.y, a.b.x, a.b.y];
  const kb = [b.a.x, b.a.y, b.b.x, b.b.y];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i]! < kb[i]!) return true;
    if (ka[i]! > kb[i]!) return false;
  }
  return true;
}

function lineLineOrdered(a: LineSegment, b: LineSegment): Intersection[] {
  const r = sub(a.b, a.a);
  const s = sub(b.b, b.a);
  const toB = sub(b.a, a.a);
  const lengthR = Math.hypot(r.x, r.y);
  const lengthS = Math.hypot(s.x, s.y);
  if (approxZero(lengthR, EPS_POINT) || approxZero(lengthS, EPS_POINT)) return [];

  // The cross product is an area, so testing it against a length epsilon is
  // dimensionally wrong and makes the parallel test depend on how big the
  // segments happen to be. Dividing by both lengths gives the sine of the
  // angle between them, which is scale-invariant and stable under a rigid
  // transform.
  const denominator = cross(r, s);
  const sine = denominator / (lengthR * lengthS);

  if (!approxZero(sine, EPS_ANGLE)) {
    const tA = cross(toB, s) / denominator;
    const tB = cross(toB, r) / denominator;

    if (!inUnit(tA) || !inUnit(tB)) return [];
    return [{ point: pointAt(a, clamp01(tA)), tA: clamp01(tA), tB: clamp01(tB) }];
  }

  // Parallel. Collinear only if each segment lies on the other's line —
  // *both* distances, not one. Measuring only b's start against a's line is
  // asymmetric: with segments of very different lengths, the deviation
  // extrapolated along the longer one crosses the epsilon while the shorter
  // one does not, and intersectSegments(a, b) then disagrees with
  // intersectSegments(b, a). fast-check found the pair.
  const offA = Math.abs(cross(toB, r) / lengthR);
  const offB = Math.abs(cross(sub(a.a, b.a), s) / lengthS);
  if (!approxZero(Math.max(offA, offB), EPS_POINT)) return [];

  // Project both spans onto a and intersect the intervals.
  const lengthSq = lenSq(r);

  const t0 = dot(toB, r) / lengthSq;
  const t1 = dot(sub(b.b, a.a), r) / lengthSq;
  const low = Math.max(0, Math.min(t0, t1));
  const high = Math.min(1, Math.max(t0, t1));

  // The overlap's length in millimetres: negative is a gap. Measured against
  // EPS_POINT, not as a parameter against EPS_PARAM — a parameter is a
  // fraction of a's length, so the same 1e-8 mm gap was a touch on a 100 mm
  // line and a miss on a 0.1 mm one.
  const overlap = (high - low) * lengthR;
  if (overlap < -EPS_POINT) return [];

  const at = (t: number): Intersection => ({
    point: pointAt(a, t),
    tA: t,
    tB: parameterOnLine(b, pointAt(a, t)),
  });

  // Touching end to end, or a gap too small to be one, is one point, not a
  // zero-length overlap.
  return approxLte(overlap, 0, EPS_POINT)
    ? [at(clamp01(Math.min(low, high)))]
    : [at(low), at(high)];
}

function lineArc(l: LineSegment, a: ArcSegment, swap: boolean): Intersection[] {
  const d = sub(l.b, l.a);
  const f = sub(l.a, a.centre);

  // |l(t) - centre|² = r², a quadratic in t.
  const roots = rootsInUnitInterval(
    solveQuadratic(lenSq(d), 2 * dot(f, d), lenSq(f) - a.radius * a.radius),
  );

  const out: Intersection[] = [];
  for (const t of roots) {
    const point = pointAt(l, t);
    const angle = Math.atan2(point.y - a.centre.y, point.x - a.centre.x);
    if (!ArcOps.containsAngle(a, angle)) continue;

    const tArc = parameterOnArc(a, angle);
    push(out, swap ? { point, tA: tArc, tB: t } : { point, tA: t, tB: tArc });
  }

  return out;
}

function arcArc(a: ArcSegment, b: ArcSegment): Intersection[] {
  const between = sub(b.centre, a.centre);
  const centreDistance = Math.hypot(between.x, between.y);

  // Concentric circles either coincide everywhere or nowhere; neither is a
  // finite set of crossings.
  if (approxZero(centreDistance, EPS_POINT)) return [];

  const sum = a.radius + b.radius;
  const difference = Math.abs(a.radius - b.radius);
  if (centreDistance > sum + EPS_POINT || centreDistance < difference - EPS_POINT) return [];

  // Distance from a's centre to the radical line, then the half-chord.
  const along =
    (centreDistance * centreDistance - b.radius * b.radius + a.radius * a.radius) /
    (2 * centreDistance);
  const halfChordSq = a.radius * a.radius - along * along;

  const unit = scale(between, 1 / centreDistance);
  const foot = add(a.centre, scale(unit, along));

  // Tangency: one point, and the fragile case — a negative half-chord here is
  // rounding noise around zero, not a miss.
  const candidates: Vec2[] =
    halfChordSq <= EPS_POINT
      ? [foot]
      : [
          add(foot, vec2(-unit.y, unit.x, Math.sqrt(halfChordSq))),
          add(foot, vec2(unit.y, -unit.x, Math.sqrt(halfChordSq))),
        ];

  const out: Intersection[] = [];
  for (const point of candidates) {
    const angleA = Math.atan2(point.y - a.centre.y, point.x - a.centre.x);
    const angleB = Math.atan2(point.y - b.centre.y, point.x - b.centre.x);
    if (!ArcOps.containsAngle(a, angleA) || !ArcOps.containsAngle(b, angleB)) continue;

    push(out, { point, tA: parameterOnArc(a, angleA), tB: parameterOnArc(b, angleB) });
  }

  return out;
}

/**
 * Flatten to find candidates, then polish each on the true curves.
 *
 * The flattened crossing is only as accurate as the tolerance; Newton on the
 * parametric forms brings it below EPS_POINT, which is what makes the result
 * usable for trimming rather than merely for detection.
 */
function refined(a: Segment, b: Segment): Intersection[] {
  // The export tolerance is the budget for locating candidates; Newton then
  // polishes each one to EPS_POINT on the true curves, so this only has to be
  // fine enough not to miss a crossing.
  const flatA = flattenSegment(a, EXPORT_TOLERANCE_MM);
  const flatB = flattenSegment(b, EXPORT_TOLERANCE_MM);

  const out: Intersection[] = [];
  for (let i = 0; i < flatA.length - 1; i++) {
    for (let j = 0; j < flatB.length - 1; j++) {
      const guess = lineLine(
        { kind: 'line', a: flatA[i]!, b: flatA[i + 1]! },
        { kind: 'line', a: flatB[j]!, b: flatB[j + 1]! },
      );
      if (guess.length === 0) continue;

      const tA = (i + guess[0]!.tA) / (flatA.length - 1);
      const tB = (j + guess[0]!.tB) / (flatB.length - 1);
      const polished = newton(a, b, tA, tB);
      if (polished !== undefined) push(out, polished);
    }
  }

  return out;
}

/** Two-dimensional Newton on A(tA) − B(tB) = 0. */
function newton(a: Segment, b: Segment, startA: number, startB: number): Intersection | undefined {
  let tA = startA;
  let tB = startB;

  for (let step = 0; step < 24; step++) {
    const pa = pointAt(a, tA);
    const pb = pointAt(b, tB);
    const error = sub(pa, pb);

    if (Math.hypot(error.x, error.y) < EPS_POINT / 10) {
      return { point: pa, tA: clamp01(tA), tB: clamp01(tB) };
    }

    // J = [A'(tA), −B'(tB)]; solve J·Δ = −error.
    const da = derivative(a, tA);
    const db = derivative(b, tB);
    const determinant = cross(da, scale(db, -1));
    if (approxZero(determinant, EPS_PARAM)) return undefined;

    // Clamped rather than abandoned. Flattening is adaptive, so the starting
    // parameter derived from a vertex index is only roughly right, and the
    // first step routinely overshoots the end of the curve on the way to a
    // crossing that is genuinely there. Bailing on that lost every
    // cubic intersection.
    tA = clamp01(tA - cross(error, scale(db, -1)) / determinant);
    tB = clamp01(tB - cross(da, error) / determinant);
  }

  // Ran out of iterations without the two points meeting: the flattened
  // candidate was a near miss, not a crossing.
  return undefined;
}

/**
 * The true derivative with respect to `t`, by central difference.
 *
 * Not `tangentAt`, which returns a *unit* tangent: Newton needs the actual
 * rate of change, and on a 20 mm line those differ by a factor of twenty.
 * Using the unit tangent made every step overshoot and no cubic intersection
 * ever converged.
 */
function derivative(s: Segment, t: number): Vec2 {
  const h = 1e-6;
  const lo = Math.max(0, t - h);
  const hi = Math.min(1, t + h);

  return scale(sub(pointAt(s, hi), pointAt(s, lo)), 1 / (hi - lo));
}

function parameterOnArc(a: ArcSegment, angle: number): number {
  let delta = angle - a.startAngle;
  // Bring the difference onto the same turn as the sweep.
  while (delta * Math.sign(a.sweepAngle) < 0) delta += Math.sign(a.sweepAngle) * Math.PI * 2;
  return clamp01(delta / a.sweepAngle);
}

function parameterOnLine(l: LineSegment, p: Vec2): number {
  const r = sub(l.b, l.a);
  const lengthSq = lenSq(r);
  return approxZero(lengthSq, EPS_POINT) ? 0 : clamp01(dot(sub(p, l.a), r) / lengthSq);
}

/** Adds a crossing unless one is already recorded at the same place. */
function push(out: Intersection[], hit: Intersection): void {
  if (out.some((h) => dist(h.point, hit.point) < EPS_POINT)) return;
  out.push(hit);
}

function boxesOverlap(a: Rect, b: Rect): boolean {
  return (
    a.minX <= b.maxX + EPS_POINT &&
    b.minX <= a.maxX + EPS_POINT &&
    a.minY <= b.maxY + EPS_POINT &&
    b.minY <= a.maxY + EPS_POINT
  );
}

const inUnit = (t: number): boolean => t >= -EPS_PARAM && t <= 1 + EPS_PARAM;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const vec2 = (x: number, y: number, s: number): Vec2 => ({ x: x * s, y: y * s });
