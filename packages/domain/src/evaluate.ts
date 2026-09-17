import { EPS_ANGLE, EPS_LENGTH, approxZero, type Mm } from '@leathercad/core';
import {
  MatOps,
  PathOps,
  Shapes,
  arc,
  glideMatrix,
  offsetPathTraced,
  subPath,
  type OffsetPiece,
  type Path,
  type Vec2,
} from '@leathercad/geometry';
import { placedText, type PlacedText } from '@leathercad/typography';

import type {
  Derivation,
  Feature,
  FeatureId,
  FeatureSource,
  ParametricShape,
  Part,
  Project,
  Run,
} from './feature.js';
import { roleOf } from './feature.js';
import { anchorsOf } from './anchors.js';
import { mapAnchorsThroughOffset } from './derivedAnchors.js';
import { keepLargestPiece } from './offsetPieces.js';
import { distributeHoles, type StitchHoles } from './stitch.js';
import type { LayerRole } from './layerRole.js';
import { problem, type Problem, type ProblemLocation } from './problems/index.js';

export type ResolvedFeature =
  | {
      readonly ok: true;
      readonly feature: Feature;
      readonly role: LayerRole;
      /**
       * For a hole set this is the line the holes were placed along, not the
       * holes themselves: a `Path` is one contour and eighty holes are eighty
       * circles. The holes travel beside it.
       */
      readonly path: Path;
      /** Present only on a stitch hole set. */
      readonly holes?: StitchHoles;
      /**
       * Present only on a text label: the words, laid out once in millimetres.
       *
       * The canvas draws the typeface at these positions and the exporters
       * fill the same glyphs as outlines (ADR 0011). `path` is the box the run
       * occupies, which is what selection and bounds work on — the same trick
       * a hole set plays with the line its holes sit on.
       */
      readonly text?: PlacedText;
      /**
       * The feature's durable landmarks, as distances along its own path.
       *
       * Roots read them from their parameters; a derived feature carries its
       * source's, under the **same indices**, mapped by whatever built its
       * geometry (ADR 0010). `null` where an anchor has no image — an inset
       * deep enough to swallow a corner — because dropping it would renumber
       * every anchor after it, which is how a run silently moves to a
       * different edge.
       */
      readonly anchors: readonly (Mm | null)[];
      /**
       * What resolving had to give up to succeed — an offset that split and kept
       * its largest piece (E2). Absent when nothing was given up.
       */
      readonly notes?: readonly Problem[];
    }
  | {
      readonly ok: false;
      readonly feature: Feature;
      /** Why, typed (E1). An evaluation outcome from the problem registry. */
      readonly problem: Problem;
      /** The geometry the failure is about, when there is some to point at. */
      readonly location?: ProblemLocation;
    };

export interface ResolvedPart {
  readonly part: Part;
  readonly features: readonly ResolvedFeature[];
}

export interface ResolvedProject {
  readonly project: Project;
  readonly parts: readonly ResolvedPart[];
}

/**
 * What a feature last resolved to, and what it was built from.
 *
 * The document is updated immutably with structural sharing, so an unchanged
 * feature is *literally the same object* between revisions. That makes object
 * identity a near-perfect memoisation key: editing one part leaves the other
 * thirty-nine cached, with no hashing and no invalidation logic to get wrong.
 *
 * Near-perfect, because a **derived** feature can be unchanged and still owe a
 * different answer: widening a panel replaces the cut contour object and
 * leaves the stitch line following it identical. So the entry records the
 * source path it was built from, and a derived feature is only reused when
 * that is the same object too. `from` is undefined for a feature that has no
 * source to drift out from under it.
 */
interface CacheEntry {
  readonly from: Path | undefined;
  readonly path: Path;
  readonly holes: StitchHoles | undefined;
  readonly text: PlacedText | undefined;
  readonly anchors: readonly (Mm | null)[];
  readonly notes: readonly Problem[] | undefined;
}

const cache = new WeakMap<Feature, CacheEntry>();

/**
 * Turns the stored, parameter-only project into concrete geometry.
 *
 * **Derived geometry is never persisted** — the file stores parameters and
 * this recomputes on load. That keeps files small, keeps them free of stale
 * data, and means an improved shape constructor silently improves every
 * existing file. See CLAUDE.md invariant 4.
 *
 * Failures are per feature, not per project: one broken shape produces a failed
 * node while everything around it still draws. A blank canvas because of one
 * bad number is the wrong failure mode for a drawing tool. Every failure is a
 * typed problem (E1), never a sentence.
 */
