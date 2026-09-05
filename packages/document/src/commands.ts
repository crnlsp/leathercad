import type { Ulid } from '@leathercad/core';
import type {
  Feature,
  FeatureId,
  ParametricShape,
  Part,
  PartId,
  Project,
} from '@leathercad/domain';
import { DEFAULT_SETTINGS, transformShape } from '@leathercad/domain';
import { MatOps, PathOps, Shapes, type Mat2x3, type Path, type Vec2 } from '@leathercad/geometry';

import { command, type Command, type Document } from './document.js';

export function emptyProject(id: Ulid, name = 'Untitled'): Project {
  return { id, name, settings: DEFAULT_SETTINGS, parts: [] };
}

export function emptyDocument(id: Ulid, name?: string): Document {
  return { project: emptyProject(id, name) };
}

/** Adds a part, optionally with its features already in place. */
export function addPart(part: Part): Command {
  return command(`Add ${part.name}`, (document) => ({
    project: { ...document.project, parts: [...document.project.parts, part] },
  }));
}

export function addFeature(partId: PartId, feature: Feature): Command {
  return command(`Add ${feature.name}`, (document) => ({
    project: mapPart(document.project, partId, (part) => ({
      ...part,
      features: [...part.features, feature],
    })),
  }));
}

export function deleteFeatures(ids: Iterable<FeatureId>): Command {
  const targets = new Set(ids);
  const label = targets.size === 1 ? 'Delete feature' : `Delete ${targets.size} features`;

  return command(label, (document) => {
    if (targets.size === 0) return document;

    // Parts left empty by the deletion go too: an invisible part with nothing
    // in it is clutter in the parts list and cannot be selected to remove.
    const parts = document.project.parts
      .map((part) => ({
        ...part,
        features: part.features.filter((feature) => !targets.has(feature.id)),
      }))
      .filter((part) => part.features.length > 0);

    return { project: { ...document.project, parts } };
  });
}

export function renameFeature(id: FeatureId, name: string): Command {
  return command('Rename', (document) => ({
    project: mapFeature(document.project, id, (feature) => ({ ...feature, name })),
  }));
}

export function setFeatureVisible(id: FeatureId, visible: boolean): Command {
  return command(visible ? 'Show feature' : 'Hide feature', (document) => ({
    project: mapFeature(document.project, id, (feature) => ({ ...feature, visible })),
  }));
}

/** Replaces a parametric shape — the path is regenerated on evaluation. */
export function setShape(id: FeatureId, shape: ParametricShape): Command {
  return command('Edit shape', (document) => ({
    project: mapFeature(document.project, id, (feature) => ({
      ...feature,
      source: { kind: 'shape', shape },
    })),
  }));
}

/**
 * Moves features by a millimetre delta.
 *
 * The translation case of `transformFeatures`, kept because moving is the
 * common thing and a matrix is a poor way to ask for it.
 */
export function translateFeatures(ids: Iterable<FeatureId>, deltaMm: Vec2): Command {
  return transformFeatures(ids, MatOps.fromTranslation(deltaMm), 'Move');
}

/**
 * Applies a transform to features.
 *
 * A parametric shape transforms **through its parameters** so it stays
 * parametric — a rectangle stays a rectangle you can retype the width of. A
 * drawn path has its points transformed, since it has no parameters to protect.
 *
 * A shape whose representation cannot survive the transform — a circle under a
 * non-uniform scale, which would become an ellipse — is **left exactly as it
 * was**, and the rest of the selection still moves. Nothing is silently demoted
 * to another representation; see `transformShape` for the rule. Ask
 * `refusedTransforms` first if you need to tell the user why.
 */
export function transformFeatures(
  ids: Iterable<FeatureId>,
  matrix: Mat2x3,
  label = 'Transform',
): Command {
  const targets = new Set(ids);

  return command(label, (document) => {
    if (targets.size === 0) return document;

    return {
      project: {
        ...document.project,
        parts: document.project.parts.map((part) => ({
          ...part,
          features: part.features.map((feature) =>
            targets.has(feature.id) ? transformFeature(feature, matrix) : feature,
          ),
        })),
      },
    };
  });
}

/** A feature that would refuse the transform, with the reason to show. */
export interface RefusedTransform {
  readonly featureId: FeatureId;
  readonly featureName: string;
  readonly reason: string;
}

/**
 * Which features would refuse `matrix`, and why — without applying anything.
 *
 * The tool asks this to decide whether to explain itself; the command uses the
 * same `transformShape` underneath, so the answer cannot disagree with what
 * actually happens.
 */
export function refusedTransforms(
  project: Project,
  ids: Iterable<FeatureId>,
  matrix: Mat2x3,
): RefusedTransform[] {
  const targets = new Set(ids);
  const refused: RefusedTransform[] = [];

  for (const part of project.parts) {
    for (const feature of part.features) {
      if (!targets.has(feature.id) || feature.source.kind !== 'shape') continue;

      const result = transformShape(feature.source.shape, matrix);
      if (!result.ok) {
        refused.push({ featureId: feature.id, featureName: feature.name, reason: result.error });
      }
    }
  }

  return refused;
}

