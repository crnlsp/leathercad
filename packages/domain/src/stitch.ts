import { EPS_LENGTH, approxZero, type Mm } from '@leathercad/core';
import { PathOps, distributeAlongPath, subPath, type Path, type Vec2 } from '@leathercad/geometry';

import { cornerDistances } from './anchors.js';
import type { Derivation } from './feature.js';

type StitchHolesOp = Extract<Derivation, { type: 'stitch-holes' }>;

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
  readonly runs: readonly RunReport[];
  /**
   * The achieved spacing has drifted far enough from the iron's pitch to be
   * worth telling the user about. See `SPACING_TOLERANCE_FRACTION`.
   */
  readonly spacingWarning: boolean;
}

/**
 * How far the achieved spacing may drift from the iron's pitch before it is
 * worth saying so.
 *
 * A quarter of the nominal pitch. Tighter than that and the holes crowd — at
 * the extreme they tear out between each other — while looser leaves a seam
 * that visibly does not match the iron it was cut for. Either way the geometry
 * is still exactly what was asked for, so this is a warning and not a refusal:
 * the maker may know something the software does not.
 */
const SPACING_TOLERANCE_FRACTION = 0.25;

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
 * The distribution itself is `distributeAlongPath`, which computes positions
 * as `start + k x pitch` rather than by accumulating, so hundreds of holes do
 * not drift.
 */
export function distributeHoles(line: Path, op: StitchHolesOp): StitchHoles {
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

    reports.push({
      lengthMm,
      count: points.length,
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
    spacingWarning:
      Math.abs(achievedPitchMm - op.pitchMm) > op.pitchMm * SPACING_TOLERANCE_FRACTION,
  };
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
