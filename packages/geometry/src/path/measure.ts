import { EPS_LENGTH, type Mm } from '@leathercad/core';

import * as Seg from '../segment/index.js';
import { EXPORT_TOLERANCE_MM } from '../tolerance.js';
import { perp, tryNormalise, ZERO, type Vec2 } from '../vec2.js';
import type { Path } from './path.js';

/** Where a distance along the path lands. */
export interface PathLocation {
  readonly segmentIndex: number;
  /** The segment's natural parameter, in [0, 1]. */
  readonly t: number;
  /** Distance from the start of the whole path. */
  readonly distance: Mm;
}

interface Sample {
  readonly segmentIndex: number;
  readonly t: number;
  readonly distance: Mm;
}

/**
 * Answers "where is the point 3.85 mm along this path".
 *
 * The natural parameter `t` cannot answer that: on a cubic it is not
 * proportional to distance, so stepping `t` by a constant produces holes that
 * bunch on the curves and spread on the straights. Every stitch hole in the
 * application depends on getting this right.
 *
 * Builds a table of exact cumulative arc lengths once, then binary-searches it
 * and refines with Newton against the true speed. Construction is the
 * expensive part, so hold on to the instance — the evaluator caches one per
 * resolved path.
 *
 * See docs/geometry.md §5.2.
 */
export class PathMeasure {
  private readonly samples: readonly Sample[];
  private readonly total: Mm;

  constructor(
    private readonly path: Path,
    tolerance: Mm = EXPORT_TOLERANCE_MM,
  ) {
    const samples: Sample[] = [];
    let cumulative = 0;

    for (let index = 0; index < path.segments.length; index++) {
      const segment = path.segments[index]!;

      // Every segment needs its own t=0 entry, not just the first. Without
      // one, a distance falling inside segment k brackets between the last
      // sample of k−1 and the first of k, which straddles a boundary where t
      // resets — and the straddle guard below then snaps it to the segment
      // start. For a line, which needs only one step, that collapsed the
      // whole edge onto its first corner.
      samples.push({ segmentIndex: index, t: 0, distance: cumulative });

      const steps = stepsFor(segment, tolerance);
      for (let step = 1; step <= steps; step++) {
        const t0 = (step - 1) / steps;
        const t1 = step / steps;
        cumulative += Seg.lengthBetween(segment, t0, t1);
        samples.push({ segmentIndex: index, t: t1, distance: cumulative });
      }
    }

    this.samples = samples;
    this.total = cumulative;
  }

  /**
   * Total arc length.
   *
   * Equal to `PathOps.length` to within floating point: both sum the same
   * exact per-segment lengths, this one just does it in pieces.
   */
  totalLength(): Mm {
    return this.total;
  }

  /**
   * The segment and parameter at a distance along the path.
   *
   * Distances outside `[0, totalLength]` clamp to the ends rather than
   * extrapolating — a caller asking past the end wants the end.
   */
  locate(distance: Mm): PathLocation {
    if (this.samples.length === 0) {
      return { segmentIndex: 0, t: 0, distance: 0 };
    }
    if (distance <= 0) {
      const first = this.samples[0]!;
      return { segmentIndex: first.segmentIndex, t: first.t, distance: 0 };
    }
    if (distance >= this.total) {
      const last = this.samples[this.samples.length - 1]!;
      return { segmentIndex: last.segmentIndex, t: last.t, distance: this.total };
    }

    // Binary search for the bracketing pair.
    let low = 0;
    let high = this.samples.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (this.samples[mid]!.distance <= distance) low = mid;
      else high = mid;
    }

    const before = this.samples[low]!;
    const after = this.samples[high]!;

    // A sample pair can straddle a segment boundary, where t jumps back to 0.
    // Interpolating across that would be meaningless, so snap to the boundary.
    if (before.segmentIndex !== after.segmentIndex) {
      return { segmentIndex: after.segmentIndex, t: 0, distance };
    }

    const span = after.distance - before.distance;
    const fraction = span > EPS_LENGTH ? (distance - before.distance) / span : 0;
    const guess = before.t + (after.t - before.t) * fraction;

    return {
      segmentIndex: before.segmentIndex,
      t: this.refine(before, distance, guess),
      distance,
    };
  }

  pointAtDistance(distance: Mm): Vec2 {
    const at = this.locate(distance);
    const segment = this.path.segments[at.segmentIndex];
    return segment === undefined ? ZERO : Seg.pointAt(segment, at.t);
  }

  /** Unit direction of travel. */
  tangentAtDistance(distance: Mm): Vec2 {
    const at = this.locate(distance);
    const segment = this.path.segments[at.segmentIndex];
    return segment === undefined ? ZERO : Seg.tangentAt(segment, at.t);
  }

  /**
   * Unit normal, a quarter turn counter-clockwise from the tangent.
   *
   * With Y up this points to the **left** of travel, which is the same
   * convention `offsetPath` uses for a positive distance.
   */
  normalAtDistance(distance: Mm): Vec2 {
    const tangent = this.tangentAtDistance(distance);
    return tryNormalise(perp(tangent)) ?? ZERO;
  }

  /**
   * Newton refinement of the interpolated parameter.
   *
   * Linear interpolation between samples is only first-order accurate, and on
   * a curve whose speed varies sharply that shows up as visibly uneven stitch
   * spacing. Two steps against the true speed removes it.
   */
  private refine(before: Sample, targetDistance: Mm, guess: number): number {
    const segment = this.path.segments[before.segmentIndex];
    if (segment === undefined) return guess;

    let t = guess;
    for (let i = 0; i < 2; i++) {
      const covered = before.distance + Seg.lengthBetween(segment, before.t, t);
      const error = covered - targetDistance;

      const speed = speedAt(segment, t);
      if (speed <= EPS_LENGTH) break;

      t -= error / speed;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
    }
    return t;
  }
}

/** |dP/dt| — how fast the point moves per unit of parameter. */
function speedAt(s: Seg.Segment, t: number): number {
  switch (s.kind) {
    case 'line':
      return Seg.LineOps.length(s);
    case 'arc':
      return Math.abs(s.sweepAngle) * s.radius;
    case 'cubic': {
      const velocity = Seg.CubicOps.derivativeAt(s, t);
      return Math.hypot(velocity.x, velocity.y);
    }
  }
}

/**
 * How many table entries one segment needs.
 *
 * Lines and arcs are linear in `t`, so a single entry is exact for a line and
 * a handful suffices for an arc. Cubics get enough that linear interpolation
 * starts close, leaving Newton little to do.
 */
function stepsFor(s: Seg.Segment, tolerance: Mm): number {
  if (s.kind === 'line') return 1;

  const length = Seg.length(s);
  if (length <= tolerance) return 1;

  const wanted = Math.ceil(length / Math.max(tolerance * 20, 1e-6));
  return Math.min(256, Math.max(s.kind === 'arc' ? 4 : 16, wanted));
}

/** Convenience for a one-off query; build a PathMeasure for repeated use. */
export function measure(path: Path, tolerance?: Mm): PathMeasure {
  return new PathMeasure(path, tolerance);
}