export function evaluate(project: Project): ResolvedProject {
  // A derived feature can follow one in another part — a seam spans two
  // pieces — so the index is built across the whole project, once.
  const byId = new Map<FeatureId, Feature>();
  for (const part of project.parts) {
    for (const feature of part.features) byId.set(feature.id, feature);
  }

  return {
    project,
    parts: project.parts.map((part) => ({
      part,
      features: part.features.map((feature) => resolveTop(feature, byId)),
    })),
  };
}

/**
 * A problem travelling up the stack from wherever evaluation found it.
 *
 * Evaluation is recursive and the failure is discovered deep inside it, so it
 * is thrown rather than threaded through every return — but what is thrown is
 * the typed problem, not a sentence to be parsed back later.
 */
class Failure extends Error {
  readonly problem: Problem;
  readonly location: ProblemLocation | undefined;

  constructor(problem: Problem, location?: ProblemLocation) {
    super(problem.code);
    this.problem = problem;
    this.location = location;
  }
}

/**
 * Thrown through the intermediate frames rather than being wrapped.
 *
 * A source that merely failed produces `SOURCE_FAILED`, which is the right thing
 * to say. A cycle is different: the wrapper would hide the only fact that helps,
 * so it travels to the top intact. S3 makes this unreachable through commands
 * and the loader; it stays as a guard.
 */
class CycleError extends Failure {}

function resolveTop(feature: Feature, byId: ReadonlyMap<FeatureId, Feature>): ResolvedFeature {
  try {
    return resolveFeature(feature, byId, new Set());
  } catch (error) {
    // Re-subjected: the cycle was found on some feature further along the
    // loop, but this is the one being reported.
    if (error instanceof CycleError) {
      return { ok: false, feature, problem: problem('CYCLE', about(feature)) };
    }
    return failed(feature, error);
  }
}

function resolveFeature(
  feature: Feature,
  byId: ReadonlyMap<FeatureId, Feature>,
  visiting: Set<FeatureId>,
): ResolvedFeature {
  try {
    // Inside the try: asking for the source can fail, and that failure belongs
    // to this feature, not to whichever feature asked for this one.
    const source = resolvedSourceOf(feature, byId, visiting);
    const from = source?.path;
    const cached = cache.get(feature);
    if (cached !== undefined && cached.from === from) return hit(feature, cached);

    const built = build(feature, source);
    cache.set(feature, built);
    return hit(feature, built);
  } catch (error) {
    if (error instanceof CycleError) throw error;
    return failed(feature, error);
  }
}

function hit(feature: Feature, entry: CacheEntry): ResolvedFeature {
  return {
    ok: true,
    feature,
    role: roleOf(feature),
    path: entry.path,
    anchors: entry.anchors,
    ...(entry.holes === undefined ? {} : { holes: entry.holes }),
    ...(entry.text === undefined ? {} : { text: entry.text }),
    ...(entry.notes === undefined ? {} : { notes: entry.notes }),
  };
}

/**
 * The failed node for anything thrown while building `feature`.
 *
 * A `Failure` carries its problem. Anything else came from the geometry layer
 * without the domain having checked for it first, and becomes
 * `GEOMETRY_FAILED` — typed, so E1 holds, but a gap: each one met in a test is
 * a check the domain should be making itself.
 */
function failed(feature: Feature, error: unknown): ResolvedFeature {
  if (error instanceof Failure) {
    return error.location === undefined
      ? { ok: false, feature, problem: error.problem }
      : { ok: false, feature, problem: error.problem, location: error.location };
  }

  const detail = error instanceof Error ? error.message : String(error);
  return { ok: false, feature, problem: problem('GEOMETRY_FAILED', { ...about(feature), detail }) };
}

/**
 * What this feature is built *from*, resolved, or undefined if it stands alone.
 *
 * The whole resolved source rather than only its path, because a derived
 * feature inherits its source's **anchors** as well as its geometry (ADR
 * 0010). Resolving is memoised, so asking on every evaluation costs a map
 * lookup per link, not a recomputation.
 */
