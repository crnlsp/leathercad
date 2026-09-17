import { EPS_LENGTH, type Mm } from '@leathercad/core';
import {
  PathOps,
  SegmentOps,
  selfIntersections,
  type Intersection,
  type Path,
  type Vec2,
} from '@leathercad/geometry';
import { missingGlyphs } from '@leathercad/typography';

import type { FeatureId, PartId } from './feature.js';
import type { ResolvedFeature, ResolvedProject } from './evaluate.js';
import { distanceToEdge, isOnMaterial, materialOf, type Material } from './material.js';
import { hasOuterContour } from './partStructure.js';
import type { StitchHoles } from './stitch.js';
import {
  PROBLEM_CODES,
  problem,
  type Diagnostic,
  type Problem,
  type ProblemLocation,
  type Severity,
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

/**
 * How close a hole may come to an edge before it is worth a warning.
 *
 * Under about a millimetre and a half the leather between the hole and the
 * edge tears out — at the awl, at the needle, or in use. It is a warning
 * rather than a refusal because thin, firm leather and a small iron can carry
 * less, and the maker knows which they have.
 */
export const MIN_HOLE_EDGE_CLEARANCE_MM: Mm = 1.5;

/**
 * How many points along a line are asked whether they are on the material.
 *
 * **These rules are sampled, not proved.** Containment is asked at a finite
 * number of points, so a path that leaves the leather and returns between two
 * of them is not reported: the rules find mistakes, they do not certify their
 * absence. That is the right trade for a warning — an exact answer needs
 * path-against-path clipping, which this project does not have and has
 * deliberately not bought (ADR 0008). Anything that comes to depend on these
 * being exact is depending on something untrue.
 *
 * The one place the convention used to be wrong rather than merely coarse was
 * the end of an open path, which no sample ever reached — see `pointsAlong`.
 */
const SAMPLES_ALONG_A_LINE = 24;

export function validate(resolved: ResolvedProject): Diagnostic[] {
  const found: Diagnostic[] = [];

  for (const resolvedPart of resolved.parts) {
    const { part, features } = resolvedPart;
    if (part.features.length === 0) {
      found.push(placed(problem('EMPTY_PART', { partId: part.id, partName: part.name }), part.id));
    }

    const material = materialOf(resolvedPart);

    // DR1: a part is a piece of leather with one edge. Features with nothing
    // to cut them from are a part that cannot be made. Asked of the
    // parameters: an outline that fails to build is still an outline, and
    // telling the user to draw another one is advice the command refuses.
    if (part.features.length > 0 && !hasOuterContour(part)) {
      found.push(
        placed(
          problem('PART_HAS_NO_OUTER_CONTOUR', { partId: part.id, partName: part.name }),
          part.id,
        ),
      );
    }

    // DR2: everything in a part lies on its material. Only askable once there
    // is material to be off.
    if (material.outer !== null) {
      for (const entry of features) {
        if (!entry.ok) continue;
        for (const { problem: p, points } of offMaterial(entry, material)) {
          found.push(
            placed(
              p,
              part.id,
              entry.feature.id,
              // The holes at fault where a rule knows them, the whole feature
              // where it does not: "which hole" is the question the maker has
              // to answer before they can fix anything.
              points === undefined
                ? { kind: 'path', path: entry.path }
                : { kind: 'points', points },
              p.code === 'OUTSIDE_PART' && p.facts.what === 'line' ? 'warning' : undefined,
            ),
          );
        }
      }
    }

    // A part's name is printed above it on the sheet. A character the vendored
    // typeface has no glyph for prints as a box rather than throwing (ADR
    // 0011), so it is reported instead of refused.
    const unprintable = missingGlyphs(part.name);
    if (unprintable.length > 0) {
      found.push(
        placed(
          problem('TEXT_GLYPH_MISSING', {
            partId: part.id,
            partName: part.name,
            text: part.name,
            characters: unprintable.join(' '),
          }),
          part.id,
        ),
      );
    }

    for (const entry of features) {
      if (!entry.ok) continue;
      const { feature } = entry;
      const about = { featureId: feature.id, featureName: feature.name };

      // A label's own words print too, and the same typeface has to carry them.
      if (feature.kind === 'text-label') {
        const unprintable = missingGlyphs(feature.source.text);
        if (unprintable.length > 0) {
          found.push(
            placed(
              problem('TEXT_GLYPH_MISSING', {
                partId: part.id,
                partName: part.name,
                ...about,
                text: feature.source.text,
                characters: unprintable.join(' '),
              }),
              part.id,
              feature.id,
              { kind: 'path', path: entry.path },
            ),
          );
        }
      }

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
 * A material rule, and the geometry that would let the user act on it.
 *
 * `points` are the holes at fault. A set of three thousand holes with one too
 * near an edge is not corrected by highlighting eleven metres of stitch line —
 * the maker has to be shown *which* hole, so the ones that broke the rule
 * travel with it.
 */
interface MaterialProblem {
  readonly problem: Problem;
  readonly points?: readonly Vec2[];
}

/**
 * Everything wrong with where this feature sits on the leather.
 *
 * One pass per feature, because the questions share their work: a hole set is
 * asked where its holes are once, and both rules read the answer.
 */
function offMaterial(
  entry: Extract<ResolvedFeature, { ok: true }>,
  material: Material,
): MaterialProblem[] {
  const { feature } = entry;
  const about = { featureId: feature.id, featureName: feature.name };
  const found: MaterialProblem[] = [];

  // A cut-out that is not inside its part cuts nothing.
  if (feature.kind === 'cut-contour' && feature.role === 'inner') {
    const outside = pointsAlong(entry.path).some(
      (point) => !PathOps.containsPoint(material.outer!, point),
    );
    if (outside) found.push({ problem: problem('CUT_OUT_OUTSIDE_PART', about) });
    return found;
  }

  const punched = holePoints(entry);
  if (punched !== null) {
    const off = punched.filter((point) => !isOnMaterial(material, point));
    if (off.length > 0) {
      found.push({ problem: problem('OUTSIDE_PART', { ...about, what: 'holes' }), points: off });
      // Where a hole is off the material entirely, how near the edge it sits
      // is not the thing to say about it.
      return found;
    }

    // One pass rather than a min and then a filter: the nearest clearance and
    // the holes that share it come out of the same walk.
    let clearanceMm = Number.POSITIVE_INFINITY;
    const tight: Vec2[] = [];
    for (const point of punched) {
      const distance = distanceToEdge(material, point);
      if (distance >= MIN_HOLE_EDGE_CLEARANCE_MM) continue;
      if (distance < clearanceMm) clearanceMm = distance;
      tight.push(point);
    }

    if (tight.length > 0) {
      found.push({
        problem: problem('HOLE_TOO_CLOSE_TO_EDGE', {
          ...about,
          clearanceMm,
          minimumMm: MIN_HOLE_EDGE_CLEARANCE_MM,
        }),
        points: tight,
      });
    }
    return found;
  }

  // A line that wanders off the leather marks nothing where it left.
  if (
    feature.kind === 'stitch-line' ||
    feature.kind === 'fold-line' ||
    feature.kind === 'marking-line'
  ) {
    const off = pointsAlong(entry.path).some((point) => !isOnMaterial(material, point));
    if (off) found.push({ problem: problem('OUTSIDE_PART', { ...about, what: 'line' }) });
  }

  return found;
}

/**
 * Where this feature is punched, or null when it punches nothing.
 *
 * A hole set is its holes; a hardware hole is the centre of its circle, which
 * is what the punch is lined up on.
 */
function holePoints(entry: Extract<ResolvedFeature, { ok: true }>): readonly Vec2[] | null {
  if (entry.holes !== undefined) return entry.holes.holes.map((hole) => hole.point);

  const source = entry.feature.source;
  if (
    entry.feature.kind === 'hardware-hole' &&
    source.kind === 'shape' &&
    source.shape.type === 'circle'
  ) {
    return [source.shape.centre];
  }
  return null;
}

/**
 * Points along a path, for asking whether it stays on the leather.
 *
 * An **open** path is sampled to its far end as well: a closed one's end is
 * its start and already sampled, but a line's is not, and a marking line that
 * overshoots the edge does it at exactly that point. Missing it meant a 1 mm
 * overshoot went unreported while a 5 mm one did not, for no reason the user
 * could see.
 *
 * Between the samples nothing is claimed — see `SAMPLES_ALONG_A_LINE`.
 */
function pointsAlong(path: Path): Vec2[] {
  if (path.segments.length === 0) return [];

  const measure = PathOps.measure(path);
  const total = measure.totalLength();
  const points: Vec2[] = [];
  const steps = path.closed ? SAMPLES_ALONG_A_LINE : SAMPLES_ALONG_A_LINE + 1;

  for (let i = 0; i < steps; i++) {
    const at = measure.locate((total * i) / SAMPLES_ALONG_A_LINE);
    points.push(SegmentOps.pointAt(path.segments[at.segmentIndex]!, at.t));
  }
  return points;
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
  severity?: Severity,
): Diagnostic {
  return {
    problem: p,
    // The registry's default, unless this occurrence is different in kind: a
    // hole off the material cannot be punched, while a line off it is a guide
    // that overshoots (domain-model.md §8.6).
    severity: severity ?? PROBLEM_CODES[p.code].severity,
    partId,
    ...(featureId === undefined ? {} : { featureId }),
    related: [],
    ...(location === undefined ? {} : { location }),
  };
}
