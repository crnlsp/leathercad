import {
  approxEq,
  approxZero,
  assertFinite,
  EPS_ANGLE,
  EPS_POINT,
  invariant,
  type Mm,
} from '@leathercad/core';

import { path as makePath, signedArea, type Path } from '../path/index.js';
import {
  arc,
  end,
  line,
  start,
  tangentAt,
  type ArcSegment,
  type LineSegment,
  type Segment,
} from '../segment/index.js';
import { add, cross, dot, perp, scale, sub, tryNormalise, type Vec2 } from '../vec2.js';

export interface OffsetOptions {
  /** How a gap at a corner is bridged. Only `round` exists so far. */
  readonly join: 'round';
}

/**
 * Offsets a closed path by a signed distance — positive to the **left** of the
 * direction of travel. On a counter-clockwise ring that is inward.
 *
 * Inward and outward are domain concepts: they need the winding of the
 * contour, which the domain layer normalises before converting to a sign.
 * Geometry stays direction-based. See docs/geometry.md §6.4.
 *
 * Returns `Path[]` because an offset genuinely produces nothing when the shape
 * collapses. The empty array is the answer, not an error — the domain layer
 * turns it into a validation message the user can act on. Several paths, from
 * a narrow waist pinching apart, can only happen on a non-convex path, which
 * this tier rejects.
 *
 * **This is Tier 1 from docs/geometry.md §6.2: analytic and exact.** A line
 * offsets to a parallel line and an arc to a concentric one, so a rounded
 * rectangle's stitch line is still a rounded rectangle rather than a polyline
 * approximation of one. Nothing is flattened and no tolerance is involved.
 *
 * It handles **convex closed paths of lines and arcs**. That covers the shapes
 * the product is built from — rectangles, rounded rectangles, circles — and
 * refuses everything else rather than guessing:
 *
 * - an open path, whose parallel curve needs different end handling;
 * - a cubic, which has no exact offset (the offset of a cubic is not a cubic);
 * - a non-convex path, where the offset can self-intersect globally even
 *   though every individual join is correct. Detecting and pruning that is
 *   what Tier 2 and Clipper are for.
 */
export function offsetPath(p: Path, distanceMm: Mm, opts: OffsetOptions): Path[] {
  const d = assertFinite(distanceMm, 'distanceMm');

  invariant(opts.join === 'round', `unsupported join ${opts.join}`);

  if (!p.closed) {
    throw new RangeError(
      'offsetPath needs a closed path: an open one needs end handling this tier does not define. ' +
        'See docs/geometry.md §6.2.',
    );
  }

  if (p.segments.length === 0) return [];

  const analytic: (LineSegment | ArcSegment)[] = [];
  for (const s of p.segments) {
    if (s.kind === 'cubic') {
      throw new RangeError(
        'offsetPath cannot offset a cubic analytically — the offset of a cubic is not a cubic. ' +
          'Flatten it first, or wait for Tier 2. See docs/geometry.md §6.2.',
      );
    }
    analytic.push(s);
  }

  // A zero offset returns the path itself, arcs and all.
  if (approxZero(d, EPS_POINT)) return [p];

  const turn = convexTurnSign(p);
  if (turn === undefined) {
    throw new RangeError(
      'offsetPath handles convex paths only: a concave corner can make the offset self-intersect ' +
        'in a way no local join can fix. That is what Tier 2 exists for. See docs/geometry.md §6.2.',
    );
  }

  const offsets: Segment[] = [];
  for (const s of analytic) {
    if (s.kind === 'arc') {
      // Travelling counter-clockwise the left normal points at the centre, so
      // offsetting left shrinks the radius; clockwise it grows.
      const radius = s.radius - Math.sign(s.sweepAngle) * d;

      // A radius offset to exactly nothing is a corner, not a collapse: the
      // arc has shrunk to the single point its neighbours already meet at, and
      // dropping it leaves them meeting there. Offsetting a rounded rectangle
      // out and back must return the sharp rectangle it started as. Only a
      // negative radius means the ring has closed over itself.
      if (radius < -EPS_POINT) return [];
      if (approxZero(radius, EPS_POINT)) continue;

      offsets.push(arc(s.centre, radius, s.startAngle, s.sweepAngle));
      continue;
    }

    offsets.push(offsetLine(s, d));
  }

  if (offsets.length === 0) return [];

  const joined = joinAll(p, offsets, d, turn);
  if (joined === undefined) return [];

  const result = makePath(joined, true);

  // The last line of defence against a collapse that the per-segment checks
  // missed: a ring that has turned itself inside out has flipped its winding.
  if (Math.sign(signedArea(result)) !== Math.sign(signedArea(p))) return [];

  return [result];
}

/** A line moves along its left normal. */
function offsetLine(s: LineSegment, d: Mm): Segment {
  const u = tryNormalise(sub(s.b, s.a));

  // A zero-length segment has no direction to offset along. Leaving it in
  // place is right: it contributes nothing, and the neighbouring joins carry
  // the corner. tryNormalise signals that with null, not undefined — the
  // compiler caught this guard never firing.
  if (u === null) return s;

  const n = scale(perp(u), d);
  return line(add(s.a, n), add(s.b, n));
}

