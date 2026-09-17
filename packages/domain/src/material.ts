import type { Mm } from '@leathercad/core';
import { PathOps, type Path, type Vec2 } from '@leathercad/geometry';

import type { ResolvedPart } from './evaluate.js';

/**
 * The leather a part is actually made of.
 *
 * Inside its outer contour, and **outside** every cut-out in it. One
 * definition, used by every rule that asks whether something is on the part,
 * so they cannot disagree about where the material is — and used by the offset
 * direction, so a stitch line round a thumb slot runs in the leather rather
 * than across the gap (D6).
 */
export interface Material {
  /** Null when the part has no outline: there is no material at all. */
  readonly outer: Path | null;
  readonly holes: readonly Path[];
}

export function materialOf(part: ResolvedPart): Material {
  let outer: Path | null = null;
  const holes: Path[] = [];

  for (const entry of part.features) {
    if (!entry.ok || entry.feature.kind !== 'cut-contour') continue;
    if (entry.feature.role === 'outer') {
      // A part has one outer contour (S5); if a file somehow holds two, the
      // first is the one everything else is measured against.
      outer ??= entry.path;
      continue;
    }
    holes.push(entry.path);
  }

  return { outer, holes };
}

/** Whether a point is on the leather: inside the outline, outside every hole. */
export function isOnMaterial(material: Material, point: Vec2): boolean {
  if (material.outer === null) return false;
  if (!PathOps.containsPoint(material.outer, point)) return false;
  return !material.holes.some((hole) => PathOps.containsPoint(hole, point));
}

/**
 * How far a point is from the nearest edge of the material — the outline or
 * any cut-out.
 *
 * An edge has no sides: a hole 1 mm inside the outline and one 1 mm outside it
 * are both 1 mm from it. Whether the point is on the leather at all is
 * `isOnMaterial`'s question.
 */
export function distanceToEdge(material: Material, point: Vec2): Mm {
  let nearest = Number.POSITIVE_INFINITY;

  for (const edge of material.outer === null
    ? material.holes
    : [material.outer, ...material.holes]) {
    const distance = PathOps.distanceToPath(edge, point);
    if (distance < nearest) nearest = distance;
  }

  return nearest;
}

/** Whether every one of these points is on the material. */
export function allOnMaterial(material: Material, points: Iterable<Vec2>): boolean {
  for (const point of points) {
    if (!isOnMaterial(material, point)) return false;
  }
  return true;
}
