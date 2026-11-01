import { EPS_LENGTH, QUANTUM_MM, type Mm } from '@leathercad/core';
import {
  PathOps,
  SegmentOps,
  selfIntersections,
  type Intersection,
  type Path,
  Vec2Ops,
  type Vec2,
} from '@leathercad/geometry';
import { missingGlyphs } from '@leathercad/typography';

import type { Feature, FeatureId, PartId } from './feature.js';
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
 *
 * Measured from where the leather is cut: a stitch hole's point, and a
 * hardware hole's **rim** (Q33). It is the same strip of leather between a cut
 * and an edge that tears, whatever made the cut, so the one figure serves
 * both. Hardware that pulls harder may want more; that is a footprint's
 * question (roadmap 9.23), not this one's.
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

    // Each feature's findings from its geometry, against this material: DR2,
    // and the rules about its own shape and holes. Kept while their inputs are
    // the same objects (PERF-005), so a rename or an edit to another part
    // validates no geometry again.
    const ofFeatures = features.map((entry) =>
      entry.ok ? findingsOf(entry, part.id, material) : null,
    );

    // DR2: everything in a part lies on its material.
    for (const findings of ofFeatures) if (findings !== null) found.push(...findings.onMaterial);

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

    features.forEach((entry, i) => {
      if (!entry.ok) return;
      const { feature } = entry;

      // A label's own words print too, and the same typeface has to carry
      // them. Asked every time: the problem names the part.
      if (feature.kind === 'text-label') {
        const unprintable = missingGlyphs(feature.source.text);
        if (unprintable.length > 0) {
          found.push(
            placed(
              problem('TEXT_GLYPH_MISSING', {
                partId: part.id,
                partName: part.name,
                featureId: feature.id,
                featureName: feature.name,
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

      found.push(...ofFeatures[i]!.ownShape);
    });
  }

  return found;
}

/**
 * What validation finds from one feature's geometry: whether it lies on its
 * part's material (DR2), and the rules about its own shape and holes. Nothing
 * here reads a name but the feature's own, so a rename changes none of it.
 */
interface Findings {
  readonly onMaterial: readonly Diagnostic[];
  readonly ownShape: readonly Diagnostic[];
}

/**
 * The findings of a feature, and every object they were found from: the
 * feature, the path and holes it resolved to, its part, and that part's
 * outline and cut-outs. All of them are immutable, and evaluation keeps an
 * unchanged feature's geometry the same object between revisions, so findings
 * found from the same objects are the same findings. Moving an outline gives
 * its stitch line, its holes and whatever follows it from another part new
 * paths, and the rest of its part a new material; their findings are found
 * again, and nothing else's.
 */
interface FoundFrom extends Findings {
  readonly path: Path;
  readonly holes: StitchHoles | undefined;
  readonly partId: PartId;
  readonly outer: Path | null;
  readonly cutOuts: readonly Path[];
}

const findingsCache = new WeakMap<Feature, FoundFrom>();

function findingsOf(
  entry: Extract<ResolvedFeature, { ok: true }>,
  partId: PartId,
  material: Material,
): Findings {
  const cached = findingsCache.get(entry.feature);
  if (
    cached !== undefined &&
    cached.path === entry.path &&
    cached.holes === entry.holes &&
    cached.partId === partId &&
    cached.outer === material.outer &&
    cached.cutOuts.length === material.holes.length &&
    cached.cutOuts.every((cutOut, i) => cutOut === material.holes[i])
  ) {
    return cached;
  }

  const found: FoundFrom = {
    path: entry.path,
    holes: entry.holes,
    partId,
    outer: material.outer,
    cutOuts: material.holes,
    onMaterial: material.outer === null ? [] : onMaterial(entry, partId, material),
    ownShape: ownShape(entry, partId),
  };
  findingsCache.set(entry.feature, found);
  return found;
}

/** DR2, placed: what is off the leather, or too near its edge. */
function onMaterial(
  entry: Extract<ResolvedFeature, { ok: true }>,
  partId: PartId,
  material: Material,
): Diagnostic[] {
  return offMaterial(entry, material).map(({ problem: p, points }) =>
    placed(
      p,
      partId,
      entry.feature.id,
      // The holes at fault where a rule knows them, the whole feature where it
      // does not: "which hole" is the question the maker has to answer before
      // they can fix anything.
      points === undefined ? { kind: 'path', path: entry.path } : { kind: 'points', points },
      p.code === 'OUTSIDE_PART' && p.facts.what === 'line' ? 'warning' : undefined,
    ),
  );
}

/** The rules about a feature's own shape and holes, whatever leather it is on. */
function ownShape(entry: Extract<ResolvedFeature, { ok: true }>, partId: PartId): Diagnostic[] {
  const found: Diagnostic[] = [];
  const { feature } = entry;
  const about = { featureId: feature.id, featureName: feature.name };

  if (feature.kind === 'cut-contour') {
    const crossings = crossingsOf(entry.path);
    if (crossings.length > 0) {
      found.push(
        placed(
          problem('CONTOUR_SELF_INTERSECTS', { ...about, crossings: crossings.length }),
          partId,
          feature.id,
          { kind: 'points', points: crossings.map((crossing) => crossing.point) },
        ),
      );
    }
  }

  // A row's holes are circles; a mirrored row's are too, so this asks the
  // resolved holes rather than the op.
  if (entry.holes?.radiusMm !== undefined) {
    const overlap = overlappingHoles(entry.holes, entry.holes.radiusMm, entry.path.closed);
    if (overlap !== null) {
      found.push(
        placed(
          problem('HOLES_OVERLAP', {
            ...about,
            spacingMm: overlap.spacingMm,
            diameterMm: 2 * entry.holes.radiusMm,
          }),
          partId,
          feature.id,
          { kind: 'points', points: overlap.points },
        ),
      );
    }
  }

  const source = feature.source;
  if (entry.holes !== undefined && source.kind === 'derived' && source.op.type === 'stitch-holes') {
    for (const p of holeProblems(entry.holes, source.op.pitchMm, about)) {
      found.push(placed(p, partId, feature.id, { kind: 'path', path: entry.path }));
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
 * The holes of a row that cut into a neighbour, and the nearest spacing; null
 * when none do.
 *
 * Two punches nearer than a diameter leave no leather between them, so the
 * cut is one slot rather than the holes drawn. A warning, not a refusal: a
 * slot punched as a run of holes is a real technique. Touching within a
 * storage quantum counts, since a bridge that thin is no bridge.
 *
 * Neighbours only, centre to centre in a straight line, the pair across a
 * closed line's join included. ponytail: holes that are not neighbours but
 * meet across a tight bend are not found; an all-pairs check if one is drawn.
 */
function overlappingHoles(
  holes: StitchHoles,
  radiusMm: Mm,
  closed: boolean,
): { spacingMm: Mm; points: readonly Vec2[] } | null {
  const points = holes.holes.map((hole) => hole.point);
  const pairs = closed && points.length > 2 ? points.length : points.length - 1;
  const touching = new Set<number>();
  let spacingMm = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pairs; i++) {
    const j = (i + 1) % points.length;
    const apartMm = Vec2Ops.dist(points[i]!, points[j]!);
    if (apartMm - 2 * radiusMm >= QUANTUM_MM) continue;
    spacingMm = Math.min(spacingMm, apartMm);
    touching.add(i).add(j);
  }
  if (!Number.isFinite(spacingMm)) return null;
  return { spacingMm, points: [...touching].sort((a, b) => a - b).map((i) => points[i]!) };
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

  const punched = punchesOf(entry);
  if (punched !== null) {
    // One pass rather than a filter, a min and a filter: whether a hole is off,
    // the nearest clearance, and the holes that share it all come out of the
    // same distance, which is the expensive part for three thousand holes.
    const off: Vec2[] = [];
    const tight: Vec2[] = [];
    let clearanceMm = Number.POSITIVE_INFINITY;
    for (const { centre, radiusMm } of punched) {
      if (!isOnMaterial(material, centre)) {
        off.push(centre);
        continue;
      }
      // A circle whose centre is on the leather stays on it unless an edge
      // passes nearer the centre than its radius — exact, not sampled. A rim
      // within a storage quantum of an edge is on it, as for a line (Q2).
      const rimMm = distanceToEdge(material, centre) - radiusMm;
      if (rimMm < -QUANTUM_MM) {
        off.push(centre);
        continue;
      }
      if (rimMm >= MIN_HOLE_EDGE_CLEARANCE_MM) continue;
      clearanceMm = Math.min(clearanceMm, Math.max(0, rimMm));
      tight.push(centre);
    }

    if (off.length > 0) {
      found.push({ problem: problem('OUTSIDE_PART', { ...about, what: 'holes' }), points: off });
      // Where a hole is off the material, how near the edge it sits is not
      // the thing to say about it.
      return found;
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
    // A line may run *to* the edge: a fold drawn right across the piece ends
    // on the outline, and that is on the leather, not off it (Q2). "On the
    // edge" is within one storage quantum, the grid every drawn point snaps to.
    const off = pointsAlong(entry.path).some(
      (point) => !isOnMaterial(material, point) && distanceToEdge(material, point) > QUANTUM_MM,
    );
    if (off) found.push({ problem: problem('OUTSIDE_PART', { ...about, what: 'line' }) });
  }

  return found;
}

/** A hole the leather is cut by: a circle, or a point where the radius is 0. */
interface Punch {
  readonly centre: Vec2;
  readonly radiusMm: Mm;
}

/**
 * Where this feature is punched, or null when it punches nothing.
 *
 * A hole set is its holes, each a point where the iron's tooth goes in. A
 * hardware hole is its whole circle, because a 6 mm punch centred 2 mm in from
 * the edge cuts through it (Q33), and so is each hole of a row (4.14).
 */
function punchesOf(entry: Extract<ResolvedFeature, { ok: true }>): readonly Punch[] | null {
  if (entry.holes !== undefined) {
    const radiusMm = entry.holes.radiusMm ?? 0;
    return entry.holes.holes.map((hole) => ({ centre: hole.point, radiusMm }));
  }

  const source = entry.feature.source;
  if (
    entry.feature.kind === 'hardware-hole' &&
    source.kind === 'shape' &&
    source.shape.type === 'circle'
  ) {
    return [{ centre: source.shape.centre, radiusMm: source.shape.radius }];
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
