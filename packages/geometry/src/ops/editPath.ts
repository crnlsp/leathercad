import {
  approxZero,
  assertFinite,
  EPS_ANGLE,
  EPS_LENGTH,
  EPS_PARAM,
  EPS_POINT,
} from '@leathercad/core';

import { path as makePath, type Path } from '../path/index.js';
import {
  FULL_TURN,
  arc,
  cubic,
  end,
  length as segmentLength,
  line,
  split,
  start,
  type ArcSegment,
  type Segment,
} from '../segment/index.js';
import { add, dist, midpoint, scale, sub, type Vec2 } from '../vec2.js';

/**
 * A drawn path after one of its points was moved, added or removed — and
 * which old point and segment became which new one.
 *
 * The maps are the reason this is more than a new path. A stitch run or a
 * dimension names a corner of the path, and after an edit that corner has to
 * be found again. Finding it by looking for the nearest point attaches to the
 * wrong corner exactly when an edit removes one, so the correspondence comes
 * from the code that made the edit (ADR 0010).
 *
 * Point `i` of a path is where segment `i` starts; an open path's last point
 * is where its last segment ends. That is `PathOps.vertices`' numbering.
 */
export interface PathEdit {
  readonly path: Path;
  /** For each old point, its index on the new path, or `null` if it is gone. */
  readonly vertexMap: readonly (number | null)[];
  /**
   * For each old segment, the new segment that continues it, or `null` when it
   * was split or merged. A reshaped arc still continues itself.
   */
  readonly segmentMap: readonly (number | null)[];
  /**
   * A corner the edit reshaped rather than moved or removed: a point rounded
   * into an arc, or a rounding sharpened back into a point (3.9d). The corner
   * is the same corner either way, so what is attached to it stays attached —
   * which the two maps alone cannot say, because a point became a segment or
   * a segment a point.
   */
  readonly reshaped?:
    | { readonly kind: 'rounded'; readonly fromVertex: number; readonly toSegment: number }
    | { readonly kind: 'sharpened'; readonly fromSegment: number; readonly toVertex: number };
}

/**
 * An arc of a given sweep from `a` to `b`: the same bend, between new ends.
 *
 * `null` when there is no such arc — ends in the same place, or a sweep of
 * nothing or of a whole turn, neither of which has a chord to hang from.
 */
export function arcFromChord(a: Vec2, b: Vec2, sweepAngle: number): ArcSegment | null {
  assertFinite(sweepAngle, 'arcFromChord sweepAngle');
  const chord = dist(a, b);
  const half = Math.abs(sweepAngle) / 2;
  if (chord <= EPS_POINT || half <= EPS_ANGLE || Math.abs(sweepAngle) >= FULL_TURN - EPS_ANGLE) {
    return null;
  }

  const radius = chord / (2 * Math.sin(half));
  // From the chord's midpoint to the centre, along the chord's left normal for
  // an anticlockwise sweep of less than half a turn: the centre sits on the
  // side the arc bends away from. `cos(half) / sin(half)` changes sign past a
  // half turn, which carries the centre across the chord with it.
  const along = sub(b, a);
  const leftNormal = { x: -along.y / chord, y: along.x / chord };
  const reach = ((chord / 2) * Math.cos(half)) / Math.sin(half);
  const centre = add(midpoint(a, b), scale(leftNormal, Math.sign(sweepAngle) * reach));

  const startAngle = Math.atan2(a.y - centre.y, a.x - centre.x);
  return arc(centre, radius, startAngle, sweepAngle);
}

/**
 * The path with point `index` moved to `to`.
 *
 * The two segments meeting there follow it: a line's end moves, an arc keeps
 * its sweep and is re-hung between its new ends, and a cubic's handle on that
 * end moves with the point. Every other point stays exactly where it was.
 *
 * `null` for an index the path does not have, or when a side would shrink to
 * nothing or an arc would lose its chord.
 */