function resolvedSourceOf(
  feature: Feature,
  byId: ReadonlyMap<FeatureId, Feature>,
  visiting: Set<FeatureId>,
): Extract<ResolvedFeature, { ok: true }> | undefined {
  if (feature.source.kind !== 'derived') return undefined;
  return followSource(feature, feature.source.sourceId, byId, visiting);
}

function build(
  feature: Feature,
  resolvedSource: Extract<ResolvedFeature, { ok: true }> | undefined,
): CacheEntry {
  const invalid = parameterProblem(feature);
  if (invalid !== null) throw new Failure(invalid);

  const from = resolvedSource?.path;
  const source: FeatureSource = feature.source;

  switch (source.kind) {
    case 'path': {
      const path = source.path;
      return {
        from,
        path,
        holes: undefined,
        text: undefined,
        anchors: anchorsOf(source, path),
        notes: undefined,
      };
    }
    case 'shape': {
      const path = pathForShape(source.shape);
      return {
        from,
        path,
        holes: undefined,
        text: undefined,
        anchors: anchorsOf(source, path),
        notes: undefined,
      };
    }
    case 'text': {
      const placed = placedText(source.text, source.sizeMm, source.at, {
        rotationRad: source.rotationRad,
      });
      return {
        from,
        path: textBox(placed),
        holes: undefined,
        text: placed,
        anchors: [],
        notes: undefined,
      };
    }
    case 'derived': {
      // `from` is the resolved source; `resolvedSourceOf` threw if it failed.
      const sourcePath = from!;
      const sourceAnchors = resolvedSource!.anchors;

      if (source.op.type === 'mirror') {
        // The counterpart is the source, reflected and placed. Everything it
        // has comes from the source: the path, the holes if it has them, and
        // the anchors.
        //
        // Note that a mirrored **hole set** gets its holes here rather than
        // from `distributeHoles` — so this is the second place a `holes` field
        // is produced, and deliberately so. Redistributing along the mirrored
        // line could yield a different count from a rounding difference, and
        // two panels sewn together must have the same number of holes. A
        // reflection cannot lose one.
        const m = glideMatrix(source.op.axis.origin, source.op.axis.angleRad, source.op.glideMm);
        const holes = resolvedSource!.holes;

        return {
          from,
          path: PathOps.transform(sourcePath, m),
          holes:
            holes === undefined
              ? undefined
              : {
                  ...holes,
                  holes: holes.holes.map((hole) => ({
                    ...hole,
                    point: MatOps.apply(m, hole.point),
                  })),
                },
          text: undefined,
          // The image path's vertices are the source's reflected **in the same
          // order**, so each edge is the image of the corresponding edge with
          // the same length: the arc-length parameterisation is identical and
          // an anchor at s is still at s. Nothing goes missing — a reflection
          // loses nothing (ADR 0010).
          anchors: sourceAnchors,
          notes: undefined,
        };
      }

      if (source.op.type === 'stitch-holes') {
        // The holes are the output, but a feature still needs a path — for
        // selection, for a bounding box, for fitting the view. It is the line
        // they were placed along, so it carries that line's anchors unchanged
        // (ADR 0010): the holes on a corner are still on that corner.
        return {
          from,
          path: sourcePath,
          holes: distributeHoles(sourcePath, source.op),
          text: undefined,
          anchors: sourceAnchors,
          notes: undefined,
        };
      }

      const offset = applyDerivation(
        feature,
        resolvedSource!.feature,
        sourcePath,
        sourceAnchors,
        source.op,
      );
      return {
        from,
        path: offset.path,
        holes: undefined,
        text: undefined,
        anchors: offset.anchors,
        notes: offset.notes,
      };
    }
  }
}

/**
 * Rebuilds a derived feature from the one it follows.
 *
 * Recursive rather than scheduled: the chain is two links deep and each node
 * has one source, so a topological pass would be machinery without a job.
 *
 * A failed source yields **one** `SOURCE_FAILED` here rather than the root
 * cause repeated down the chain — one problem, one entry in the panel (E3).
 */
