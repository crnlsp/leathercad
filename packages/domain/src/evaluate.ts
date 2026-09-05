import { EPS_ANGLE, approxZero } from '@leathercad/core';
import { MatOps, PathOps, Shapes, arc, type Path } from '@leathercad/geometry';

import type { Feature, GeometrySource, ParametricShape, Part, Project } from './feature.js';
import { roleOf } from './feature.js';
import type { LayerRole } from './layerRole.js';

export type ResolvedFeature =
  | {
      readonly ok: true;
      readonly feature: Feature;
      readonly role: LayerRole;
      readonly path: Path;
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
 * Reference-keyed cache.
 *
 * The document is updated immutably with structural sharing, so an unchanged
 * feature is *literally the same object* between revisions. That makes object
 * identity a perfect memoisation key: editing one part leaves the other
 * thirty-nine cached, with no hashing and no invalidation logic to get wrong.
 */
const pathCache = new WeakMap<Feature, Path>();

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
  return {
    project,
    parts: project.parts.map((part) => ({
      part,
      features: part.features.map((feature) => resolveFeature(feature)),
    })),
  };
}

function resolveFeature(feature: Feature): ResolvedFeature {
  const cached = pathCache.get(feature);
  if (cached !== undefined) {
    return { ok: true, feature, role: roleOf(feature), path: cached };
  }

  try {
    const path = pathFor(feature.source);
    pathCache.set(feature, path);
    return { ok: true, feature, role: roleOf(feature), path };
  } catch (error) {
    return {
      ok: false,
      feature,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function pathFor(source: GeometrySource): Path {
  switch (source.kind) {
    case 'path':
      return source.path;
    case 'shape':
      return pathForShape(source.shape);
  }
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