export function movePathVertex(p: Path, index: number, to: Vec2): PathEdit | null {
  assertFinite(to.x, 'movePathVertex to.x');
  assertFinite(to.y, 'movePathVertex to.y');
  const n = p.segments.length;
  const count = vertexCount(p);
  if (!Number.isInteger(index) || index < 0 || index >= count) return null;

  const segments = [...p.segments];
  const outgoing = index < n ? index : null;
  const incoming = index > 0 ? index - 1 : p.closed ? n - 1 : null;

  // A whole circle both leaves and returns to its one point, so it has no
  // other end to re-hang from.
  if (outgoing !== null && outgoing === incoming) return null;

  if (outgoing !== null) {
    const moved = withStart(segments[outgoing]!, to);
    if (moved === null) return null;
    segments[outgoing] = moved;
  }
  if (incoming !== null) {
    const moved = withEnd(segments[incoming]!, to);
    if (moved === null) return null;
    segments[incoming] = moved;
  }

  return {
    path: makePath(segments, p.closed),
    vertexMap: identity(count),
    segmentMap: identity(n),
  };
}

/**
 * The path with a new point `t` of the way along segment `segmentIndex`.
 *
 * The outline does not change: the segment is split in two where it already
 * runs. The new point is `inserted` on the new path, one after the split
 * segment's start.
 *
 * `null` for a segment the path does not have, or a split so close to an end
 * that one half would have no length.
 */
export function insertPathVertex(
  p: Path,
  segmentIndex: number,
  t: number,
): (PathEdit & { readonly inserted: number }) | null {
  assertFinite(t, 'insertPathVertex t');
  const n = p.segments.length;
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= n) return null;
  if (t <= EPS_PARAM || t >= 1 - EPS_PARAM) return null;

  const [first, second] = split(p.segments[segmentIndex]!, t);
  if (tooShort(first) || tooShort(second)) return null;

  const segments = [
    ...p.segments.slice(0, segmentIndex),
    first,
    second,
    ...p.segments.slice(segmentIndex + 1),
  ];

  return {
    path: makePath(segments, p.closed),
    vertexMap: identity(vertexCount(p)).map((i) => (i <= segmentIndex ? i : i + 1)),
    segmentMap: identity(n).map((i) => (i < segmentIndex ? i : i === segmentIndex ? null : i + 1)),
    inserted: segmentIndex + 1,
  };
}

/**
 * The path without point `index`.
 *
 * The two sides meeting there become one straight side between their far
 * ends. At an end of an open path there is only one side, and it goes with
 * the point. Removing a closed path's first point makes the point before it
 * the new first.
 *
 * `null` for an index the path does not have, when too few points would be
 * left — three for a closed path, which encloses nothing with fewer, and two
 * for an open one — or when the new side would have no length.
 */
export function removePathVertex(p: Path, index: number): PathEdit | null {
  const n = p.segments.length;
  const count = vertexCount(p);
  if (!Number.isInteger(index) || index < 0 || index >= count) return null;
  if (count - 1 < (p.closed ? 3 : 2)) return null;

  const oldVertices = identity(count);
  // Indices are compared with inequalities throughout: the float-equality
  // rule cannot tell an array index from a millimetre. `index` is a whole
  // number in range by now, so `index < 1` is "the first point" and
  // `index > n - 1` "an open path's last".
  const first = index < 1;

  if (!p.closed && (first || index > n - 1)) {
    const segments = first ? p.segments.slice(1) : p.segments.slice(0, n - 1);
    return {
      path: makePath(segments, false),
      vertexMap: oldVertices.map((i) => (i === index ? null : first ? i - 1 : i)),
      segmentMap: identity(n).map((i) => (first ? (i < 1 ? null : i - 1) : i > n - 2 ? null : i)),
    };
  }

  if (first) {
    // Closed, at its start: the last side and the first become one, which
    // opens the new path.
    const joined = line(start(p.segments[n - 1]!), end(p.segments[0]!));
    if (tooShort(joined)) return null;
    return {
      path: makePath([joined, ...p.segments.slice(1, n - 1)], true),
      vertexMap: oldVertices.map((i) => (i < 1 ? null : i > n - 2 ? 0 : i)),
      segmentMap: identity(n).map((i) => (i < 1 || i > n - 2 ? null : i)),
    };
  }

  const joined = line(start(p.segments[index - 1]!), end(p.segments[index]!));
  if (tooShort(joined)) return null;
  return {
    path: makePath(
      [...p.segments.slice(0, index - 1), joined, ...p.segments.slice(index + 1)],
      p.closed,
    ),
    vertexMap: oldVertices.map((i) => (i < index ? i : i === index ? null : i - 1)),
    segmentMap: identity(n).map((i) => (i < index - 1 ? i : i > index ? i - 1 : null)),
  };
}