function followSource(
  feature: Feature,
  sourceId: FeatureId,
  byId: ReadonlyMap<FeatureId, Feature>,
  visiting: Set<FeatureId>,
): Extract<ResolvedFeature, { ok: true }> {
  // The source is already being resolved further up the stack, so following it
  // would come straight back here.
  if (visiting.has(sourceId) || sourceId === feature.id) {
    throw new CycleError(problem('CYCLE', about(feature)));
  }

  const from = byId.get(sourceId);
  if (from === undefined) throw new Failure(problem('SOURCE_MISSING', about(feature)));

  visiting.add(feature.id);
  let resolved: ResolvedFeature;
  try {
    resolved = resolveFeature(from, byId, visiting);
  } finally {
    visiting.delete(feature.id);
  }

  if (!resolved.ok) {
    throw new Failure(
      problem('SOURCE_FAILED', { ...about(feature), sourceId: from.id, sourceName: from.name }),
    );
  }

  return resolved;
}

/**
 * Inward is a domain concept; the geometry layer only knows left and right.
 *
 * On a counter-clockwise ring, left of travel is inward — so the sign depends
 * on the winding of the contour being followed, which is what
 * `docs/geometry.md` §6.4 means by the domain normalising it.
 */
function applyDerivation(
  feature: Feature,
  followedFeature: Feature,
  sourcePath: Path,
  sourceAnchors: readonly (Mm | null)[],
  op: Extract<Derivation, { type: 'offset' }>,
): { path: Path; anchors: readonly (Mm | null)[]; notes: readonly Problem[] | undefined } {
  const followed = runOf(feature, sourcePath, sourceAnchors, op.run);
  const at: ProblemLocation = { kind: 'path', path: followed };

  // Checked here rather than left to `offsetPath` to throw: the analytic
  // offset cannot take a cubic, and that is a state of the design to report.
  if (followed.segments.some((segment) => segment.kind === 'cubic')) {
    throw new Failure(problem('OFFSET_UNSUPPORTED', about(feature)), at);
  }

  const inwardIsLeft = !sourcePath.closed || PathOps.signedArea(sourcePath) > 0;
  const towardsInside = op.side === 'inward' ? 1 : -1;

  // D6: inward means **into the leather**, not into the shape. A part's
  // material is inside its outline and *outside* every cut-out, so a stitch
  // line round a thumb slot runs away from the hole — into the part — while
  // the same inset round the outline runs into it. Without this the stitching
  // for a slot would be drawn across the gap it is meant to edge.
  const towardsMaterial =
    followedFeature.kind === 'cut-contour' && followedFeature.role === 'inner' ? -1 : 1;

  const distance = op.distanceMm * towardsInside * towardsMaterial * (inwardIsLeft ? 1 : -1);

  const pieces = offsetPathTraced(followed, distance, { join: 'round' });
  if (pieces.length === 0) {
    throw new Failure(
      problem('OFFSET_COLLAPSED', { ...about(feature), distanceMm: op.distanceMm, side: op.side }),
      at,
    );
  }

  // Nothing is dropped without a diagnostic (E2).
  const { kept, dropped } = keepLargestPiece(pieces.map((piece) => piece.path));
  const keptPiece = pieces.find((piece) => piece.path === kept)!;

  return {
    path: kept,
    // The source's anchors, under the same indices, mapped by the offset's own
    // trace rather than looked for again in the result (ADR 0010).
    anchors: anchorsOnRun(sourceAnchors, sourcePath, followed, op.run, keptPiece),
    notes:
      dropped < 1
        ? undefined
        : [problem('OFFSET_SPLIT', { ...about(feature), droppedPieces: dropped })],
  };
}

/**
 * The source's anchors as they land on the offset.
 *
 * A whole run keeps them all. A partial run keeps the ones it actually covers,
 * re-based to the stretch it followed — including its two ends, which are
 * themselves corners of the source and the most useful things to name on a
 * seam that stops short.
 */
function anchorsOnRun(
  sourceAnchors: readonly (Mm | null)[],
  sourcePath: Path,
  followed: Path,
  run: Run,
  piece: OffsetPiece,
): readonly (Mm | null)[] {
  if (run.kind === 'whole') {
    return mapAnchorsThroughOffset(sourceAnchors, sourcePath, piece);
  }

  const total = PathOps.length(sourcePath);
  const runLength = PathOps.length(followed);
  const from = sourceAnchors[run.fromAnchor];
  // `runOf` already refused a run whose ends are not there, so this cannot
  // happen; answering with "all missing" rather than a guess keeps it true if
  // that order ever changes.
  if (from === null || from === undefined) return sourceAnchors.map(() => null);

  // A run may wrap through the path's start, so how far along it an anchor
  // sits is measured the way `subPath` walks it. An anchor the run does not
  // reach is missing from the derived feature — in its own place, so the ones
  // after it keep their numbers.
  const within = sourceAnchors.map((anchor) => {
    if (anchor === null) return null;
    const ahead = anchor - from;
    const local = ahead < 0 ? ahead + total : ahead;
    return local <= runLength + EPS_LENGTH ? local : null;
  });

  return mapAnchorsThroughOffset(within, followed, piece);
}

