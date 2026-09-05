import {
  approxEq,
  approxZero,
  assertFinite,
  EPS_POINT,
  invariant,
  type Mm,
} from '@leathercad/core';

import { path as makePath, signedArea, type Path } from '../path/index.js';
import { selfIntersections } from './intersect.js';
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
 * Offsets a path by a signed distance — positive to the **left** of the
 * direction of travel. On a counter-clockwise ring that is inward.
 *
 * Open paths are offset too, and their ends simply end: a stitch line on three
 * sides of a pocket is an open offset, so there is no cap policy to invent.
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
 * It handles **closed paths of lines and arcs, concave corners included**.
 * Each corner is judged on its own turn: where the offsets lean apart the gap
 * is bridged with an arc, and where they overlap they are trimmed to their
 * intersection. A corner arc consumed by the offset — a 3 mm radius inset by
 * 3.5 mm — becomes a sharp corner, which is what insetting a rounded rectangle
 * past its radius actually produces.
 *
 * It refuses, rather than guessing:
 *
 * - a cubic, which has no exact offset (the offset of a cubic is not a cubic);
 * - an overlap where either side is an arc, which is not solvable by the
 *   line-line intersection this tier uses;
 * - **a result that self-intersects**, which is the honest form of the old
 *   convexity test. Asking whether the input was convex refused an ordinary
 *   thumb scoop for what concavity *could* do; asking whether the output
 *   folded over itself answers the question that was actually being asked.
 *   Pruning those loops — computing the correct remaining outline — is what
 *   Tier 2 is for, and is still deferred.
 */
export function offsetPath(p: Path, distanceMm: Mm, opts: OffsetOptions): Path[] {
  const d = assertFinite(distanceMm, 'distanceMm');

  invariant(opts.join === 'round', `unsupported join ${opts.join}`);

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

  // Kept alongside `offsets` because a consumed arc is dropped, which would
  // otherwise break the index correspondence the joins rely on.
  const sources: (LineSegment | ArcSegment)[] = [];
  const offsets: Segment[] = [];
  for (const s of analytic) {
    if (s.kind === 'arc') {
      // Travelling counter-clockwise the left normal points at the centre, so
      // offsetting left shrinks the radius; clockwise it grows.
      const radius = s.radius - Math.sign(s.sweepAngle) * d;

      // A corner arc consumed by the offset is a sharp corner, not a collapse:
      // the neighbours still meet, and the trim pass below finds where.
      // Offsetting a rounded rectangle out and back must return the sharp
      // rectangle it started as, and insetting a 3 mm corner by 3.5 mm must
      // give a sharp one. Only a segment cut past its own end means the ring
      // has closed over itself, which the join pass detects.
      if (radius < EPS_POINT) continue;

      sources.push(s);
      offsets.push(arc(s.centre, radius, s.startAngle, s.sweepAngle));
      continue;
    }

    sources.push(s);
    offsets.push(offsetLine(s, d));
  }

  if (offsets.length === 0) return [];

  const joined = joinAll(sources, offsets, d, p.closed);
  if (joined === undefined) return [];

  const result = makePath(joined, p.closed);

  // The last line of defence against a collapse that the per-segment checks
  // missed: a ring that has turned itself inside out has flipped its winding.
  // An open run has no signed area, so there is nothing to compare.
  if (p.closed && Math.sign(signedArea(result)) !== Math.sign(signedArea(p))) return [];

  // The rejection criterion, replacing the old input convexity gate. A concave
  // corner is only a problem if the offset it produced actually folded over
  // itself, and that is answerable — where "is the input convex?" refused
  // valid work. Pruning those loops is slice 9.11; detecting them is enough to
  // refuse honestly.
  if (selfIntersections(result).length > 0) return [];

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
 * What happens where two offset segments meet.
 *
 * Decided per corner rather than once for the whole path. The old code took a
 * single turn sign for the whole ring and refused anything that was not
 * convex, which rejected an ordinary thumb scoop for what concavity *could*
 * do somewhere else. Each corner knows its own answer.
 */
type Join =
  /**
   * Where the two offsets meet: their shared point when they already touch,
   * or where they cross when they overlap.
   *
   * One kind for both, because a line is rebuilt from its corners either way.
   * Leaving an already-touching join alone looks harmless and is not: a corner
   * arc small enough to be dropped leaves its neighbours a hair apart — within
   * the per-axis tolerance that called them touching, but far enough to fail
   * the path's own end-to-end check.
   */
  | { readonly kind: 'point'; readonly at: Vec2 }
  | { readonly kind: 'bridge'; readonly arc: ArcSegment };

/**
 * Joins offset segments corner by corner.
 *
 * The offset leans away from the turn when the two signs disagree, opening a
 * gap to bridge; when they agree the offsets overlap and must be trimmed. That
 * is the rule the whole-path version used, applied where it is actually true.
 *
 * Corner points are computed for every join before any segment is rebuilt.
 * Trimming in a single pass looks simpler and is wrong: the last corner has to
 * cut the *first* segment, which a forward pass has already emitted untrimmed,
 * leaving the ring open by exactly the offset distance.
 */
function joinAll(
  sources: readonly (LineSegment | ArcSegment)[],
  offsets: readonly Segment[],
  d: Mm,
  closed: boolean,
): Segment[] | undefined {
  const n = offsets.length;
  // A closed ring joins the last segment back to the first; an open run stops.
  const joinCount = closed ? n : n - 1;

  const joins: (Join | undefined)[] = [];
  for (let i = 0; i < joinCount; i++) {
    const join = joinAt(sources, offsets, i, n, d);
    if (join === undefined) return undefined;
    joins.push(join);
  }

  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const current = offsets[i]!;
    // The join before this segment trims its start; the one after, its end.
    const before = i > 0 ? joins[i - 1] : closed ? joins[n - 1] : undefined;
    const after = joins[i];

    const from = before?.kind === 'point' ? before.at : start(current);
    const to = after?.kind === 'point' ? after.at : end(current);

    if (current.kind === 'line') {
      // A segment cut past its own end has been consumed by its neighbours,
      // which is a genuine collapse rather than a corner.
      if (dot(sub(to, from), sub(current.b, current.a)) <= 0) return undefined;
      out.push(line(from, to));
    } else {
      // An arc reaches here only with tangent neighbours — `joinAt` refuses
      // any other overlap involving one — so its endpoints are already right.
      out.push(current);
    }

    if (after?.kind === 'bridge') out.push(after.arc);
  }

  return out;
}

