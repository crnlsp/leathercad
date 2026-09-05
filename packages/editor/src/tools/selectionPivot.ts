import { evaluate, type Project } from '@leathercad/domain';
import { PathOps, RectOps, type Vec2 } from '@leathercad/geometry';

/**
 * The centre of everything selected, in millimetres.
 *
 * Rotation and scaling both need a fixed point, and the middle of what you can
 * see is the one users expect — turning a panel should spin it where it sits,
 * not swing it around the origin.
 *
 * Null when nothing is selected or nothing resolves, which the tools read as
 * "there is nothing to transform".
 */
export function selectionPivot(project: Project, selected: ReadonlySet<string>): Vec2 | null {
  if (selected.size === 0) return null;

  const boxes = [];
  for (const part of evaluate(project).parts) {
    for (const feature of part.features) {
      if (!feature.ok || !selected.has(feature.feature.id)) continue;
      const box = PathOps.bbox(feature.path);
      if (box !== null) boxes.push(box);
    }
  }

  if (boxes.length === 0) return null;

  const points = boxes.flatMap((box) => [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.maxY },
  ]);
  const union = RectOps.fromPoints(points);
  return union === null ? null : RectOps.centre(union);
}