/**
 * The stretch of the source a derivation follows.
 *
 * A whole run is the source path itself, closed and all. A partial run is the
 * stretch between two anchors — the seam on three sides of a pocket, which is
 * the ordinary case rather than the exception. A named anchor that is not there
 * fails (E4); it never re-targets to a neighbour.
 */
function runOf(
  feature: Feature,
  sourcePath: Path,
  anchors: readonly (Mm | null)[],
  run: Run,
): Path {
  if (run.kind === 'whole') return sourcePath;

  const from = anchors[run.fromAnchor] ?? undefined;
  const to = anchors[run.toAnchor] ?? undefined;

  if (from === undefined || to === undefined) {
    throw new Failure(
      problem('ANCHOR_MISSING', {
        ...about(feature),
        anchor: Math.max(run.fromAnchor, run.toAnchor),
        available: anchors.length,
      }),
      { kind: 'path', path: sourcePath },
    );
  }

  return subPath(sourcePath, from, to);
}

/**
 * The first parameter of a feature that no geometry could be built from.
 *
 * Checked by the domain before geometry is asked, so the failure names the
 * parameter the user typed — "the width" — instead of surfacing the geometry
 * layer's guard, which speaks in function names.
 */
function parameterProblem(feature: Feature): Problem | null {
  const checks: Array<[string, number, Requirement]> = [];
  const source = feature.source;

  switch (source.kind) {
    case 'path':
      break;
    case 'shape': {
      const shape = source.shape;
      switch (shape.type) {
        case 'rect':
          checks.push(
            ['position', shape.origin.x, 'finite'],
            ['position', shape.origin.y, 'finite'],
            ['width', shape.width, 'finite'],
            ['height', shape.height, 'finite'],
            ['rotation', shape.rotation, 'finite'],
            ['corner radius', shape.radii.bottomLeft, 'non-negative'],
            ['corner radius', shape.radii.bottomRight, 'non-negative'],
            ['corner radius', shape.radii.topRight, 'non-negative'],
            ['corner radius', shape.radii.topLeft, 'non-negative'],
          );
          break;
        case 'circle':
          checks.push(
            ['position', shape.centre.x, 'finite'],
            ['position', shape.centre.y, 'finite'],
            ['radius', shape.radius, 'non-negative'],
          );
          break;
        case 'arc':
          checks.push(
            ['position', shape.centre.x, 'finite'],
            ['position', shape.centre.y, 'finite'],
            ['radius', shape.radius, 'non-negative'],
            ['start angle', shape.startAngle, 'finite'],
            ['sweep', shape.sweepAngle, 'finite'],
          );
          break;
      }
      break;
    }
    case 'text':
      checks.push(
        ['position', source.at.x, 'finite'],
        ['position', source.at.y, 'finite'],
        ['text size', source.sizeMm, 'positive'],
        ['rotation', source.rotationRad, 'finite'],
      );
      break;
    case 'derived': {
      const op = source.op;
      if (op.type === 'offset') {
        checks.push([op.side === 'inward' ? 'inset' : 'allowance', op.distanceMm, 'non-negative']);
      } else if (op.type === 'mirror') {
        // A glide may be negative — it slides either way along the axis — so
        // only finiteness is asked of these.
        checks.push(
          ['mirror axis', op.axis.origin.x, 'finite'],
          ['mirror axis', op.axis.origin.y, 'finite'],
          ['mirror angle', op.axis.angleRad, 'finite'],
          ['glide', op.glideMm, 'finite'],
        );
      } else {
        checks.push(['pitch', op.pitchMm, 'positive']);
        if (op.startOffsetMm !== undefined) {
          checks.push(['start offset', op.startOffsetMm, 'non-negative']);
        }
        if (op.endOffsetMm !== undefined) {
          checks.push(['end offset', op.endOffsetMm, 'non-negative']);
        }
      }
      break;
    }
  }

  for (const [parameter, value, requirement] of checks) {
    const unmet = unmetRequirement(value, requirement);
    if (unmet !== null) {
      return problem('PARAMETER_INVALID', {
        ...about(feature),
        parameter,
        requirement: unmet,
        value,
      });
    }
  }
  return null;
}

