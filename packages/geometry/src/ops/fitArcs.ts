import {
  EPS_LENGTH,
  EPS_POINT,
  EPS_RATIO,
  assertFinite,
  invariant,
  type Mm,
} from '@leathercad/core';

import { distanceToPath, unsafePath, type Path } from '../path/index.js';
import {
  CubicOps,
  arc,
  line,
  pointAt,
  start,
  type ArcSegment,
  type CubicSegment,
  type LineSegment,
} from '../segment/index.js';
import {
  add,
  angleBetween,
  angleOf,
  dist,
  dot,
  perp,
  scale,
  sub,
  tryNormalise,
  type Vec2,
} from '../vec2.js';

/** One arc or line of a fit, and the directions it starts and ends in. */
export interface FittedPiece {
  readonly segment: LineSegment | ArcSegment;
  /**
   * The direction of travel at each end, **shared** with the neighbouring
   * piece — the same object, not an equal one — so that offsetting both
   * pieces along their normals puts their ends at exactly the same point.
   *
   * An arc's own tangent is this direction. A line is used only where an
   * arc would be too flat to store (`STRAIGHT_RADIUS_MM`), and its chord
   * leans off these directions by less than the tolerance it was fitted to.
   */
  readonly startTangent: Vec2;
  readonly endTangent: Vec2;
}

export interface ArcFit {
  /** End to end, from the cubic's first control point to its last. */
  readonly pieces: readonly FittedPiece[];
  /**
   * The tightest the cubic bends to each side, as curvature in 1/mm, read at
   * the points the fit was checked at; 0 for a side it never bends to.
   *
   * What an offset needs to know before trusting the fit: an offset to the
   * left by `d` folds over itself wherever `left · d ≥ 1`, and no arcs can
   * stand in for an offset that is not a curve.
   */
  readonly sharpestBend: { readonly left: number; readonly right: number };
}

/** Points per piece at which the fit is checked against the cubic, each way. */
const SAMPLES = 16;

/** Guards against a degenerate curve subdividing forever, as flattening does. */
const MAX_DEPTH = 32;

/**
 * The radius past which an arc is stored as its chord.
 *
 * An arc's ends are computed from its centre, so they carry rounding of about
 * `radius × Number.EPSILON`. Past this radius that would reach a thousandth of
 * `EPS_POINT`, the slack every path join is checked against; the chord sits
 * `chord² / 8r` from the arc, which the deviation check then measures like any
 * other error.
 */
const STRAIGHT_RADIUS_MM: Mm = EPS_POINT / (1024 * Number.EPSILON);

/**
 * Lines and circular arcs, tangent-continuous, within `toleranceMm` of a
 * cubic Bézier — a **biarc** fit (docs/geometry.md §6.2).
 *
 * For offsetting only. The offset of a cubic is not a cubic, but the offset
 * of an arc is an arc, exactly; so an offset of the fit is an exact offset of
 * something within the tolerance of the curve. The outline itself stays the
 * cubic it was drawn as.
 *
 * Each piece of the cubic is matched by two arcs meeting at a point where
 * they share a tangent (the equal-tangent-length biarc), starting along the
 * cubic's own direction at one end and arriving along it at the other. Where
 * that pair strays from the curve by more than the tolerance — checked both
 * ways, from the cubic's points to the arcs and from the arcs' points to the
 * cubic — the piece is halved and each half fitted again. A biarc is
 * accurate to the cube of its length, so few halvings are ever needed.
 *
 * Total: a cubic of four coincident points has nothing to fit and returns no
 * pieces; one that loops, doubles back through a cusp or has a retracted
 * handle is subdivided until each piece fits, which it always does once the
 * piece is smaller than the tolerance.
 */
