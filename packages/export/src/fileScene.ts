import { EPS_ANGLE, quantise, type Mm } from '@leathercad/core';
import { LAYER_ROLES, type LayerRole } from '@leathercad/domain';
import {
  PathOps,
  RectOps,
  SegmentOps,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';

import type { ExportScene, ExportText } from './scene.js';

/**
 * The export scene as a vector file carries it: one layer for each role, in the
 * role order, holding everything of that role the scene draws.
 *
 * SVG and DXF read the same layers, so a file's groups and layers cannot drift
 * apart in what they hold or what they are called — the name is the domain's
 * role name. Only roles with something in them are layers.
 */
export interface FileLayer {
  readonly role: LayerRole;
  readonly paths: readonly Path[];
  /** Words, as filled glyph outlines: never a font (ADR 0011). */
  readonly texts: readonly ExportText[];
}

/**
 * The layers of a scene, in the model's own coordinates.
 *
 * A scene is already exactly what the PDF prints — hidden features, features
 * that failed to build and parts with only words never reach it
 * (`buildExportScene`) — so this adds no filter of its own, and a file cannot
 * hold anything the paper does not.
 */
export function fileLayersOf(scene: ExportScene): FileLayer[] {
  return LAYER_ROLES.flatMap((role) => {
    const paths = scene.parts.flatMap((part) =>
      part.paths.filter((item) => item.role === role).map((item) => item.path),
    );
    const texts = scene.parts.flatMap((part) =>
      part.texts.filter((text) => text.role === role && text.glyphs.length > 0),
    );
    return paths.length === 0 && texts.length === 0 ? [] : [{ role, paths, texts }];
  });
}

/**
 * The box of everything the layers draw, in model millimetres: the page of a
 * file that has one. Null when they draw nothing.
 *
 * Exact bounds of curves and glyphs, never their control points, and the
 * captions the scene sets above each part are inside it. It is the geometry's
 * box, not the ink's: a stroke on the edge is half outside it, which cutters,
 * who follow the centre-line, do not mind.
 */
export function fileBoundsOf(layers: readonly FileLayer[]): Rect | null {
  const drawn = layers.flatMap((layer) => [
    ...layer.paths,
    ...layer.texts.flatMap((text) => text.glyphs),
  ]);
  return RectOps.unionAll(drawn.flatMap((path) => PathOps.bbox(path) ?? []));
}

/**
 * The circle a path is, if it is one whole turn of an arc — which is how the
 * model holds a hole — so a file can say *circle* rather than two arcs.
 */
export function circleOf(path: Path): { readonly centre: Vec2; readonly radius: Mm } | null {
  const [only, ...rest] = path.segments;
  if (only?.kind !== 'arc' || rest.length > 0 || only.radius <= 0) return null;
  if (Math.abs(only.sweepAngle) < SegmentOps.FULL_TURN - EPS_ANGLE) return null;
  return { centre: only.centre, radius: only.radius };
}

/**
 * A length as a file writes it: to the model's own quantum, 0.1 µm (invariant
 * 8) — four decimals of a millimetre — with nothing after them that is not
 * there. `quantise` also refuses a coordinate that is not a number, so a broken
 * shape stops the export instead of writing `NaN` into a file a cutter will
 * read.
 */
export function mmText(value: Mm): string {
  return String(quantise(value));
}

/** The same length with all four decimals kept, as a DXF writes a coordinate: `100.0000`. */
export function mmFixed(value: Mm): string {
  return quantise(value).toFixed(4);
}