type Requirement = 'finite' | 'positive' | 'non-negative';

/**
 * Which requirement `value` fails, or null.
 *
 * Exact comparisons against zero on purpose: these mirror the geometry
 * layer's own guards (a pitch of `1e-12` is refused there only if it is not
 * greater than zero), and the domain must not refuse what geometry accepts.
 */
function unmetRequirement(value: number, requirement: Requirement): Requirement | null {
  if (!Number.isFinite(value)) return 'finite';
  if (requirement === 'positive' && !(value > 0)) return 'positive';
  if (requirement === 'non-negative' && value < 0) return 'non-negative';
  return null;
}

/**
 * The box a laid-out run occupies, turned with it.
 *
 * A label still needs a path: selection, hit-testing, bounds and fit-to-view
 * all work on one, and none of them should have to know what text is.
 */
function textBox(placed: PlacedText): Path {
  const { widthMm, ascentMm, descentMm } = placed.layout;
  const angle = placed.rotationRad;
  // The baseline's direction and the up direction, already turned.
  const along: Vec2 = { x: Math.cos(angle), y: Math.sin(angle) };
  const up: Vec2 = { x: -Math.sin(angle), y: Math.cos(angle) };

  const step = (from: Vec2, direction: Vec2, distance: number): Vec2 => ({
    x: from.x + direction.x * distance,
    y: from.y + direction.y * distance,
  });

  const bottomLeft = step(placed.origin, up, -descentMm);
  const height = ascentMm + descentMm;

  return PathOps.polyline(
    [
      bottomLeft,
      step(bottomLeft, along, widthMm),
      step(step(bottomLeft, along, widthMm), up, height),
      step(bottomLeft, up, height),
    ],
    true,
  );
}

function about(feature: Feature): { featureId: FeatureId; featureName: string } {
  return { featureId: feature.id, featureName: feature.name };
}

/**
 * The path a parametric shape evaluates to.
 *
 * Exported because it is the ground truth a transform is judged against:
 * transforming a shape through its parameters and then evaluating it must draw
 * the same curve as evaluating it and then transforming the path
 * (`geometry.md` §4.2 rule 1).
 */
export function pathForShape(shape: ParametricShape): Path {
  switch (shape.type) {
    case 'rect': {
      const path = Shapes.roundedRect(shape.origin, shape.width, shape.height, shape.radii);
      if (approxZero(shape.rotation, EPS_ANGLE)) return path;

      // About the rectangle's own centre, so turning it does not also walk it
      // across the page. A rotation is a similarity, so PathOps.transform keeps
      // the corner arcs as arcs — the corners of a turned panel are still
      // round, not elliptical (geometry.md 4.2 rule 1).
      const centre = {
        x: shape.origin.x + shape.width / 2,
        y: shape.origin.y + shape.height / 2,
      };
      return PathOps.transform(path, MatOps.fromRotationAround(centre, shape.rotation));
    }
    case 'circle':
      return Shapes.circle(shape.centre, shape.radius);
    case 'arc':
      // Open: an arc has two ends, so it is a run to mark, not an outline to
      // cut. `shapePart` files it as a marking-line for the same reason.
      return PathOps.open([arc(shape.centre, shape.radius, shape.startAngle, shape.sweepAngle)]);
  }
}

/** Every successfully resolved feature, flattened. */
export function* resolvedFeatures(
  resolved: ResolvedProject,
): Generator<Extract<ResolvedFeature, { ok: true }>> {
  for (const part of resolved.parts) {
    for (const feature of part.features) {
      if (feature.ok) yield feature;
    }
  }
}

/** Features that failed to evaluate. `diagnose` is what surfaces read. */
export function evaluationErrors(
  resolved: ResolvedProject,
): Array<Extract<ResolvedFeature, { ok: false }>> {
  const errors: Array<Extract<ResolvedFeature, { ok: false }>> = [];
  for (const part of resolved.parts) {
    for (const feature of part.features) {
      if (!feature.ok) errors.push(feature);
    }
  }
  return errors;
}