/**
 * The path with the corner at point `index` rounded to `radiusMm`: the two
 * straight sides meeting there are shortened, and an arc of that radius,
 * tangent to both, joins them — a rounded rectangle's corner, on any angle.
 *
 * Only a corner between two straight sides is rounded; a corner beside an arc
 * is a curve editor's (Later). Rounding a closed path's first point puts the
 * rounding last, after the side that comes into it.
 *
 * `null` for an index the path does not have, a point with no corner (an end
 * of an open path, or straight on), a radius that is not positive, or one
 * that does not fit: the rounding must leave both sides some length.
 */
export function roundPathVertex(p: Path, index: number, radiusMm: number): PathEdit | null {
  assertFinite(radiusMm, 'roundPathVertex radiusMm');
  const n = p.segments.length;
  if (!Number.isInteger(index) || index < 0 || index >= vertexCount(p)) return null;
  if (radiusMm <= EPS_LENGTH) return null;

  const incoming = index > 0 ? index - 1 : p.closed ? n - 1 : null;
  const outgoing = index < n ? index : null;
  if (incoming === null || outgoing === null || incoming === outgoing) return null;

  const a = p.segments[incoming]!;
  const b = p.segments[outgoing]!;
  if (a.kind !== 'line' || b.kind !== 'line') return null;

  const lengthA = dist(a.a, a.b);
  const lengthB = dist(b.a, b.b);
  if (lengthA <= EPS_LENGTH || lengthB <= EPS_LENGTH) return null;
  const u = scale(sub(a.b, a.a), 1 / lengthA);
  const v = scale(sub(b.b, b.a), 1 / lengthB);

  // Signed: anticlockwise positive, which is the rounding's sweep. Straight on
  // is no corner, and a full reversal has no rounding that fits.
  const turn = Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
  if (Math.abs(turn) <= EPS_ANGLE || Math.abs(turn) >= Math.PI - EPS_ANGLE) return null;

  // How far back along each side the rounding starts.
  const setBack = radiusMm * Math.tan(Math.abs(turn) / 2);
  if (setBack >= lengthA - EPS_LENGTH || setBack >= lengthB - EPS_LENGTH) return null;

  const corner = b.a;
  const from = sub(corner, scale(u, setBack));
  const to = add(corner, scale(v, setBack));
  const rounding = arcFromChord(from, to, turn);
  if (rounding === null) return null;

  const before = line(a.a, from);
  const after = line(to, b.b);
  const count = vertexCount(p);

  if (index > 0) {
    return {
      path: makePath(
        [
          ...p.segments.slice(0, index - 1),
          before,
          rounding,
          after,
          ...p.segments.slice(index + 1),
        ],
        p.closed,
      ),
      vertexMap: identity(count).map((k) => (k < index ? k : k === index ? null : k + 1)),
      segmentMap: identity(n).map((j) => (j < index ? j : j + 1)),
      reshaped: { kind: 'rounded', fromVertex: index, toSegment: index },
    };
  }

  // A closed path's first point: the side leaving it stays first, and the
  // rounding goes last, after the side coming in.
  return {
    path: makePath([after, ...p.segments.slice(1, n - 1), before, rounding], true),
    vertexMap: identity(count).map((k) => (k < 1 ? null : k)),
    segmentMap: identity(n),
    reshaped: { kind: 'rounded', fromVertex: 0, toSegment: n },
  };
}

/**
 * The path with the rounded corner at segment `segmentIndex` sharpened: the
 * arc goes, and the straight sides either side of it are extended to where
 * they meet. The inverse of `roundPathVertex`.
 *
 * `null` unless that segment is an arc between two straight sides that meet
 * ahead of both — parallel sides, a stadium's ends, never meet — and the
 * sharpened path still has three points if it is closed.
 */
