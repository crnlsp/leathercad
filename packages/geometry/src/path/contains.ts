import { assertFinite, type Mm } from '@leathercad/core';

import { solveCubic } from '../polynomial.js';
import * as Seg from '../segment/index.js';
import type { Vec2 } from '../vec2.js';
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

/**
 * Shortest distance from a point to the path itself — the line, not the region
 * it encloses.
 *
 * Positive on both sides: how far a hole is from an edge does not depend on
 * which side of it the hole happens to be, and the caller already knows that
 * from `containsPoint`.
 *
 * Infinite for a path with no segments, which is the honest answer to "how far
 * is this from nothing".
 */
export function distanceToPath(p: Path, point: Vec2): Mm {
  let nearest = Number.POSITIVE_INFINITY;
  for (const s of p.segments) {
    const distance = distanceToSegment(s, point);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/**
 * The place on a path nearest a point: which segment, how far along it as
 * `t`, the point itself, and the distance.
 *
 * What an editing tool needs to put a new point where the pointer pressed an
 * edge — `distanceToPath` answers only how far. `null` for a path with no
 * segments. Where two segments are equally near, the earlier one wins, so
 * the answer is deterministic.
 */
export function closestPointOnPath(
  p: Path,
  point: Vec2,
): { segmentIndex: number; t: number; point: Vec2; distance: Mm } | null {
  assertFinite(point.x, 'closestPointOnPath point.x');
  assertFinite(point.y, 'closestPointOnPath point.y');

  let best: { segmentIndex: number; t: number; point: Vec2; distance: Mm } | null = null;
  for (const [segmentIndex, s] of p.segments.entries()) {
    const near = closestOnSegment(s, point);
    const distance = Math.hypot(near.point.x - point.x, near.point.y - point.y);
    if (best === null || distance < best.distance) {
      best = { segmentIndex, t: near.t, point: near.point, distance };
    }
  }
  return best;
}

function distanceToSegment(s: Seg.Segment, point: Vec2): number {
  const near = closestOnSegment(s, point).point;
  return Math.hypot(near.x - point.x, near.y - point.y);
}

/**
 * The nearest point of a segment, and its parameter.
 *
 * Exact for lines and arcs. Cubics are bracketed by a coarse sweep and then
 * narrowed by ternary search on the squared distance, which is unimodal
 * within a bracket.
 *
 * Sampling alone is not good enough even for hit testing: 64 samples on an
 * 8 mm quarter arc leave gaps of 0.2 mm, so the answer carries 0.1 mm of
 * error — larger than a stitch hole.
 */
function closestOnSegment(s: Seg.Segment, point: Vec2): { t: number; point: Vec2 } {
  switch (s.kind) {
    case 'line': {
      // Projected exactly even when the line is shorter than EPS_POINT: taking
      // one that short as only its start put the answer a hair from its other
      // end (issue 27), as the arc's centre once did. Only a line with no
      // length at all has no direction, and is its start.
      const along = { x: s.b.x - s.a.x, y: s.b.y - s.a.y };
      const lengthSq = along.x * along.x + along.y * along.y;
      const t =
        lengthSq > 0
          ? Math.min(
              1,
              Math.max(0, ((point.x - s.a.x) * along.x + (point.y - s.a.y) * along.y) / lengthSq),
            )
          : 0;
      return { t, point: Seg.pointAt(s, t) };
    }

    case 'arc': {
      const angle = Math.atan2(point.y - s.centre.y, point.x - s.centre.x);

      // If the point projects onto the swept part of the circle, the nearest
      // point is radially outward and exact. Even a hair from the centre has
      // a direction, and the centre itself — `atan2(0, 0)` is 0 — is equally
      // near everywhere, so any answer on the arc is right.
      if (Seg.ArcOps.containsAngle(s, angle)) {
        return { t: arcParameter(s, angle), point: Seg.pointAt(s, arcParameter(s, angle)) };
      }

      // Otherwise it is one of the two endpoints.
      const start = Seg.start(s);
      const end = Seg.end(s);
      const toStart = Math.hypot(start.x - point.x, start.y - point.y);
      const toEnd = Math.hypot(end.x - point.x, end.y - point.y);
      return toEnd < toStart ? { t: 1, point: end } : { t: 0, point: start };
    }

    case 'cubic': {
      const squaredAt = (t: number): number => {
        const p = Seg.CubicOps.pointAt(s, t);
        const dx = p.x - point.x;
        const dy = p.y - point.y;
        return dx * dx + dy * dy;
      };

      const coarse = 32;
      let bestIndex = 0;
      let bestValue = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= coarse; i++) {
        const value = squaredAt(i / coarse);
        if (value < bestValue) {
          bestValue = value;
          bestIndex = i;
        }
      }

      let low = Math.max(0, (bestIndex - 1) / coarse);
      let high = Math.min(1, (bestIndex + 1) / coarse);
      for (let i = 0; i < 40; i++) {
        const third = (high - low) / 3;
        const a = low + third;
        const b = high - third;
        if (squaredAt(a) < squaredAt(b)) high = b;
        else low = a;
      }

      const t = (low + high) / 2;
      return { t, point: Seg.CubicOps.pointAt(s, t) };
    }
  }
}

/** How far through an arc's sweep an angle lies, as `t` in `[0, 1]`. */
function arcParameter(s: Seg.ArcSegment, angle: number): number {
  let delta = (angle - s.startAngle) % Seg.FULL_TURN;
  if (s.sweepAngle >= 0 && delta < 0) delta += Seg.FULL_TURN;
  if (s.sweepAngle < 0 && delta > 0) delta -= Seg.FULL_TURN;
  return Math.min(1, Math.max(0, delta / s.sweepAngle));
}
