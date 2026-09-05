import { approxZero, EPS_LENGTH, type Mm } from '@leathercad/core';

import { measure, open, type Path } from '../path/index.js';
import { split, type Segment } from '../segment/index.js';

/**
 * The run of a path between two arc-length positions.
 *
 * Always **open**: a run has two ends by definition. A caller wanting the whole
 * of a closed path already has it and does not need this.
 *
 * Needed twice over. A stitch line on three sides of a pocket is a run between
 * two corners; and a hole on every corner is implemented by splitting at the
 * corners and distributing along each run separately, which is the same
 * operation. See docs/domain-model.md §6.
 *
 * On a closed path `from > to` wraps through the start, which is how a run
 * that straddles the path's origin is expressed. On an open path there is
 * nothing to wrap through, and asking is a programming error.
 */
export function subPath(p: Path, fromMm: Mm, toMm: Mm): Path {
  const m = measure(p);
  const total = m.totalLength();

  const from = clamp(fromMm, total);
  const to = clamp(toMm, total);

  if (approxZero(from - to, EPS_LENGTH)) return open([]);

  if (from > to) {
    if (!p.closed) {
      throw new RangeError(
        'subPath cannot wrap on an open path: there is nothing to wrap through. ' +
          `Asked for ${String(fromMm)} to ${String(toMm)} on a run of ${String(total)} mm.`,
      );
    }
    return open([...forward(p, m, from, total).segments, ...forward(p, m, 0, to).segments]);
  }

  return forward(p, m, from, to);
}

/** The run from `from` to `to`, where `from <= to`. */
function forward(p: Path, m: ReturnType<typeof measure>, from: Mm, to: Mm): Path {
  const startAt = m.locate(from);
  const endAt = m.locate(to);

  // Inside one segment: cut twice. The second cut is expressed in the first
  // piece's own parameter, so it has to be rescaled rather than reused.
  if (startAt.segmentIndex === endAt.segmentIndex) {
    const segment = p.segments[startAt.segmentIndex];
    if (segment === undefined) return open([]);

    const tail = split(segment, startAt.t)[1];
    const remaining = 1 - startAt.t;
    if (approxZero(remaining, EPS_LENGTH)) return open([]);

    const cut = (endAt.t - startAt.t) / remaining;
    return open([split(tail, Math.min(1, Math.max(0, cut)))[0]]);
  }

  const segments: Segment[] = [];

  const first = p.segments[startAt.segmentIndex];
  if (first !== undefined) segments.push(split(first, startAt.t)[1]);

  for (let i = startAt.segmentIndex + 1; i < endAt.segmentIndex; i++) {
    const whole = p.segments[i];
    if (whole !== undefined) segments.push(whole);
  }

  const last = p.segments[endAt.segmentIndex];
  if (last !== undefined && !approxZero(endAt.t, EPS_LENGTH)) {
    segments.push(split(last, endAt.t)[0]);
  }

  return open(segments);
}

function clamp(value: Mm, total: Mm): Mm {
  return Math.min(total, Math.max(0, value));
}
