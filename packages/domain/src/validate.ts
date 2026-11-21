import { EPS_LENGTH, QUANTUM_MM, approxGte, type Mm } from '@leathercad/core';
import {
  MatOps,
  PathOps,
  SegmentOps,
  intersectPaths,
  selfIntersections,
  type Intersection,
  type Path,
  Vec2Ops,
  type Vec2,
} from '@leathercad/geometry';
import { FONT, missingGlyphs } from '@leathercad/typography';

import type { Feature, FeatureId, PartId, Tooth } from './feature.js';
import type { ResolvedFeature, ResolvedProject } from './evaluate.js';
import { distanceToEdge, isOnMaterial, materialOf, type Material } from './material.js';
import { hasOuterContour } from './partStructure.js';
import { contentSize, pocketOpening, pocketSize } from './pocket.js';
import type { StitchHole, StitchHoles } from './stitch.js';
import { toothOutline } from './tooth.js';
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

/** DR5: the printed height of a capital, rather than the font's nominal em size. */
const MIN_TEXT_CAP_HEIGHT_MM: Mm = 1.5;

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
    ownShape: [...ownShape(entry, partId), ...pocketFit(entry, partId, material.outer)],
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

/**
 * DR8: a pocket holds what the maker said it is for (9.14b).
 *
 * Asked only of stitching with a requirement. Width is always judged, against
 * the content and the ease; depth only when the content must go in fully
 * (D15), against the content alone (D22), and from the opening the outline
 * makes, never from the stitch ends. A requirement the geometry gives
 * no reading for is said to be unchecked rather than passed. Geometric only:
 * leather thickness and the stitching's pull are the maker's ease.
 */
function pocketFit(
  entry: Extract<ResolvedFeature, { ok: true }>,
  partId: PartId,
  outer: Path | null,
): Diagnostic[] {
  const { feature } = entry;
  if (feature.kind !== 'stitch-line' || feature.holds === undefined) return [];
  const { content, easeMm, fully } = feature.holds;
  const about = { featureId: feature.id, featureName: feature.name };
  const here = (p: Problem) => placed(p, partId, feature.id, { kind: 'path', path: entry.path });

  const size = pocketSize(entry.path);
  if (size === null)
    return [here(problem('POCKET_NOT_MEASURABLE', { ...about, reading: 'width' }))];
  const needs = contentSize(content);
  const found: Diagnostic[] = [];
  const neededWidthMm = needs.widthMm + easeMm;
  if (!approxGte(size.widthMm, neededWidthMm, EPS_LENGTH)) {
    found.push(
      here(
        problem('POCKET_TOO_NARROW', {
          ...about,
          content: content.kind,
          widthMm: size.widthMm,
          neededMm: neededWidthMm,
          easeMm,
        }),
      ),
    );
  }
  if (!fully) return found;
  const depthMm = outer === null ? null : (pocketOpening(entry.path, outer)?.depthMm ?? null);
  if (depthMm === null) {
    found.push(here(problem('POCKET_NOT_MEASURABLE', { ...about, reading: 'opening' })));
    return found;
  }
  // Depth against the content alone (D22): ease is the leather wrapping the
  // content's faces, which costs width; the bottom of a pocket loses little.
  if (!approxGte(depthMm, needs.heightMm, EPS_LENGTH)) {
    found.push(
      here(
        problem('POCKET_TOO_SHALLOW', {
          ...about,
          content: content.kind,
          depthMm,
          neededMm: needs.heightMm,
        }),
      ),
    );
  }
  return found;
}

