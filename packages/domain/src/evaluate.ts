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
import { distributeHoles, type StitchHoles } from './stitch.js';
import type { LayerRole } from './layerRole.js';

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
    }
  | { readonly ok: false; readonly feature: Feature; readonly error: string };

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
 * Errors are per feature, not per project: one broken shape produces a failed
 * node while everything around it still draws. A blank canvas because of one
 * bad number is the wrong failure mode for a drawing tool.
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
 * Thrown through the intermediate frames rather than being wrapped.
 *
 * A source that merely failed produces "the outline it follows could not be
 * built", which is the right thing to say. A cycle is different: the wrapper
 * would hide the only fact that helps, so it travels to the top intact.
 */
class CycleError extends RangeError {}

function resolveTop(feature: Feature, byId: ReadonlyMap<FeatureId, Feature>): ResolvedFeature {
  try {
    return resolveFeature(feature, byId, new Set());
  } catch (error) {
    return { ok: false, feature, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveFeature(
  feature: Feature,
  byId: ReadonlyMap<FeatureId, Feature>,
  visiting: Set<FeatureId>,
): ResolvedFeature {
  const cached = cache.get(feature);
  if (cached !== undefined && cached.from === sourcePathOf(feature, byId, visiting)) {
    return hit(feature, cached);
  }

  try {
    const from = sourcePathOf(feature, byId, visiting);
    const built = build(feature, from, byId);
    cache.set(feature, built);
    return hit(feature, built);
  } catch (error) {
    if (error instanceof CycleError) throw error;
    return {
      ok: false,
      feature,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function hit(feature: Feature, entry: CacheEntry): ResolvedFeature {
  const resolved = { ok: true as const, feature, role: roleOf(feature), path: entry.path };
  return entry.holes === undefined ? resolved : { ...resolved, holes: entry.holes };
}

/**
 * The path this feature is built *from*, or undefined if it stands alone.
 *
 * Resolving the source is itself memoised, so asking twice — once to test the
 * cache and once to build — costs a map lookup, not a recomputation.
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
  const source: GeometrySource = feature.source;

  switch (source.kind) {
    case 'path':
      return { from, path: source.path, holes: undefined };
    case 'shape':
      return { from, path: pathForShape(source.shape), holes: undefined };
    case 'derived': {
      // `from` is the resolved source; `sourcePathOf` threw if it failed.
      const sourcePath = from!;
      const origin = byId.get(source.sourceId)!;

      if (source.op.type === 'stitch-holes') {
        // The holes are the output, but a feature still needs a path — for
        // selection, for a bounding box, for fitting the view. It is the line
        // they were placed along.
        return { from, path: sourcePath, holes: distributeHoles(sourcePath, source.op) };
      }

      return {
        from,
        path: applyDerivation(sourcePath, origin.source, source.op),
        holes: undefined,
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
 * A failed source yields **one** message here rather than the root cause
 * repeated down the chain — one problem, one entry in the panel.
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
    throw new CycleError(`${feature.name} is derived from itself, through a cycle.`);
  }

  const from = byId.get(sourceId);
  if (from === undefined) {
    throw new RangeError('The feature this one follows was not found.');
  }

  visiting.add(feature.id);
  let resolved: ResolvedFeature;
  try {
    resolved = resolveFeature(from, byId, visiting);
  } finally {
    visiting.delete(feature.id);
  }

  if (!resolved.ok) {
    throw new RangeError(`The ${from.name} it follows could not be built.`);
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
  sourcePath: Path,
  source: GeometrySource,
  op: Extract<Derivation, { type: 'offset' }>,
): Path {
  const followed = runOf(sourcePath, source, op.run);

  const inwardIsLeft = !sourcePath.closed || PathOps.signedArea(sourcePath) > 0;
  const towardsInside = op.side === 'inward' ? 1 : -1;
  const distance = op.distanceMm * towardsInside * (inwardIsLeft ? 1 : -1);

  const [result] = offsetPath(followed, distance, { join: 'round' });
  if (result === undefined) {
    throw new RangeError(
      `A ${String(op.distanceMm)} mm inset is deeper than this outline can hold.`,
    );
  }

  return result;
}

/**
 * The stretch of the source a derivation follows.
 *
 * A whole run is the source path itself, closed and all. A partial run is the
 * stretch between two anchors — the seam on three sides of a pocket, which is
 * the ordinary case rather than the exception.
 */
function runOf(sourcePath: Path, source: GeometrySource, run: Run): Path {
  if (run.kind === 'whole') return sourcePath;

  const anchors = anchorsOf(source, sourcePath);
  const from = anchors[run.fromAnchor];
  const to = anchors[run.toAnchor];

  if (from === undefined || to === undefined) {
    throw new RangeError(
      anchors.length === 0
        ? 'This outline has no corners to run between, so it can only be followed whole.'
        : `That run named corner ${String(Math.max(run.fromAnchor, run.toAnchor))}, ` +
            `and this outline has ${String(anchors.length)}.`,
    );
  }

  return subPath(sourcePath, from, to);
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

/** Features that failed to evaluate, for the problems panel. */
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