export function sharpenPathArc(p: Path, segmentIndex: number): PathEdit | null {
  const n = p.segments.length;
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= n) return null;
  if (p.segments[segmentIndex]!.kind !== 'arc') return null;
  if (p.closed && n - 1 < 3) return null;

  const incoming = segmentIndex > 0 ? segmentIndex - 1 : p.closed ? n - 1 : null;
  const outgoing = segmentIndex < n - 1 ? segmentIndex + 1 : p.closed ? 0 : null;
  if (incoming === null || outgoing === null || incoming === outgoing) return null;

  const a = p.segments[incoming]!;
  const b = p.segments[outgoing]!;
  if (a.kind !== 'line' || b.kind !== 'line') return null;

  // Where the two sides, carried on, meet.
  const r = sub(a.b, a.a);
  const s2 = sub(b.b, b.a);
  const lengths = dist(a.a, a.b) * dist(b.a, b.b);
  if (lengths <= EPS_LENGTH * EPS_LENGTH) return null;
  const denominator = r.x * s2.y - r.y * s2.x;
  if (Math.abs(denominator / lengths) <= EPS_ANGLE) return null;
  const toB = sub(b.a, a.a);
  const t = (toB.x * s2.y - toB.y * s2.x) / denominator;
  const corner = add(a.a, scale(r, t));

  // Both sides must run on to the corner, not back from it.
  const along = sub(corner, a.a);
  const onward = sub(b.b, corner);
  if (along.x * r.x + along.y * r.y <= 0 || onward.x * s2.x + onward.y * s2.y <= 0) return null;
  if (dist(a.a, corner) <= EPS_LENGTH || dist(corner, b.b) <= EPS_LENGTH) return null;

  const before = line(a.a, corner);
  const after = line(corner, b.b);
  const count = vertexCount(p);
  const j = segmentIndex;

  if (j > 0 && j < n - 1) {
    return {
      path: makePath(
        [...p.segments.slice(0, j - 1), before, after, ...p.segments.slice(j + 2)],
        p.closed,
      ),
      vertexMap: identity(count).map((k) => (k < j ? k : k > j + 1 ? k - 1 : null)),
      segmentMap: identity(n).map((i) => (i < j ? i : i > j ? i - 1 : null)),
      reshaped: { kind: 'sharpened', fromSegment: j, toVertex: j },
    };
  }

  if (j < 1) {
    // Closed, the rounding first: the corner becomes the first point.
    return {
      path: makePath([after, ...p.segments.slice(2, n - 1), before], true),
      vertexMap: identity(count).map((k) => (k < 2 ? null : k - 1)),
      segmentMap: identity(n).map((i) => (i < 1 ? null : i - 1)),
      reshaped: { kind: 'sharpened', fromSegment: 0, toVertex: 0 },
    };
  }

  // Closed, the rounding last: the corner is the first point again.
  return {
    path: makePath([after, ...p.segments.slice(1, n - 2), before], true),
    vertexMap: identity(count).map((k) => (k < 1 || k > n - 2 ? null : k)),
    segmentMap: identity(n).map((i) => (i > n - 2 ? null : i)),
    reshaped: { kind: 'sharpened', fromSegment: n - 1, toVertex: 0 },
  };
}

function vertexCount(p: Path): number {
  if (p.segments.length === 0) return 0;
  return p.closed ? p.segments.length : p.segments.length + 1;
}

function identity(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function tooShort(s: Segment): boolean {
  return segmentLength(s) <= EPS_LENGTH;
}

/** The segment with its start at `to`, or `null` if it would have no length. */
function withStart(s: Segment, to: Vec2): Segment | null {
  switch (s.kind) {
    case 'line':
      return approxZero(dist(to, s.b), EPS_LENGTH) ? null : line(to, s.b);
    case 'arc':
      return arcFromChord(to, end(s), s.sweepAngle);
    case 'cubic': {
      if (approxZero(dist(to, s.p3), EPS_LENGTH)) return null;
      const delta = sub(to, s.p0);
      return cubic(to, add(s.p1, delta), s.p2, s.p3);
    }
  }
}

/** The segment with its end at `to`, or `null` if it would have no length. */
function withEnd(s: Segment, to: Vec2): Segment | null {
  switch (s.kind) {
    case 'line':
      return approxZero(dist(s.a, to), EPS_LENGTH) ? null : line(s.a, to);
    case 'arc':
      return arcFromChord(start(s), to, s.sweepAngle);
    case 'cubic': {
      if (approxZero(dist(s.p0, to), EPS_LENGTH)) return null;
      const delta = sub(to, s.p3);
      return cubic(s.p0, s.p1, add(s.p2, delta), to);
    }
  }
}
