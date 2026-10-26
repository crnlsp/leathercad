import { EPS_LENGTH, approxGte, approxZero, type Mm } from '@leathercad/core';
import { PathOps, distributeAlongPath, subPath, type Path, type Vec2 } from '@leathercad/geometry';

import { cornerDistances } from './anchors.js';
import type { Derivation } from './feature.js';

/**
 * What distribution reads of a hole set's op: the pitch and the policy, not
 * the iron's name. Narrow, so a row of holes (4.14) can be placed by the same
 * code with its own fixed policy.
 */
type Distribution = Pick<
  Extract<Derivation, { type: 'stitch-holes' }>,
  'pitchMm' | 'mode' | 'corners' | 'startOffsetMm' | 'endOffsetMm'
>;

/**
 * The finest pitch a hole set may have: the editor's floor, and evaluation's.
 *
 * Nothing near it is a pricking iron — the common pitches start at 2.7 mm —
 * so it refuses no real stitching. What it refuses is a pitch that would make
 * distribution place `length / pitch` holes without bound: a file holding
 * `1e-300` passed the schema and ran the process out of memory (slice 5.6). A
 * number the editor cannot produce is refused on the one hole set, by name,
 * and the rest of the project still opens.
 */
export const MIN_PITCH_MM: Mm = 0.5;

/**
 * One awl hole.
 *
 * No id, deliberately. A hole is pure derived output, and giving it an
 * identity would create an obligation to preserve that identity across
 * regeneration — which happens whenever a dimension changes, exactly when the
 * count changes too. There is no correct answer to "which of the old 84 holes
 * is this one of the new 86", so a hole is addressed positionally instead.
 *
 * When suppression arrives it belongs on the *set*, as a list of ordinals,
 * because a parameter survives regeneration by definition.
 */
export interface StitchHole {
  readonly point: Vec2;
  /** Along the run, for orienting a diamond chisel later. */
  readonly tangent: Vec2;
  readonly runIndex: number;
  readonly ordinal: number;
}

/** What one continuous run of stitching produced. */
export interface RunReport {
  readonly lengthMm: Mm;
  /**
   * The holes on this run, a corner hole at either end included (U.17). A
   * corner hole is on the two runs it joins, so a set's runs add up to its
   * count plus one per shared corner: 24 · 51 · 24 · 51 round 146 holes.
   */
  readonly count: number;
  readonly achievedPitchMm: Mm;
}

export interface StitchHoles {
  readonly holes: readonly StitchHole[];
  readonly count: number;
  /**
   * The spacing actually achieved, over the whole set.
   *
   * Pitch is nominal and spacing is achieved — see docs/glossary.md. A 3.85 mm
   * iron rarely divides a real outline exactly, and the number the user needs
   * is this one.
   */
  readonly achievedPitchMm: Mm;
  /**
   * What each run achieved. Whether any of it is worth telling the user about
   * is a design rule's decision, not distribution's: see `validate.ts`.
   */
  readonly runs: readonly RunReport[];
  /**
   * How big each hole is punched, on a row of holes (4.14) and its mirrors.
   *
   * Absent on a stitch hole set, whose holes are points: where the iron's
   * tooth goes in. Carried here rather than read from the feature because a
   * mirrored row's op is its mirror, not the row's.
   */
  readonly radiusMm?: Mm;
}

/**
 * Places holes along a stitch line.
 *
 * `continuous` runs the distribution round the whole line, which is right when
 * there are no corners to respect — a circle, or a gentle curve.
 *
 * `hole-at-corner` splits the line at its corners and distributes each run
 * separately, so a hole lands exactly on every corner. That is what a
 * leatherworker expects and it is the detail that says the tool was written by
 * someone who has stitched. The shared hole where two runs meet is emitted
 * once: a doubled corner hole is invisible until someone punches it.
 *
 * **Precondition:** `op.pitchMm` is at least `MIN_PITCH_MM`, or this throws a
 * `RangeError` before generating anything. `evaluate` checks it first and
 * reports a `PARAMETER_INVALID` on the hole set instead.
 *
 * The distribution itself is `distributeAlongPath`, which computes positions
 * as `start + k x pitch` rather than by accumulating, so hundreds of holes do
 * not drift.
 */
