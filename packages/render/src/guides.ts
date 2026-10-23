import type { Guide } from '@leathercad/domain';
import { polyline } from '@leathercad/geometry';
import { CANVAS } from './theme/index.js';
import { pathItem, type DisplayList } from './displayList.js';
import { visibleBoundsMm, type ViewportView } from './view.js';

/** Screen furniture only. Export scenes never include construction guides. */
export function guideDisplayList(
  guides: readonly Guide[],
  view: ViewportView,
  selected?: string,
): DisplayList {
  const bounds = visibleBoundsMm(view);
  return {
    items: guides.map((guide) => {
      const reach =
        Math.max(
          Math.abs(guide.origin.x - bounds.minX),
          Math.abs(guide.origin.x - bounds.maxX),
          Math.abs(guide.origin.y - bounds.minY),
          Math.abs(guide.origin.y - bounds.maxY),
        ) *
          2 +
        1;
      const dx = Math.cos(guide.angleRad) * reach;
      const dy = Math.sin(guide.angleRad) * reach;
      return pathItem(
        'construction',
        polyline(
          [
            { x: guide.origin.x - dx, y: guide.origin.y - dy },
            { x: guide.origin.x + dx, y: guide.origin.y + dy },
          ],
          false,
        ),
        {
          colour: guide.id === selected ? CANVAS.overlay.snap : CANVAS.overlay.preview,
          widthPx: 1,
          dashPx: [6, 4],
        },
      );
    }),
  };
}
