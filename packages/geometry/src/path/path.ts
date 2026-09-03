import { EPS_POINT, type Mm } from '@leathercad/core';

import type { Mat2x3 } from '../mat2x3.js';
import { unionAll, type Rect } from '../rect.js';
import * as Seg from '../segment/index.js';
import { dist, type Vec2 } from '../vec2.js';

/**
 * An ordered run of segments that share endpoints.
 *
 * **Invariant:** consecutive segments meet within `EPS_POINT`, and when
 * `closed` is set the last segment ends where the first begins.
 *
 * Storing endpoints on every segment is redundant — a command-list form would
 * not — but it means any segment can be examined, split, offset or reversed
 * without walking the path to work out where it starts. That redundancy is
 * checked by `validate`, not assumed.
 */
export interface Path {
  readonly segments: readonly Seg.Segment[];
  readonly closed: boolean;
}

/** Builds a path and rejects one whose segments do not join up. */
export function path(segments: readonly Seg.Segment[], closed = false): Path {
  const candidate: Path = { segments: [...segments], closed };
  const problems = validate(candidate);
  if (problems.length > 0) {
    throw new RangeError(`invalid path: ${problems.join('; ')}`);
  }
  return candidate;
}

/**
 * Builds a path without checking the invariant.
 *
 * For internal use where the segments were just constructed to join by
 * definition — offsetting and flattening produce thousands of these. Anything
 * accepting outside data should use `path`.
 */
export function unsafePath(segments: readonly Seg.Segment[], closed = false): Path {
  return { segments, closed };
}

export function open(segments: readonly Seg.Segment[]): Path {
  return path(segments, false);
}

export function closed(segments: readonly Seg.Segment[]): Path {
  return path(segments, true);
}

/** A polyline through the given points. */
export function polyline(points: readonly Vec2[], isClosed = false): Path {
  if (points.length < 2) {
    return unsafePath([], isClosed);
  }

  const segments: Seg.Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push(Seg.line(points[i]!, points[i + 1]!));
  }
  if (isClosed) {
    const last = points[points.length - 1]!;
    const first = points[0]!;
    if (dist(last, first) > EPS_POINT) segments.push(Seg.line(last, first));
  }
  return unsafePath(segments, isClosed);
}

/**
 * Returns a human-readable problem for each broken invariant, empty when the
 * path is well formed.
 *
 * Runs in tests and on file load — never in a hot path.
 */
export function validate(p: Path, tolerance: Mm = EPS_POINT): string[] {
  const problems: string[] = [];

  if (p.segments.length === 0) {
    if (p.closed) problems.push('a closed path must have at least one segment');
    return problems;
  }

  for (let i = 0; i < p.segments.length - 1; i++) {
    const gap = dist(Seg.end(p.segments[i]!), Seg.start(p.segments[i + 1]!));
    if (gap > tolerance) {
      problems.push(
        `segment ${i} ends ${gap.toPrecision(4)} mm from where segment ${i + 1} starts`,
      );
    }
  }

  if (p.closed) {
    const gap = dist(Seg.end(p.segments[p.segments.length - 1]!), Seg.start(p.segments[0]!));
    if (gap > tolerance) {
      problems.push(
        `closed path leaves a ${gap.toPrecision(4)} mm gap between its last and first segment`,
      );
    }
  }

  return problems;
}

export function isValid(p: Path, tolerance: Mm = EPS_POINT): boolean {
  return validate(p, tolerance).length === 0;
}

export function isEmpty(p: Path): boolean {
  return p.segments.length === 0;
}

export function start(p: Path): Vec2 | null {
  const first = p.segments[0];
  return first === undefined ? null : Seg.start(first);
}

export function end(p: Path): Vec2 | null {
  const last = p.segments[p.segments.length - 1];
  return last === undefined ? null : Seg.end(last);
}

/**
 * The shared points between segments, plus the outer endpoints.
 *
 * For a closed path the repeated final point is omitted, so the count equals
 * the number of segments.
 */
export function vertices(p: Path): Vec2[] {
  if (p.segments.length === 0) return [];

  const result: Vec2[] = [Seg.start(p.segments[0]!)];
  for (const segment of p.segments) result.push(Seg.end(segment));
  if (p.closed) result.pop();
  return result;
}

export function length(p: Path): Mm {
  let total = 0;
  for (const segment of p.segments) total += Seg.length(segment);
  return total;
}

/** Exact bounds. Null for an empty path. */
export function bbox(p: Path): Rect | null {
  return unionAll(p.segments.map((s) => Seg.bbox(s)));
}

export function reverse(p: Path): Path {
  const segments = [...p.segments].reverse().map((s) => Seg.reverse(s));
  return unsafePath(segments, p.closed);
}

/**
 * Returns a new path with the transform applied.
 *
 * A single arc can become several cubics under a non-uniform scale, so the
 * segment count is not preserved.
 */
export function transform(p: Path, m: Mat2x3, tolerance?: Mm): Path {
  const segments = p.segments.flatMap((s) =>
    s.kind === 'arc' ? Seg.ArcOps.transform(s, m, tolerance) : Seg.transform(s, m),
  );
  return unsafePath(segments, p.closed);
}

/** Every segment as cubics, in order. */
export function toCubics(p: Path, tolerance?: Mm): Seg.CubicSegment[] {
  return p.segments.flatMap((s) => Seg.toCubics(s, tolerance));
}
