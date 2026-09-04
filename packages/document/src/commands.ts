import type { Ulid } from '@leathercad/core';
import type {
  Feature,
  FeatureId,
  ParametricShape,
  Part,
  PartId,
  Project,
} from '@leathercad/domain';
import { DEFAULT_SETTINGS } from '@leathercad/domain';
import { MatOps, PathOps, Shapes, type Vec2 } from '@leathercad/geometry';

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
 * A parametric shape moves by its parameters, so a rectangle stays a
 * rectangle; a freehand path has its points transformed. Transforming a
 * shape's generated path instead would quietly demote it to a polyline and
 * lose the ability to edit its width by typing a number.
 */
export function translateFeatures(ids: Iterable<FeatureId>, deltaMm: Vec2): Command {
  const targets = new Set(ids);
  const matrix = MatOps.fromTranslation(deltaMm);

  return command('Move', (document) => {
    if (targets.size === 0) return document;

    return {
      project: {
        ...document.project,
        parts: document.project.parts.map((part) => ({
          ...part,
          features: part.features.map((feature) =>
            targets.has(feature.id) ? translateFeature(feature, deltaMm, matrix) : feature,
          ),
        })),
      },
    };
  });
}

function translateFeature(
  feature: Feature,
  deltaMm: Vec2,
  matrix: ReturnType<typeof MatOps.fromTranslation>,
): Feature {
  if (feature.source.kind === 'path') {
    return {
      ...feature,
      source: { kind: 'path', path: PathOps.transform(feature.source.path, matrix) },
    };
  }

  const shape = feature.source.shape;
  const moved: ParametricShape =
    shape.type === 'rect'
      ? { ...shape, origin: { x: shape.origin.x + deltaMm.x, y: shape.origin.y + deltaMm.y } }
      : { ...shape, centre: { x: shape.centre.x + deltaMm.x, y: shape.centre.y + deltaMm.y } };

  return { ...feature, source: { kind: 'shape', shape: moved } };
}

/** Convenience for the rectangle tool: a new part holding one cut contour. */
export function rectanglePart(
  partId: PartId,
  featureId: FeatureId,
  name: string,
  shape: Extract<ParametricShape, { type: 'rect' }>,
): Part {
  return {
    id: partId,
    name,
    quantity: 1,
    features: [
      {
        id: featureId,
        kind: 'cut-contour',
        role: 'outer',
        name: 'Outline',
        visible: true,
        locked: false,
        source: { kind: 'shape', shape },
      },
    ],
  };
}

export function rectShape(
  origin: Vec2,
  width: number,
  height: number,
  radius = 0,
): Extract<ParametricShape, { type: 'rect' }> {
  return { type: 'rect', origin, width, height, radii: Shapes.uniformRadii(radius) };
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