export function fitArcs(c: CubicSegment, toleranceMm: Mm): ArcFit {
  const tolerance = assertFinite(toleranceMm, 'fitArcs toleranceMm');
  if (tolerance <= 0) {
    throw new RangeError(`fitArcs toleranceMm must be positive, received ${toleranceMm}`);
  }

  const pieces: FittedPiece[] = [];
  const sharpestBend = { left: 0, right: 0 };

  if ([c.p1, c.p2, c.p3].every((p) => dist(p, c.p0) <= EPS_POINT)) {
    return { pieces, sharpestBend };
  }

  fitPiece(c, CubicOps.tangentAt(c, 0), CubicOps.tangentAt(c, 1), tolerance, 0, {
    pieces,
    sharpestBend,
  });
  return { pieces, sharpestBend };
}

interface Accumulator {
  readonly pieces: FittedPiece[];
  readonly sharpestBend: { left: number; right: number };
}

function fitPiece(
  s: CubicSegment,
  startTangent: Vec2,
  endTangent: Vec2,
  tolerance: Mm,
  depth: number,
  into: Accumulator,
): void {
  const candidate = biarc(s.p0, startTangent, s.p3, endTangent);
  // Accepted at half the budget. The check samples and refines its peaks, so
  // what it misses is small, but it is not nothing; the other half is
  // headroom for that, and the property tests hold the whole budget.
  if (candidate !== undefined && deviation(s, candidate, tolerance / 2) <= tolerance / 2) {
    into.pieces.push(...candidate);
    recordBend(s, into.sharpestBend);
    return;
  }

  invariant(depth < MAX_DEPTH, 'fitArcs subdivided past its depth limit');

  // Halved by parameter, and the direction at the cut shared by both halves:
  // computed once, so the two fits meet tangent to each other by construction.
  const [first, second] = CubicOps.split(s, 0.5);
  const middle = CubicOps.tangentAt(s, 0.5);
  fitPiece(first, startTangent, middle, tolerance, depth + 1, into);
  fitPiece(second, middle, endTangent, tolerance, depth + 1, into);
}

/**
 * Two arcs from `from`, leaving along `startTangent`, to `to`, arriving along
 * `endTangent`, meeting tangent to each other — or `undefined` where no such
 * pair exists with the two tangent lengths equal (the ends point away from
 * each other), and the piece must be halved instead.
 *
 * The equal-length biarc: with `d` the distance from each end to its control
 * point along its tangent, the two control points must lie `2d` apart. Solved
 * for `d` in the cancellation-free form of its quadratic.
 */
function biarc(
  from: Vec2,
  startTangent: Vec2,
  to: Vec2,
  endTangent: Vec2,
): FittedPiece[] | undefined {
  const chord = sub(to, from);
  const chordSq = dot(chord, chord);

  // A piece with no length is a line for the deviation check to judge: if the
  // cubic loops away and back it fails, and the piece is halved.
  if (chordSq <= EPS_POINT * EPS_POINT) {
    return [{ segment: line(from, to), startTangent, endTangent }];
  }

  const along = dot(chord, add(startTangent, endTangent));
  const spread = 2 * (1 - dot(startTangent, endTangent));
  const root = Math.sqrt(along * along + spread * chordSq);
  // Either root form gives the same d; each is used where it does not cancel.
  // With the ends pointing away from each other and their tangents parallel,
  // there is no equal-length biarc at all.
  if (along <= 0 && spread <= EPS_RATIO) return undefined;
  const d = along > 0 ? chordSq / (along + root) : (root - along) / spread;
  if (!(d > 0) || !Number.isFinite(d)) return undefined;

  const near = add(from, scale(startTangent, d));
  const far = sub(to, scale(endTangent, d));
  const junctionTangent = tryNormalise(sub(far, near));
  if (junctionTangent === null) return undefined;
  const junction = scale(add(near, far), 0.5);

  return [
    // Both arcs carry the one junction direction, so their offsets meet.
    {
      segment: arcAbout(from, startTangent, from, junction),
      startTangent,
      endTangent: junctionTangent,
    },
    { segment: arcAbout(to, endTangent, junction, to), startTangent: junctionTangent, endTangent },
  ];
}

