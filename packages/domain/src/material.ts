import { EPS_POINT, QUANTUM_MM, type Mm } from '@leathercad/core';
import { PathOps, type Path, type Rect, type Vec2 } from '@leathercad/geometry';

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

/**
 * Whether a point is on the leather: inside the outline, outside every hole.
 *
 * A point within a storage quantum of an edge — the outline or a cut-out — is
 * on it, and so on the leather (D29), as for a line (Q2) and a hardware rim
 * (Q33). `containsPoint` has no defined answer on a boundary, so without this
 * a stitch hole on the cut edge was off or on by which way the piece faced
 * (Q44). Only a point the containment test puts off the leather pays for the
 * distance.
 */
export function isOnMaterial(material: Material, point: Vec2): boolean {
  if (material.outer === null) return false;
  const onEdge = (edge: Path) => PathOps.distanceToPath(edge, point) <= QUANTUM_MM;
  if (!PathOps.containsPoint(material.outer, point) && !onEdge(material.outer)) return false;
  return !material.holes.some((hole) => PathOps.containsPoint(hole, point) && !onEdge(hole));
}

/**
 * How far a point is from the nearest edge of the material — the outline or
 * any cut-out.
 *
 * An edge has no sides: a hole 1 mm inside the outline and one 1 mm outside it
 * are both 1 mm from it. Whether the point is on the leather at all is
 * `isOnMaterial`'s question.
 *
 * An edge lies inside its box, so one whose box is further from the point than
 * the nearest edge measured so far cannot be nearer, and is not measured
 * (PERF-005): a hole by the outline of a long strap is not measured against
 * every slot down it. The box test spares EPS_POINT for the rounding in both
 * distances, so the answer is the one measuring every edge gives, to the bit.
 */
export function distanceToEdge(material: Material, point: Vec2): Mm {
  let nearest = Number.POSITIVE_INFINITY;

  for (const edge of material.outer === null
    ? material.holes
    : [material.outer, ...material.holes]) {
    // The first edge is always measured: nothing is nearer than nothing yet,
    // and a part with only an outline asks nothing of a box.
    if (
      nearest < Number.POSITIVE_INFINITY &&
      distanceToBox(boxOf(edge), point) - EPS_POINT > nearest
    ) {
      continue;
    }
    const distance = PathOps.distanceToPath(edge, point);
    if (distance < nearest) nearest = distance;
  }

  return nearest;
}

/** Each edge's box, kept by the path object it is the box of. */
const boxes = new WeakMap<Path, Rect | null>();

function boxOf(edge: Path): Rect | null {
  let box = boxes.get(edge);
  if (box === undefined) boxes.set(edge, (box = PathOps.bbox(edge)));
  return box;
}

/** How far a point is from a box, 0 inside it; 0 for no box, which rules nothing out. */
function distanceToBox(box: Rect | null, point: Vec2): Mm {
  if (box === null) return 0;
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dy = Math.max(box.minY - point.y, 0, point.y - box.maxY);
  return Math.hypot(dx, dy);
}
