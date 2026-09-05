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
import { MatOps, PathOps, Shapes, type Path, type Vec2 } from '@leathercad/geometry';

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

  return {
    ...feature,
    source: { kind: 'shape', shape: translateShape(feature.source.shape, deltaMm) },
  };
}

/**
 * Moves a parametric shape by changing the parameter that locates it.
 *
 * A switch rather than "rect uses origin, everything else uses centre": that
 * shortcut silently does the wrong thing the first time a shape is located by
 * neither. Here the compiler stops on the new variant instead.
 */
function translateShape(shape: ParametricShape, deltaMm: Vec2): ParametricShape {
  switch (shape.type) {
    case 'rect':
      return { ...shape, origin: { x: shape.origin.x + deltaMm.x, y: shape.origin.y + deltaMm.y } };
    case 'circle':
      return { ...shape, centre: { x: shape.centre.x + deltaMm.x, y: shape.centre.y + deltaMm.y } };
  }
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
): Extract<ParametricShape, { type: 'rect' }> {
  return { type: 'rect', origin, width, height, radii: Shapes.uniformRadii(radius) };
}

/**
 * The record stores a radius. The property panel asks for a diameter, because
 * that is the number on a punch — the conversion belongs there, not here.
 */
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
