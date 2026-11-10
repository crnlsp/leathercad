import { resolveSeam, type Project, type Seam } from '@leathercad/domain';

import { boardTextItem, dotsItem, type DisplayItem, type DisplayList } from './displayList.js';
import { ACCENT, CANVAS } from './theme/index.js';

/** Screen-only feedback: every hole in the two stretches, every fifth paired hole numbered. */
export function seamOverlay(
  project: Project,
  seam: Seam,
  number: (ordinal: number) => string,
): DisplayList {
  const result = resolveSeam(project, seam);
  if (!result.ok) return { items: [] };
  const items: DisplayItem[] = [];
  const paired = Math.min(result.a.holes.length, result.b.holes.length);
  for (const side of [result.a, result.b]) {
    items.push(
      dotsItem(
        'construction',
        side.holes.map((h) => h.hole.point),
        CANVAS.seam.holeRadiusPx,
        CANVAS.halo.selected,
      ),
    );
    side.holes.forEach((hole, i) => {
      if ((i + 1) % 5 !== 0 || i >= paired) return;
      const { point, tangent } = hole.hole;
      items.push(
        boardTextItem(
          {
            x: point.x - tangent.y * CANVAS.seam.labelGapMm,
            y: point.y + tangent.x * CANVAS.seam.labelGapMm,
          },
          number(i + 1),
          CANVAS.text.value,
          ACCENT.tanInk,
        ),
      );
    });
  }
  return { items };
}