function transformFeature(feature: Feature, matrix: Mat2x3): Feature {
  if (feature.source.kind === 'path') {
    return {
      ...feature,
      source: { kind: 'path', path: PathOps.transform(feature.source.path, matrix) },
    };
  }

  const result = transformShape(feature.source.shape, matrix);
  // Refused: left exactly as it was, rather than converted behind the user's
  // back. `refusedTransforms` is how the reason reaches them.
  if (!result.ok) return feature;

  return { ...feature, source: { kind: 'shape', shape: result.value } };
}

/**
 * A part holding one parametric shape.
 *
 * The closed/open rule is the same product decision `pathPart` makes for drawn
 * geometry, stated once here for parametric shapes: a shape enclosing an area
 * is something to cut out, so it becomes a `cut-contour`; one with two ends is
 * a `marking-line`, because filing it as an outline would put a part in the
 * list that can never be cut.
 */
export function shapePart(
  partId: PartId,
  featureId: FeatureId,
  name: string,
  shape: ParametricShape,
): Part {
  const source = { kind: 'shape', shape } as const;
  const feature: Feature = enclosesArea(shape)
    ? {
        id: featureId,
        kind: 'cut-contour',
        role: 'outer',
        name: 'Outline',
        visible: true,
        locked: false,
        source,
      }
    : {
        id: featureId,
        kind: 'marking-line',
        purpose: 'alignment',
        name: 'Line',
        visible: true,
        locked: false,
        source,
      };

  return { id: partId, name, quantity: 1, features: [feature] };
}

/** Whether a shape bounds an inside. Every new shape must answer this. */
function enclosesArea(shape: ParametricShape): boolean {
  switch (shape.type) {
    case 'rect':
    case 'circle':
      return true;
    case 'arc':
      // Two ends, so there is nothing inside it to cut out.
      return false;
  }
}

/**
 * A part holding one freehand path.
 *
 * A **closed** path becomes a `cut-contour`: an outline with an inside is
 * something to cut out. An **open** one becomes a `marking-line`, because a
 * line with two ends is not an outline, and calling it one would put a part in
 * the list that can never be cut. Drawn paths are the only geometry persisted
 * as coordinates rather than parameters (docs/file-format.md §3.3).
 */
export function pathPart(partId: PartId, featureId: FeatureId, name: string, path: Path): Part {
  const source = { kind: 'path', path } as const;
  const feature: Feature = path.closed
    ? {
        id: featureId,
        kind: 'cut-contour',
        role: 'outer',
        name: 'Outline',
        visible: true,
        locked: false,
        source,
      }
    : {
        id: featureId,
        kind: 'marking-line',
        purpose: 'alignment',
        name: 'Line',
        visible: true,
        locked: false,
        source,
      };

  return { id: partId, name, quantity: 1, features: [feature] };
}

/**
 * A part holding one rectangle.
 *
 * Kept as a named helper because the rectangle tool and a good deal of the test
 * suite read better for it; the behaviour is `shapePart`'s, stated once.
 */
export function rectanglePart(
  partId: PartId,
  featureId: FeatureId,
  name: string,
  shape: Extract<ParametricShape, { type: 'rect' }>,
): Part {
  return shapePart(partId, featureId, name, shape);
}

export function rectShape(
  origin: Vec2,
  width: number,
  height: number,
  radius = 0,
  rotation = 0,
): Extract<ParametricShape, { type: 'rect' }> {
  return { type: 'rect', origin, width, height, radii: Shapes.uniformRadii(radius), rotation };
}

/**
 * The record stores a radius. The property panel asks for a diameter, because
 * that is the number on a punch — the conversion belongs there, not here.
 */
export function arcShape(
  centre: Vec2,
  radius: number,
  startAngle: number,
  sweepAngle: number,
): Extract<ParametricShape, { type: 'arc' }> {
  return { type: 'arc', centre, radius, startAngle, sweepAngle };
}

export function circleShape(
  centre: Vec2,
  radius: number,
): Extract<ParametricShape, { type: 'circle' }> {
  return { type: 'circle', centre, radius };
}

export function setProjectName(name: string): Command {
  return command('Rename project', (document) => ({
    project: { ...document.project, name },
  }));
}

export function setPartName(id: PartId, name: string): Command {
  return command('Rename part', (document) => ({
    project: mapPart(document.project, id, (part) => ({ ...part, name })),
  }));
}

export function setPartQuantity(id: PartId, quantity: number): Command {
  return command('Set quantity', (document) => ({
    project: mapPart(document.project, id, (part) => ({
      ...part,
      // A part you cut zero of is a part you should delete instead.
      quantity: Math.max(1, Math.round(quantity)),
    })),
  }));
}

function mapPart(project: Project, id: PartId, update: (part: Part) => Part): Project {
  return {
    ...project,
    parts: project.parts.map((part) => (part.id === id ? update(part) : part)),
  };
}

function mapFeature(
  project: Project,
  id: FeatureId,
  update: (feature: Feature) => Feature,
): Project {
  return {
    ...project,
    parts: project.parts.map((part) =>
      part.features.some((feature) => feature.id === id)
        ? {
            ...part,
            features: part.features.map((feature) =>
              feature.id === id ? update(feature) : feature,
            ),
          }
        : part,
    ),
  };
}