/**
 * The sign every turn shares, or `undefined` if the path is not convex.
 *
 * A path is convex when every corner turns the same way *and* every arc curves
 * that way too — an arc bulging the other way is a concave stretch with no
 * corner to notice it at.
 */
function convexTurnSign(p: Path): number | undefined {
  // undefined means "no turn seen yet", which is a different thing from a
  // turn of zero — a straight join. Sharing one value for both is what the
  // float-equality rule was really objecting to.
  let sign: -1 | 1 | undefined;

  // These are sines of the angle between unit tangents, so the angle epsilon
  // is the right one — EPS_POINT would call a real corner straight.
  const record = (value: number): boolean => {
    if (approxZero(value, EPS_ANGLE)) return true;
    const s = value > 0 ? 1 : -1;
    sign ??= s;
    return sign === s;
  };

  for (const s of p.segments) {
    if (s.kind === 'arc' && !record(s.sweepAngle)) return undefined;
  }

  for (let i = 0; i < p.segments.length; i++) {
    const current = p.segments[i]!;
    const next = p.segments[(i + 1) % p.segments.length]!;
    if (!record(cross(tangentAt(current, 1), tangentAt(next, 0)))) return undefined;
  }

  return sign;
}

/** Bridges or trims each corner between consecutive offset segments. */
function joinAll(
  source: Path,
  offsets: readonly Segment[],
  d: Mm,
  turn: number,
): Segment[] | undefined {
  // The offset leans away from the turn when the two signs disagree, opening a
  // gap to bridge; when they agree the offsets overlap and must be trimmed.
  return Math.sign(d) * turn < 0 ? bridgeAll(source, offsets, turn) : trimAll(offsets);
}

/** Inserts a round join wherever the offsets have pulled apart. */
function bridgeAll(source: Path, offsets: readonly Segment[], turn: number): Segment[] {
  const out: Segment[] = [];

  for (let i = 0; i < offsets.length; i++) {
    const current = offsets[i]!;
    const next = offsets[(i + 1) % offsets.length]!;
    out.push(current);

    if (coincident(end(current), start(next))) continue;

    // The arc turns the way the path does: travelling counter-clockwise, the
    // outside of a corner is swept counter-clockwise too.
    out.push(bridge(end(source.segments[i]!), end(current), start(next), turn));
  }

  return out;
}

/**
 * Cuts overlapping offsets back to where they cross.
 *
 * Corner points are computed for the whole ring before any segment is rebuilt.
 * Trimming in a single pass looks simpler and is wrong: the last corner has to
 * cut the *first* segment, which a forward pass has already emitted untrimmed,
 * leaving the ring open by exactly the offset distance.
 */
function trimAll(offsets: readonly Segment[]): Segment[] | undefined {
  const n = offsets.length;
  const corners: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const current = offsets[i]!;
    const next = offsets[(i + 1) % n]!;

    if (coincident(end(current), start(next))) {
      // Tangent, as every corner of a rounded rectangle is.
      corners.push(end(current));
      continue;
    }

    // Only line-line overlaps arise on the convex shapes this tier accepts:
    // where an arc meets its neighbour on such a path the two are tangent.
    if (current.kind !== 'line' || next.kind !== 'line') return undefined;

    const at = intersectLines(current, next);
    if (at === undefined) return undefined;
    corners.push(at);
  }

  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const current = offsets[i]!;
    const from = corners[(i + n - 1) % n]!;
    const to = corners[i]!;

    if (current.kind === 'line') {
      // A segment cut past its own end has been consumed by its neighbours.
      if (dot(sub(to, from), sub(current.b, current.a)) <= 0) return undefined;
      out.push(line(from, to));
      continue;
    }

    // An arc reaches a trim pass only with tangent neighbours, so its
    // endpoints are already the corner points and it needs no adjustment.
    out.push(current);
  }

  return out;
}

function coincident(a: Vec2, b: Vec2): boolean {
  return approxEq(a.x, b.x, EPS_POINT) && approxEq(a.y, b.y, EPS_POINT);
}

/** A round join: an arc of radius |d| about the original corner. */
function bridge(centre: Vec2, from: Vec2, to: Vec2, sweepSign: number): ArcSegment {
  const a0 = Math.atan2(from.y - centre.y, from.x - centre.x);
  const a1 = Math.atan2(to.y - centre.y, to.x - centre.x);

  let sweep = a1 - a0;
  // Take the turn that goes the way the corner does, not the short way round.
  while (sweep * sweepSign < 0) sweep += sweepSign * Math.PI * 2;

  const radius = Math.hypot(from.x - centre.x, from.y - centre.y);
  return arc(centre, radius, a0, sweep);
}

/** Where two infinite lines cross, or `undefined` when they are parallel. */
function intersectLines(l1: LineSegment, l2: LineSegment): Vec2 | undefined {
  const r = sub(l1.b, l1.a);
  const s = sub(l2.b, l2.a);
  const denominator = cross(r, s);

  if (approxZero(denominator, EPS_POINT)) return undefined;

  const t = cross(sub(l2.a, l1.a), s) / denominator;
  return add(l1.a, scale(r, t));
}