/**
 * The arc from `from` to `to` whose tangent at `touching` (one of the two) is
 * `tangent`; a line where that arc would be flatter than `STRAIGHT_RADIUS_MM`.
 *
 * Its centre lies on the normal at `touching`, as far along it as makes both
 * ends equidistant: `r = |w|² / (2 n·w)` for `w` the chord from `touching`,
 * signed so that a centre to the left is counter-clockwise travel.
 */
function arcAbout(touching: Vec2, tangent: Vec2, from: Vec2, to: Vec2): LineSegment | ArcSegment {
  const normal = perp(tangent);
  const w = sub(touching === from ? to : from, touching);
  const offCourse = 2 * dot(normal, w);
  const signedRadius = dot(w, w) / offCourse;

  // No arc either way: one with no length (at a cusp the junction can land on
  // the end it leaves from) has no centre to speak of, and one flatter than
  // STRAIGHT_RADIUS_MM has ends its centre cannot place exactly.
  if (
    dot(w, w) <= EPS_POINT * EPS_POINT ||
    !Number.isFinite(signedRadius) ||
    Math.abs(signedRadius) > STRAIGHT_RADIUS_MM
  ) {
    return line(from, to);
  }

  const centre = add(touching, scale(normal, signedRadius));
  const startRadial = sub(from, centre);
  let sweep = angleBetween(startRadial, sub(to, centre));
  // The way the tangent turns, not the short way round.
  if (signedRadius > 0 && sweep < 0) sweep += Math.PI * 2;
  if (signedRadius < 0 && sweep > 0) sweep -= Math.PI * 2;

  return arc(centre, Math.abs(signedRadius), angleOf(startRadial), sweep);
}

/**
 * How far a candidate strays from the cubic, both ways: the furthest any
 * point of the cubic lies from the arcs, and the furthest any point of the
 * arcs lies from the cubic. One way alone misses a pair that overshoots the
 * curve and comes back, which is exactly what a biarc does at a cusp.
 *
 * The first is exact, since the distance to an arc is. The second projects
 * each arc point onto the cubic from where it should be — before the
 * junction for the first arc, after it for the second — and wherever that
 * lands is a point on the curve, so the distance it gives can only be too
 * large, never too small: a poor start costs a needless halving, never a
 * stray arc let through.
 */
function deviation(s: CubicSegment, candidate: readonly FittedPiece[], limit: Mm): Mm {
  const fitted: Path = unsafePath(candidate.map((piece) => piece.segment));
  let worst = worstAlong((t) => distanceToPath(fitted, CubicOps.pointAt(s, t)), limit);

  // Where on the cubic each piece of the candidate begins, by its start point.
  const starts = candidate.map(({ segment }) => nearestParameter(s, start(segment)));
  for (const [index, { segment }] of candidate.entries()) {
    if (worst > limit) return worst;
    const from = starts[index]!;
    const to = starts[index + 1] ?? 1;
    const strayAt = (u: number): Mm => {
      const p = pointAt(segment, u);
      return projectedDistance(s, p.x, p.y, from + (to - from) * u);
    };
    worst = Math.max(worst, worstAlong(strayAt, limit));
  }
  return worst;
}

/** Newton steps projecting onto the cubic. From a start this close, more change no fit (measured). */
const NEWTON_STEPS = 3;

/**
 * How far the point `(qx, qy)` is from the point of `s` that Gauss–Newton on
 * `(B(t) − p)·B'(t) = 0` reaches from `guess`, kept within `[0, 1]`. Always
 * the distance to a real point of the curve — all `deviation` relies on.
 *
 * Written in scalars, in Bernstein form, because it is the fit's innermost
 * loop: run with vectors it allocated a dozen of them per step and was half
 * of what offsetting an oval cost.
 */