/** The join between offset `i` and the one after it. */
function joinAt(
  sources: readonly (LineSegment | ArcSegment)[],
  offsets: readonly Segment[],
  i: number,
  n: number,
  d: Mm,
): Join | undefined {
  const current = offsets[i]!;
  const next = offsets[(i + 1) % n]!;

  // Tangent, as every surviving corner of a rounded rectangle is.
  if (coincident(end(current), start(next))) return { kind: 'point', at: end(current) };

  const sourceCurrent = sources[i]!;
  const sourceNext = sources[(i + 1) % n]!;
  const turn = cross(tangentAt(sourceCurrent, 1), tangentAt(sourceNext, 0));

  if (Math.sign(d) * turn < 0) {
    // The offsets lean apart: bridge the gap with an arc about the corner.
    // `Math.sign`, not the raw cross product: `bridge` advances the sweep by
    // `sweepSign * 2 * PI`, so a magnitude of 0.996 shortens the turn by 0.4%
    // and leaves the arc ending a hair off the next segment. The whole-path
    // version never hit this because `convexTurnSign` normalised to ±1.
    return {
      kind: 'bridge',
      arc: bridge(end(sourceCurrent), end(current), start(next), Math.sign(turn)),
    };
  }

  // They overlap. Only a line-line overlap is solvable analytically here:
  // where an arc meets a neighbour on a path this tier accepts, the two are
  // tangent and took the branch above. Refusing is honest — it surfaces as a
  // rejection rather than a wrong answer.
  if (current.kind !== 'line' || next.kind !== 'line') return undefined;

  const at = intersectLines(current, next);
  if (at === undefined) return undefined;

  return { kind: 'point', at };
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
