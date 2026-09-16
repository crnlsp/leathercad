import { EPS_LENGTH, type Mm } from '@leathercad/core';
import { selfIntersections, type Intersection, type Path } from '@leathercad/geometry';

import type { FeatureId, PartId } from './feature.js';
import type { ResolvedProject } from './evaluate.js';
import type { StitchHoles } from './stitch.js';
import {
  PROBLEM_CODES,
  problem,
  type Diagnostic,
  type Problem,
  type ProblemLocation,
} from './problems/index.js';

/**
 * The design rules: states that are legal and probably wrong for leather.
 *
 * ADR 0013's third category. A rule never blocks an edit — a part legitimately
 * has no outline while it is being redrawn — so rules are only ever reported.
 * Each rule's code names the invariant it protects in `PROBLEM_CODES`, and the
 * catalogue with thresholds is docs/domain-model.md §8.6.
 *
 * Only features that resolved are judged. A failed feature is already listed
 * with its outcome, and has no geometry to judge anyway.
 */

/**
 * How far the achieved spacing may drift from the iron's pitch before it is
 * worth a warning (`HOLE_SPACING_DEVIATION`).
 *
 * A quarter of the nominal pitch. Tighter than that and the holes crowd — at
 * the extreme they tear out between each other — while looser leaves a seam
 * that visibly does not match the iron it was cut for. Either way the geometry
 * is exactly what was asked for, so this is a warning and not a refusal: the
 * maker may know something the software does not.
 */
export const SPACING_DEVIATION_FRACTION = 0.25;

/**
 * How far the runs of one hole set may differ from each other, as a fraction
 * of the pitch, before it is worth mentioning (`HOLE_SPACING_UNEVEN`).
 *
 * With a hole at every corner each side is divided on its own, so a long side
 * and a short one land on slightly different spacings. A few percent is
 * invisible; past five the change shows where the sides meet.
 */
export const SPACING_UNEVEN_FRACTION = 0.05;

/** Fewer holes than this cannot close a seam (`HOLE_COUNT_TOO_LOW`). */
export const MIN_HOLES_IN_A_SET = 2;

export function validate(resolved: ResolvedProject): Diagnostic[] {
  const found: Diagnostic[] = [];

  for (const { part, features } of resolved.parts) {
    if (part.features.length === 0) {
      found.push(placed(problem('EMPTY_PART', { partId: part.id, partName: part.name }), part.id));
    }

    for (const entry of features) {
      if (!entry.ok) continue;
      const { feature } = entry;
      const about = { featureId: feature.id, featureName: feature.name };

      if (feature.kind === 'cut-contour') {
        const crossings = crossingsOf(entry.path);
        if (crossings.length > 0) {
          found.push(
            placed(
              problem('CONTOUR_SELF_INTERSECTS', { ...about, crossings: crossings.length }),
              part.id,
              feature.id,
              { kind: 'points', points: crossings.map((crossing) => crossing.point) },
            ),
          );
        }
      }

      const source = feature.source;
      if (
        entry.holes !== undefined &&
        source.kind === 'derived' &&
        source.op.type === 'stitch-holes'
      ) {
        for (const p of holeProblems(entry.holes, source.op.pitchMm, about)) {
          found.push(placed(p, part.id, feature.id, { kind: 'path', path: entry.path }));
        }
      }
    }
  }

  return found;
}

function holeProblems(
  holes: StitchHoles,
  pitchMm: Mm,
  about: { featureId: FeatureId; featureName: string },
): Problem[] {
  // With fewer than two holes there is no spacing to judge.
  if (holes.count < MIN_HOLES_IN_A_SET) {
    return [problem('HOLE_COUNT_TOO_LOW', { ...about, count: holes.count })];
  }

  const found: Problem[] = [];

  if (Math.abs(holes.achievedPitchMm - pitchMm) > pitchMm * SPACING_DEVIATION_FRACTION) {
    found.push(
      problem('HOLE_SPACING_DEVIATION', {
        ...about,
        achievedMm: holes.achievedPitchMm,
        pitchMm,
      }),
    );
  }

  // A run too short to have a spacing of its own — one hole, its other end the
  // corner the previous run already punched — has nothing to compare.
  const spacings = holes.runs
    .map((run) => run.achievedPitchMm)
    .filter((spacing) => spacing > EPS_LENGTH);
  if (spacings.length > 1) {
    const narrowestMm = Math.min(...spacings);
    const widestMm = Math.max(...spacings);
    if (widestMm - narrowestMm > pitchMm * SPACING_UNEVEN_FRACTION) {
      found.push(problem('HOLE_SPACING_UNEVEN', { ...about, narrowestMm, widestMm }));
    }
  }

  return found;
}

/**
 * Self-intersections, memoised on the path object.
 *
 * The same identity trick as `evaluate`: an unchanged outline is the same
 * path between revisions, so a drawn outline with hundreds of segments is
 * checked once, not on every edit to some other part.
 */
const crossingsCache = new WeakMap<Path, readonly Intersection[]>();

function crossingsOf(path: Path): readonly Intersection[] {
  const cached = crossingsCache.get(path);
  if (cached !== undefined) return cached;
  const crossings = selfIntersections(path);
  crossingsCache.set(path, crossings);
  return crossings;
}

function placed(
  p: Problem,
  partId: PartId,
  featureId?: FeatureId,
  location?: ProblemLocation,
): Diagnostic {
  return {
    problem: p,
    severity: PROBLEM_CODES[p.code].severity,
    partId,
    ...(featureId === undefined ? {} : { featureId }),
    related: [],
    ...(location === undefined ? {} : { location }),
  };
}