export function distributeHoles(line: Path, op: Distribution): StitchHoles {
  // The precondition behind evaluate's check: holes are made here and nowhere
  // else, so a pitch under the floor cannot reach generation from any caller.
  // evaluate refuses it first with a Problem naming the hole set (5.6).
  if (!approxGte(op.pitchMm, MIN_PITCH_MM, EPS_LENGTH)) {
    throw new RangeError(
      `pitchMm must be at least ${String(MIN_PITCH_MM)} mm, received ${String(op.pitchMm)}`,
    );
  }
  const runs = op.corners === 'hole-at-corner' ? splitAtCorners(line) : [line];

  const holes: StitchHole[] = [];
  const reports: RunReport[] = [];
  const totalLength = PathOps.length(line);

  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    const run = runs[runIndex]!;
    const measure = PathOps.measure(run);
    const lengthMm = measure.totalLength();
    if (approxZero(lengthMm, EPS_LENGTH)) continue;

    const distribution = distributeAlongPath(measure, {
      mode: op.mode,
      pitchMm: op.pitchMm,
      ...(op.startOffsetMm === undefined ? {} : { startOffsetMm: op.startOffsetMm }),
      ...(op.endOffsetMm === undefined ? {} : { endOffsetMm: op.endOffsetMm }),
      closed: run.closed,
    });

    // Where two runs meet, the last hole of one is the first of the next. Drop
    // the duplicate rather than punching the corner twice.
    const points = dropSharedStart(distribution.points, holes);

    for (let ordinal = 0; ordinal < points.length; ordinal++) {
      const p = points[ordinal]!;
      holes.push({ point: p.point, tangent: p.tangent, runIndex, ordinal });
    }

    // Every hole on the run, the corner holes at both its ends included: what
    // a maker counts along that edge (U.17). A corner hole is on both runs it
    // joins, and punched once.
    reports.push({
      lengthMm,
      count: distribution.points.length,
      achievedPitchMm: distribution.actualPitch,
    });
  }

  // The last run's final hole meets the first run's first hole on a closed
  // line, and that pair is a duplicate too.
  const deduped = dropSharedEnd(holes, runs.length > 1 && line.closed);

  // On a closed ring the holes and the gaps between them are equal in number;
  // an open run has one fewer gap than holes. Counting per run and adding up
  // misses the gap that spans each corner, which belongs to neither run.
  const intervals = line.closed ? deduped.length : Math.max(1, deduped.length - 1);
  const achievedPitchMm = deduped.length > 0 ? totalLength / intervals : 0;

  return {
    holes: deduped,
    count: deduped.length,
    achievedPitchMm,
    runs: reports,
  };
}

/**
 * Places a row of punched holes along a line (4.14).
 *
 * The same placement as a hole set's defaults — a hole on each end of an open
 * line, the rest evenly between, one on every corner, and a closed line
 * divided with no doubled hole where it closes — with each hole a circle of
 * `op.radiusMm`.
 *
 * **Precondition:** the radius is positive and finite, and the pitch at least
 * `MIN_PITCH_MM`, or this throws a `RangeError`. `evaluate` checks both first.
 */
export function rowOfHoles(line: Path, op: Extract<Derivation, { type: 'hole-row' }>): StitchHoles {
  if (!(Number.isFinite(op.radiusMm) && op.radiusMm > 0)) {
    throw new RangeError(`radiusMm must be greater than zero, received ${String(op.radiusMm)}`);
  }
  const placed = distributeHoles(line, {
    pitchMm: op.pitchMm,
    mode: 'fit-whole',
    corners: 'hole-at-corner',
  });
  return { ...placed, radiusMm: op.radiusMm };
}

/**
 * Cuts a stitch line at its corners.
 *
 * A line with no corners — a circle, a single arc — comes back whole, so the
 * caller does not have to special-case it.
 */
export function splitAtCorners(line: Path): readonly Path[] {
  const corners = cornerDistances(line);
  if (corners.length === 0) return [line];

  const runs: Path[] = [];
  for (let i = 0; i < corners.length; i++) {
    const from = corners[i]!;
    const to = corners[(i + 1) % corners.length]!;

    // An open line also has the stretches before the first corner and after
    // the last, which no corner pair covers.
    if (!line.closed && i === corners.length - 1) continue;

    runs.push(subPath(line, from, to));
  }

  if (!line.closed) {
    const total = PathOps.length(line);
    runs.unshift(subPath(line, 0, corners[0]!));
    runs.push(subPath(line, corners[corners.length - 1]!, total));
  }

  return runs.filter((r) => r.segments.length > 0);
}

function dropSharedStart(
  points: readonly { point: Vec2; tangent: Vec2 }[],
  placed: readonly StitchHole[],
): readonly { point: Vec2; tangent: Vec2 }[] {
  const last = placed[placed.length - 1];
  const first = points[0];
  if (last === undefined || first === undefined) return points;

  return coincident(last.point, first.point) ? points.slice(1) : points;
}

function dropSharedEnd(holes: readonly StitchHole[], closedRing: boolean): readonly StitchHole[] {
  if (!closedRing || holes.length < 2) return holes;

  const first = holes[0]!;
  const last = holes[holes.length - 1]!;
  return coincident(first.point, last.point) ? holes.slice(0, -1) : holes;
}

function coincident(a: Vec2, b: Vec2): boolean {
  return approxZero(Math.hypot(b.x - a.x, b.y - a.y), EPS_LENGTH);
}