function projectedDistance(s: CubicSegment, qx: number, qy: number, guess: number): Mm {
  const { p0, p1, p2, p3 } = s;
  let t = guess;
  for (let step = 0; step <= NEWTON_STEPS; step++) {
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    const ex = p0.x * b0 + p1.x * b1 + p2.x * b2 + p3.x * b3 - qx;
    const ey = p0.y * b0 + p1.y * b1 + p2.y * b2 + p3.y * b3 - qy;
    if (step === NEWTON_STEPS) return Math.hypot(ex, ey);

    const d0 = 3 * u * u;
    const d1 = 6 * u * t;
    const d2 = 3 * t * t;
    const vx = (p1.x - p0.x) * d0 + (p2.x - p1.x) * d1 + (p3.x - p2.x) * d2;
    const vy = (p1.y - p0.y) * d0 + (p2.y - p1.y) * d1 + (p3.y - p2.y) * d2;
    const speedSq = vx * vx + vy * vy;
    // Too slow to divide by: a stationary point, where this is as good as any.
    if (speedSq < EPS_LENGTH * EPS_LENGTH) return Math.hypot(ex, ey);
    t = Math.min(1, Math.max(0, t - (ex * vx + ey * vy) / speedSq));
  }
  return Number.POSITIVE_INFINITY;
}

/** The sampled parameter nearest `p`: where a piece starts on the cubic, to start projecting from. */
function nearestParameter(s: CubicSegment, p: Vec2): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= SAMPLES; i++) {
    const d = dist(CubicOps.pointAt(s, i / SAMPLES), p);
    if (d < bestDistance) {
      bestDistance = d;
      best = i / SAMPLES;
    }
  }
  return best;
}

/**
 * Golden-section steps per peak. Each narrows the bracket by 0.618, so twelve
 * leave 0.3% of the two sample intervals it started from.
 */
const REFINE_STEPS = 12;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * The largest value of `f` on `[0, 1]`, found by sampling and then refining
 * every local peak of the samples within the intervals either side of it —
 * or the first value found above `limit`, since then the answer is already
 * known to be no.
 *
 * Sampling alone misses peaks: at a cusp the curve slows to a stop, so its
 * tip falls between evenly spaced parameters and the distance there rises
 * well above both neighbours. Refining every local peak, not only the
 * highest sample, finds the one that a lower sample was hiding.
 */
function worstAlong(f: (t: number) => number, limit: number): number {
  const values: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const value = f(i / SAMPLES);
    if (value > limit) return value;
    values.push(value);
  }

  let worst = Math.max(...values);
  for (let i = 0; i <= SAMPLES; i++) {
    const here = values[i]!;
    // A peak: above the sample before it, and not below the one after — so a
    // flat run, a straight piece's zeros, is refined once rather than at every sample.
    if (i > 0 && !(here > values[i - 1]!)) continue;
    if (i < SAMPLES && here < values[i + 1]!) continue;

    let lo = Math.max(0, i - 1) / SAMPLES;
    let hi = Math.min(SAMPLES, i + 1) / SAMPLES;
    let left = hi - (hi - lo) * GOLDEN;
    let right = lo + (hi - lo) * GOLDEN;
    let atLeft = f(left);
    let atRight = f(right);
    for (let step = 0; step < REFINE_STEPS; step++) {
      if (atLeft > atRight) {
        hi = right;
        right = left;
        atRight = atLeft;
        left = hi - (hi - lo) * GOLDEN;
        atLeft = f(left);
      } else {
        lo = left;
        left = right;
        atLeft = atRight;
        right = lo + (hi - lo) * GOLDEN;
        atRight = f(right);
      }
    }
    worst = Math.max(worst, atLeft, atRight);
    if (worst > limit) return worst;
  }
  return worst;
}

/** Keeps the tightest bend seen to each side, at the points the fit checked. */
function recordBend(s: CubicSegment, bend: { left: number; right: number }): void {
  for (let i = 0; i <= SAMPLES; i++) {
    const k = CubicOps.curvatureAt(s, i / SAMPLES);
    if (k === null) continue;
    if (k > bend.left) bend.left = k;
    if (-k > bend.right) bend.right = -k;
  }
}
