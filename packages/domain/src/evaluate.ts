import { EPS_ANGLE, approxZero } from '@leathercad/core';
import { MatOps, PathOps, Shapes, arc, offsetPath, subPath, type Path } from '@leathercad/geometry';

import type {
  Derivation,
  Feature,
  FeatureId,
  GeometrySource,
  ParametricShape,
  Part,
  Project,
  Run,
} from './feature.js';
import { roleOf } from './feature.js';
import { anchorsOf } from './anchors.js';
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
    // Inside the try: asking for the source path can fail, and that failure
    // belongs to this feature, not to whichever feature asked for this one.
    const from = sourcePathOf(feature, byId, visiting);
    const cached = cache.get(feature);
    if (cached !== undefined && cached.from === from) return hit(feature, cached);

    const built = build(feature, from, byId);
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
    ...(entry.holes === undefined ? {} : { holes: entry.holes }),
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
 * The path this feature is built *from*, or undefined if it stands alone.
 *
 * Resolving the source is itself memoised, so asking on every evaluation costs
 * a map lookup per link, not a recomputation.
 */
function sourcePathOf(
  feature: Feature,
  byId: ReadonlyMap<FeatureId, Feature>,
  visiting: Set<FeatureId>,
): Path | undefined {
  if (feature.source.kind !== 'derived') return undefined;
  return followSource(feature, feature.source.sourceId, byId, visiting).path;
}

function build(
  feature: Feature,
  from: Path | undefined,
  byId: ReadonlyMap<FeatureId, Feature>,
): CacheEntry {
  const invalid = parameterProblem(feature);
  if (invalid !== null) throw new Failure(invalid);

  const source: GeometrySource = feature.source;

  switch (source.kind) {
    case 'path':
      return { from, path: source.path, holes: undefined, notes: undefined };
    case 'shape':
      return { from, path: pathForShape(source.shape), holes: undefined, notes: undefined };
    case 'derived': {
      // `from` is the resolved source; `sourcePathOf` threw if it failed.
      const sourcePath = from!;
      const origin = byId.get(source.sourceId)!;

      if (source.op.type === 'stitch-holes') {
        // The holes are the output, but a feature still needs a path — for
        // selection, for a bounding box, for fitting the view. It is the line
        // they were placed along.
        return {
          from,
          path: sourcePath,
          holes: distributeHoles(sourcePath, source.op),
          notes: undefined,
        };
      }

      const offset = applyDerivation(feature, sourcePath, origin.source, source.op);
      return { from, path: offset.path, holes: undefined, notes: offset.notes };
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
  sourcePath: Path,
  source: GeometrySource,
  op: Extract<Derivation, { type: 'offset' }>,
): { path: Path; notes: readonly Problem[] | undefined } {
  const followed = runOf(feature, sourcePath, source, op.run);
  const at: ProblemLocation = { kind: 'path', path: followed };

  // Checked here rather than left to `offsetPath` to throw: the analytic
  // offset cannot take a cubic, and that is a state of the design to report.
  if (followed.segments.some((segment) => segment.kind === 'cubic')) {
    throw new Failure(problem('OFFSET_UNSUPPORTED', about(feature)), at);
  }

  const inwardIsLeft = !sourcePath.closed || PathOps.signedArea(sourcePath) > 0;
  const towardsInside = op.side === 'inward' ? 1 : -1;
  const distance = op.distanceMm * towardsInside * (inwardIsLeft ? 1 : -1);

  const pieces = offsetPath(followed, distance, { join: 'round' });
  if (pieces.length === 0) {
    throw new Failure(
      problem('OFFSET_COLLAPSED', { ...about(feature), distanceMm: op.distanceMm, side: op.side }),
      at,
    );
  }

  // Nothing is dropped without a diagnostic (E2).
  const { kept, dropped } = keepLargestPiece(pieces);
  return {
    path: kept,
    notes:
      dropped < 1
        ? undefined
        : [problem('OFFSET_SPLIT', { ...about(feature), droppedPieces: dropped })],
  };
}

/**
 * The stretch of the source a derivation follows.
 *
 * A whole run is the source path itself, closed and all. A partial run is the
 * stretch between two anchors — the seam on three sides of a pocket, which is
 * the ordinary case rather than the exception. A named anchor that is not there
 * fails (E4); it never re-targets to a neighbour.
 */
function runOf(feature: Feature, sourcePath: Path, source: GeometrySource, run: Run): Path {
  if (run.kind === 'whole') return sourcePath;

  const anchors = anchorsOf(source, sourcePath);
  const from = anchors[run.fromAnchor];
  const to = anchors[run.toAnchor];

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
    case 'derived': {
      const op = source.op;
      if (op.type === 'offset') {
        checks.push([op.side === 'inward' ? 'inset' : 'allowance', op.distanceMm, 'non-negative']);
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

function about(feature: Feature): { featureId: FeatureId; featureName: string } {
  return { featureId: feature.id, featureName: feature.name };
}

function pathForShape(shape: ParametricShape): Path {
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
