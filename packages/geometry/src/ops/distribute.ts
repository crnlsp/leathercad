import { approxZero, assertFinite, EPS_LENGTH, invariant, type Mm } from '@leathercad/core';

import type { PathMeasure } from '../path/measure.js';
import type { Vec2 } from '../vec2.js';

/** One placed point, with the direction of travel along the path there. */
export interface DistributedPoint {
  /** Arc length from the start of the path, in millimetres. */
  readonly distance: Mm;
  readonly point: Vec2;
  /** Unit tangent, pointing along the direction of increasing distance. */
  readonly tangent: Vec2;
}

export interface Distribution {
  readonly points: readonly DistributedPoint[];
  /**
   * The spacing actually achieved.
   *
   * Equal to `pitchMm` under `exact-pitch`. Under `fit-whole` it is the
   * usable length divided by a whole number of intervals, so it differs from
   * nominal — the domain layer warns when that deviation gets large enough to
   * matter to a stitch. See docs/glossary.md: pitch is nominal, spacing is
   * achieved.
   */
  readonly actualPitch: Mm;
}

export interface DistributeOptions {
  /**
   * `exact-pitch` steps by exactly `pitchMm` and leaves whatever remains at
   * the end. Right for an open run matched to a specific iron.
   *
   * `fit-whole` divides the run into a whole number of intervals and spreads
   * the rounding across all of them. Right for a closed contour, where a
   * leftover gap would be visible and wrong.
   */
  readonly mode: 'exact-pitch' | 'fit-whole';
  readonly pitchMm: Mm;
  /** Where the first point sits. On a closed path this is a phase shift. */
  readonly startOffsetMm?: Mm;
  /** Distance from the end left clear. Meaningless on a closed path. */
  readonly endOffsetMm?: Mm;
  readonly closed: boolean;
}

/**
 * Places points at a regular spacing along a path — the stitch hole
 * primitive, with the craft policy left to `domain`.
 *
 * Distances are computed as `start + k × pitch` from the index, never by
 * repeatedly adding a pitch. Accumulated addition drifts, and over the
 * hundreds of holes in a wallet the drift is measurable: the same lesson the
 * tick generator in slice 2.5 records.
 *
 * Corner handling is not here. A hole at every corner is a domain policy,
 * implemented by splitting the path at its corners and calling this once per
 * run. See docs/domain-model.md §6.
 *
 * On degenerate input:
 *
 * - A usable run of zero length — an empty path, or offsets that consume it —
 *   returns no points rather than throwing. Nothing to stitch is not an error.
 * - Under `fit-whole`, a run shorter than half a pitch would round to zero
 *   intervals; it is clamped to one, so a short run gets a point at each end
 *   rather than none and the division below is always safe. The achieved
 *   pitch then deviates from nominal by more than the usual half interval,
 *   which is the domain layer's cue to warn.
 * - A rounding tie — a run exactly two and a half pitches long — rounds up,
 *   because `Math.round` does. Deterministic, and pinned by a test.
 * - A non-finite pitch or offset, or a pitch of zero or less, throws. These
 *   are programming errors, not something a user can type.
 *
 * See docs/geometry.md §9.
 */
export function distributeAlongPath(measure: PathMeasure, opts: DistributeOptions): Distribution {
  const { mode, closed } = opts;
  const pitch = assertFinite(opts.pitchMm, 'pitchMm');
  const startOffset = assertFinite(opts.startOffsetMm ?? 0, 'startOffsetMm');
  const endOffset = assertFinite(opts.endOffsetMm ?? 0, 'endOffsetMm');

  if (pitch <= 0) {
    throw new RangeError(`pitchMm must be greater than zero, received ${pitch}`);
  }

  // A closed path has no end to hold clear of. Silently ignoring the value
  // would hide a caller's misunderstanding of the model.
  invariant(
    !closed || approxZero(endOffset, EPS_LENGTH),
    'endOffsetMm has no meaning on a closed path; use startOffsetMm to shift the phase',
  );

  const total = measure.totalLength();

  // On a closed path the run is the whole loop and the offset only decides
  // where the first point falls.
  const usable = closed ? total : total - startOffset - endOffset;

  if (!(usable > EPS_LENGTH)) {
    return { points: [], actualPitch: pitch };
  }

  const { count, actualPitch } = plan(mode, closed, usable, pitch);

  const points: DistributedPoint[] = [];
  for (let k = 0; k < count; k++) {
    // From the index, not by accumulation.
    const raw = startOffset + k * actualPitch;
    const distance = closed ? wrap(raw, total) : Math.min(raw, total);

    points.push({
      distance,
      point: measure.pointAtDistance(distance),
      tangent: measure.tangentAtDistance(distance),
    });
  }

  return { points, actualPitch };
}

/** How many points to place, and at what spacing. */
function plan(
  mode: 'exact-pitch' | 'fit-whole',
  closed: boolean,
  usable: Mm,
  pitch: Mm,
): { count: number; actualPitch: Mm } {
  if (mode === 'fit-whole') {
    // At least one interval: a run shorter than a single pitch still gets a
    // point at each end rather than nothing.
    const intervals = Math.max(1, Math.round(usable / pitch));

    // n intervals close a loop with n points; an open run needs the far end
    // too, so n + 1.
    return { count: closed ? intervals : intervals + 1, actualPitch: usable / intervals };
  }

  // exact-pitch. The epsilon keeps a run that is a whole multiple of the
  // pitch from losing its final point to a last-bit error — 77 / 3.85 is
  // 20.000000000000004, and a leatherworker who asked for 21 holes should
  // get 21.
  const intervals = Math.floor((usable + EPS_LENGTH) / pitch);

  // On a closed path a final point landing back on the first is one hole
  // punched twice.
  const closesExactly = closed && usable - intervals * pitch <= EPS_LENGTH;

  return { count: closesExactly ? intervals : intervals + 1, actualPitch: pitch };
}

/** Brings a distance back into [0, total) on a closed path. */
function wrap(distance: Mm, total: Mm): Mm {
  const m = distance % total;
  return m < 0 ? m + total : m;
}
