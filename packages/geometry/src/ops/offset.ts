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
  length as segmentLength,
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

/** Where something ended up on the offset, as distances along it. */
export interface OffsetRange {
  readonly startMm: Mm;
  readonly endMm: Mm;
}

/**
 * An offset result, and where each part of the input went.
 *
 * The correspondence comes from the code that built the geometry, which is the
 * only place it exists: a later search for the nearest point lands on the
 * wrong corner whenever an offset removes one ([ADR
 * 0010](../../../../docs/adr/0010-anchors-address-geometry.md)). Both arrays
 * are indexed by **input segment**.
 */
export interface OffsetPiece {
  readonly path: Path;
  /**
   * Where the offset of input segment `i` lies on `path`, or `null` when the
   * offset consumed it — a 3 mm corner arc inset by 3.5 mm.
   */
  readonly segments: readonly (OffsetRange | null)[];
  /**
   * Where the corner at the **end** of input segment `i` lies on `path`.
   *
   * A trimmed corner is the point the neighbours meet at; a bridged one is the
   * middle of the arc that bridges it, which is the direction the corner
   * pointed. `null` where the input has no corner there — the last segment of
   * an open run.
   */
  readonly corners: readonly (Mm | null)[];
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
  return offsetPathTraced(p, distanceMm, opts).map((piece) => piece.path);
}

/**
 * The same offset, and where every input segment and corner ended up.
 *
 * What anchors on derived geometry are built from: the domain maps a source's
 * corners through this rather than looking for them again in the result.
 */
export function offsetPathTraced(p: Path, distanceMm: Mm, opts: OffsetOptions): OffsetPiece[] {
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

  // A zero offset returns the path itself, arcs and all — so every segment is
  // its own image and every corner stays where it is.
  if (approxZero(d, EPS_POINT)) return [identityTrace(p)];

  // Kept alongside `offsets` because a consumed arc is dropped, which would
  // otherwise break the index correspondence the joins rely on.
  const sources: (LineSegment | ArcSegment)[] = [];
  const offsets: Segment[] = [];
  /** offsets index → input segment index, so the trace can speak in inputs. */
  const inputOf: number[] = [];
  for (const [index, s] of analytic.entries()) {
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
      inputOf.push(index);
      continue;
    }

    sources.push(s);
    offsets.push(offsetLine(s, d));
    inputOf.push(index);
  }

  if (offsets.length === 0) return [];

  const joined = joinAll(sources, offsets, d, p.closed);
  if (joined === undefined) return [];

  const result = makePath(joined.segments, p.closed);

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

  return [trace(result, joined, inputOf, p.segments.length, p.closed)];
}

/** Every segment and corner of a path, as its own image. */
function identityTrace(p: Path): OffsetPiece {
  const segments: OffsetRange[] = [];
  const corners: (Mm | null)[] = [];

  let at = 0;
  for (const [index, s] of p.segments.entries()) {
    const endMm = at + segmentLength(s);
    segments.push({ startMm: at, endMm });
    // An open run's last segment ends the path rather than turning a corner.
    corners.push(p.closed || index < p.segments.length - 1 ? endMm : null);
    at = endMm;
  }

  return { path: p, segments, corners };
}

/**
 * Turns what `joinAll` emitted into distances along the result.
 *
 * Bookkeeping, deliberately kept out of the joining itself: the join pass is
 * about geometry and this is about where that geometry landed.
 */
function trace(
  result: Path,
  joined: Joined,
  inputOf: readonly number[],
  inputCount: number,
  closed: boolean,
): OffsetPiece {
  const starts: Mm[] = [];
  let at = 0;
  for (const s of result.segments) {
    starts.push(at);
    at += segmentLength(s);
  }

  // Where each surviving offset, and each join, ended up.
  const rangeOf = new Map<number, OffsetRange>();
  const joinImage = new Map<number, Mm>();

  for (const [position, from] of joined.provenance.entries()) {
    const startMm = starts[position]!;
    const endMm = startMm + segmentLength(result.segments[position]!);

    if (from.kind === 'offset') {
      rangeOf.set(from.index, { startMm, endMm });
      continue;
    }
    // The middle of a bridging arc is the way the corner pointed.
    joinImage.set(from.joinIndex, (startMm + endMm) / 2);
  }

  // A trimmed join left no segment of its own: it is the point where the two
  // neighbours now meet, which is the end of the earlier one.
  const joinCount = closed ? inputOf.length : inputOf.length - 1;
  for (let j = 0; j < joinCount; j++) {
    if (joinImage.has(j)) continue;
    const before = rangeOf.get(j);
    if (before !== undefined) joinImage.set(j, before.endMm);
  }

  const segments: (OffsetRange | null)[] = Array.from({ length: inputCount }, () => null);
  for (const [offsetIndex, inputIndex] of inputOf.entries()) {
    segments[inputIndex] = rangeOf.get(offsetIndex) ?? null;
  }

  // The corner at the end of input segment i is the join after whichever
  // offset covers it — so a consumed corner arc reports the join its two
  // neighbours now meet at, which is exactly where that corner went.
  const corners: (Mm | null)[] = Array.from({ length: inputCount }, () => null);
  let offsetIndex = -1;
  for (let input = 0; input < inputCount; input++) {
    const surviving = inputOf.indexOf(input);
    if (surviving !== -1) offsetIndex = surviving;
    if (offsetIndex === -1) continue;
    corners[input] = joinImage.get(offsetIndex) ?? null;
  }

  return { path: result, segments, corners };
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
/** Where an emitted segment came from, so the trace can be built afterwards. */
type Provenance =
  | { readonly kind: 'offset'; readonly index: number }
  | { readonly kind: 'bridge'; readonly joinIndex: number };

interface Joined {
  readonly segments: Segment[];
  readonly provenance: Provenance[];
}

function joinAll(
  sources: readonly (LineSegment | ArcSegment)[],
  offsets: readonly Segment[],
  d: Mm,
  closed: boolean,
): Joined | undefined {
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
  const provenance: Provenance[] = [];
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
    provenance.push({ kind: 'offset', index: i });

    if (after?.kind === 'bridge') {
      out.push(after.arc);
      provenance.push({ kind: 'bridge', joinIndex: i });
    }
  }

  return { segments: out, provenance };
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
