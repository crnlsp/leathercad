import { intersectPaths, PathOps, RectOps } from '@leathercad/geometry';

import type { ResolvedProject } from './evaluate.js';
import type { PartId } from './feature.js';

/**
 * Pieces whose visible outer cut contours cross, touch, or enclose one another,
 * once each in project order. These are board-space facts, not design errors:
 * paper templates may overlap, and nesting inside cut-outs may be intentional.
 *
 * Failed, hidden, missing and empty outlines contribute nothing. Open outlines
 * can intersect or lie inside a closed outline, but cannot enclose another.
 */
export function overlappingParts(resolved: ResolvedProject): readonly PartId[] {
  const outlines = resolved.parts.flatMap(({ part, features }) => {
    const outer = features.find(
      (entry) =>
        entry.ok &&
        entry.feature.visible &&
        entry.feature.kind === 'cut-contour' &&
        entry.feature.role === 'outer',
    );
    if (outer === undefined || !outer.ok) return [];
    const bounds = PathOps.bbox(outer.path);
    const start = PathOps.start(outer.path);
    return bounds === null || start === null
      ? []
      : [{ id: part.id, path: outer.path, bounds, start }];
  });
  const conflicts = new Set<PartId>();
  for (const [i, a] of outlines.entries()) {
    for (const b of outlines.slice(i + 1)) {
      if (!RectOps.intersects(a.bounds, b.bounds)) continue;
      if (
        intersectPaths(a.path, b.path).length > 0 ||
        (a.path.closed && PathOps.containsPoint(a.path, b.start)) ||
        (b.path.closed && PathOps.containsPoint(b.path, a.start))
      ) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return resolved.parts.filter(({ part }) => conflicts.has(part.id)).map(({ part }) => part.id);
}