/** The rules about a feature's own shape and holes, whatever leather it is on. */
function ownShape(entry: Extract<ResolvedFeature, { ok: true }>, partId: PartId): Diagnostic[] {
  const found: Diagnostic[] = [];
  const { feature } = entry;
  const about = { featureId: feature.id, featureName: feature.name };

  if (feature.kind === 'text-label') {
    const capHeightMm = (feature.source.sizeMm * FONT.capHeight) / FONT.unitsPerEm;
    if (!approxGte(capHeightMm, MIN_TEXT_CAP_HEIGHT_MM, EPS_LENGTH)) {
      found.push(
        placed(
          problem('TEXT_TOO_SMALL_TO_PRINT', {
            ...about,
            capHeightMm,
            minimumMm: MIN_TEXT_CAP_HEIGHT_MM,
          }),
          partId,
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
          partId,
          feature.id,
          { kind: 'points', points: crossings.map((crossing) => crossing.point) },
        ),
      );
    } else if (hasNoArea(entry.path)) {
      // Only where it does not cross itself: a figure of eight's lobes cancel
      // to no signed area, and it is the crossing that is wrong with it.
      found.push(
        placed(problem('CONTOUR_HAS_NO_AREA', about), partId, feature.id, {
          kind: 'path',
          path: entry.path,
        }),
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

  const clearance = edgeClearance(entry, material);
  if (clearance !== null) {
    if (clearance.off.length > 0) {
      found.push({
        problem: problem('OUTSIDE_PART', {
          ...about,
          what: 'holes',
          atEnds: onlyEndHoles(entry, clearance.off),
        }),
        points: clearance.off,
      });
      // Where a hole is off the material, how near the edge it sits is not
      // the thing to say about it.
      return found;
    }

    if (clearance.tight.length > 0) {
      found.push({
        problem: problem('HOLE_TOO_CLOSE_TO_EDGE', {
          ...about,
          clearanceMm: clearance.clearanceMm,
          minimumMm: MIN_HOLE_EDGE_CLEARANCE_MM,
          atEnds: onlyEndHoles(entry, clearance.tight),
        }),
        points: clearance.tight,
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
    // on the outline, and that is on the leather, not off it (Q2) — which
    // `isOnMaterial` answers for every rule, within one storage quantum (D29).
    const off = pointsAlong(entry.path).some((point) => !isOnMaterial(material, point));
    if (off) found.push({ problem: problem('OUTSIDE_PART', { ...about, what: 'line' }) });
  }

  return found;
}

/**
 * Whether the holes at fault are only the first and last of a hole set laid
 * along an open line: what its start and end offsets move in (Q47), so the
 * app can name them rather than the inset, which moves every hole. A closed
 * line has no ends, and a mirror or a row of holes has no offsets of its own.
 * The faulty points are the holes' own `point` objects (`punchesOf`).
 */
function onlyEndHoles(
  entry: Extract<ResolvedFeature, { ok: true }>,
  atFault: readonly Vec2[],
): boolean {
  const { feature, holes } = entry;
  if (
    holes === undefined ||
    entry.path.closed ||
    feature.source.kind !== 'derived' ||
    feature.source.op.type !== 'stitch-holes'
  ) {
    return false;
  }
  const first = holes.holes[0]?.point;
  const last = holes.holes.at(-1)?.point;
  return atFault.every((point) => point === first || point === last);
}

/** Where a feature's holes sit against the edges of its material (DR2, Q33). */
export interface EdgeClearance {
  /** The holes whose cut leaves the leather: `OUTSIDE_PART`. */
  readonly off: readonly Vec2[];
  /** The holes on the leather nearer an edge than the minimum: `HOLE_TOO_CLOSE_TO_EDGE`. */
  readonly tight: readonly Vec2[];
  /**
   * The least leather left between a hole's cut and an edge, of the holes on
   * the leather, and never below 0; infinite when none is on it.
   */
  readonly clearanceMm: Mm;
}

/**
 * How near a feature's holes come to its material's edges — the outline and
 * the cut-outs — measured from a stitch hole's point and a hardware hole's
 * rim; a stitch hole whose tooth cuts an edge is off (Q46). Null when the
 * feature punches nothing.
 *
 * The one judgement both `OUTSIDE_PART` (holes) and `HOLE_TOO_CLOSE_TO_EDGE`
 * are made from, and what a move's live clearance reads (3.17), so the board
 * cannot warn of something Problems will not list.
 *
 * One pass rather than a filter, a min and a filter: whether a hole is off,
 * the nearest clearance, and the holes that share it all come out of the same
 * distance, which is the expensive part for three thousand holes.
 */
export function edgeClearance(
  entry: Extract<ResolvedFeature, { ok: true }>,
  material: Material,
): EdgeClearance | null {
  const punched = punchesOf(entry);
  if (punched === null) return null;
  const off: Vec2[] = [];
  const tight: Vec2[] = [];
  let clearanceMm = Number.POSITIVE_INFINITY;
  for (const { centre, radiusMm, toothed } of punched) {
    if (!isOnMaterial(material, centre)) {
      off.push(centre);
      continue;
    }
    // A circle whose centre is on the leather stays on it unless an edge
    // passes nearer the centre than its radius — exact, not sampled. A rim
    // within a storage quantum of an edge is on it, as for a line (Q2). A
    // tooth through an edge leaves the leather too (Q46).
    const edgeMm = distanceToEdge(material, centre);
    const rimMm = edgeMm - radiusMm;
    if (
      rimMm < -QUANTUM_MM ||
      (toothed !== undefined && toothCutsAnEdge(toothed.hole, toothed.tooth, edgeMm, material))
    ) {
      off.push(centre);
      continue;
    }
    clearanceMm = Math.min(clearanceMm, Math.max(0, rimMm));
    // At the minimum is clear: an inset of exactly 1.5 mm measures a last
    // bit short of it, and a maker who typed 1.5 met the rule (9.17).
    if (!approxGte(rimMm, MIN_HOLE_EDGE_CLEARANCE_MM, EPS_LENGTH)) tight.push(centre);
  }
  return { off, tight, clearanceMm };
}

/**
 * A hole the leather is cut by: a circle, or a point where the radius is 0.
 * Its clearance is measured from the rim, or from the point.
 */
interface Punch {
  readonly centre: Vec2;
  readonly radiusMm: Mm;
  /** The tooth that cuts a stitch hole whose iron is said (9.26), judged on or off (Q46). */
  readonly toothed?: { readonly hole: StitchHole; readonly tooth: Tooth };
}

/**
 * Where this feature is punched, or null when it punches nothing.
 *
 * A hole set is its holes, each a point where the iron's tooth goes in, and
 * where the iron is said, the tooth too: a mirror carries its source's (9.26).
 * A hardware hole is its whole circle, because a 6 mm punch centred 2 mm in
 * from the edge cuts through it (Q33), and so is each hole of a row (4.14).
 */
function punchesOf(entry: Extract<ResolvedFeature, { ok: true }>): readonly Punch[] | null {
  if (entry.holes !== undefined) {
    const { tooth } = entry.holes;
    const radiusMm = entry.holes.radiusMm ?? 0;
    return entry.holes.holes.map((hole) =>
      tooth === undefined
        ? { centre: hole.point, radiusMm }
        : { centre: hole.point, radiusMm, toothed: { hole, tooth } },
    );
  }

  // Judged by the circle it resolves to, not by its source: a mirror — across
  // a fold, a line, or of another mirror — is a hole punched like any other
  // (Q45). A circle resolves to one whole-turn arc, and a reflection keeps it one.
  const [only, ...rest] = entry.path.segments;
  if (entry.feature.kind === 'hardware-hole' && only?.kind === 'arc' && rest.length === 0) {
    return [{ centre: only.centre, radiusMm: only.radius }];
  }
  return null;
}

/**
 * Whether a stitch hole's tooth cuts through an edge of the material, its
 * centre being on the leather and `edgeMm` from the nearest edge (Q46).
 *
 * Read from the outline SVG and DXF cut (`toothOutline`, D27), so the rule and
 * the cut cannot disagree. Exact, not sampled, as the rim is: a tooth whose
 * centre is further from every edge than its farthest point cannot reach one,
 * so only a hole that near pays for more (PERF-005); a round tooth is then
 * decided, as a rim. Within a storage quantum of an edge is on it (D29): the
 * slit is judged shrunk about its centre by a quantum of its reach, which
 * moves no point of it further than that, so a tip that meets an edge stays
 * on and nothing cutting deeper is missed, however thin the blade. It cuts an
 * edge that meets the shrunk slit, or lies wholly inside it — a cut-out
 * smaller than the tooth.
 */
function toothCutsAnEdge(hole: StitchHole, tooth: Tooth, edgeMm: Mm, material: Material): boolean {
  const reachMm =
    tooth.kind === 'round' ? tooth.diameterMm / 2 : Math.max(tooth.lengthMm, tooth.widthMm) / 2;
  if (edgeMm >= reachMm - QUANTUM_MM) return false;
  if (tooth.kind === 'round') return true;

  const k = 1 - QUANTUM_MM / reachMm;
  const inside = toothOutline(hole, {
    ...tooth,
    lengthMm: tooth.lengthMm * k,
    widthMm: tooth.widthMm * k,
  });
  const edges = material.outer === null ? material.holes : [material.outer, ...material.holes];
  return edges.some((edge) => {
    const first = PathOps.start(edge);
    return (
      intersectPaths(edge, inside).length > 0 ||
      (first !== null && PathOps.containsPoint(inside, first))
    );
  });
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

/**
 * DR3: a cut outline that encloses nothing — a piece scaled to nothing, or
 * flattened onto a line by a singular matrix (QA4). Judged by its mean width,
 * twice its area over its length, so the test is in millimetres, the same at
 * any size, and blind to the rounding a long sliver's area carries. The
 * narrowest strip a maker can store, a quantum wide, is far wider.
 *
 * The area is taken with the outline moved to its own start: Green's theorem
 * sums about the origin, and a closed path's last join, up to `EPS_POINT`
 * open, then adds that gap times the distance out — more than a sliver's
 * whole area, two metres away.
 */
function hasNoArea(path: Path): boolean {
  const from = PathOps.start(path);
  if (from === null) return true;
  const here = PathOps.transform(path, MatOps.fromTranslation({ x: -from.x, y: -from.y }));
  return 2 * PathOps.area(here) <= EPS_LENGTH * PathOps.length(path);
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
