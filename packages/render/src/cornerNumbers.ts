import { evaluate, type Project } from '@leathercad/domain';
import { PathOps, Vec2Ops, type Vec2 } from '@leathercad/geometry';

import { boardTextItem, dotsItem, type DisplayItem, type DisplayList } from './displayList.js';
import { ACCENT, CANVAS } from './theme/index.js';

/**
 * Screen-only feedback while a corner is being chosen (Q48): each corner of
 * `featureId`, dotted and numbered as *Stitched sides* and *Sew together…*
 * name it — `number(1)` for anchor 0 — set outward from the outline's middle.
 */
export function cornerNumbers(
  project: Project,
  featureId: string,
  number: (ordinal: number) => string,
): DisplayList {
  const entry = evaluate(project)
    .parts.flatMap((p) => p.features)
    .find((f) => f.feature.id === featureId);
  const box = entry?.ok === true ? PathOps.bbox(entry.path) : null;
  if (entry?.ok !== true || box === null) return { items: [] };
  const measure = PathOps.measure(entry.path);
  const middle = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const corners = entry.anchors.flatMap((distance, index) =>
    distance === null ? [] : [{ index, at: measure.pointAtDistance(distance) }],
  );
  const items: DisplayItem[] = [
    dotsItem(
      'construction',
      corners.map((c) => c.at),
      CANVAS.corner.dotRadiusPx,
      CANVAS.halo.selected,
    ),
  ];
  for (const { index, at } of corners) {
    // A corner at the very middle has no outward; its label sits above it.
    const out: Vec2 = Vec2Ops.tryNormalise(Vec2Ops.sub(at, middle)) ?? { x: 0, y: 1 };
    items.push(
      boardTextItem(
        Vec2Ops.add(at, Vec2Ops.scale(out, CANVAS.corner.labelGapMm)),
        number(index + 1),
        CANVAS.text.value,
        ACCENT.tanInk,
      ),
    );
  }
  return { items };
}
