import { DEFAULT_SETTINGS, evaluate, type Feature, type Project } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { buildDisplayList } from './buildDisplayList.js';
import { CANVAS } from './theme/index.js';

/** A marking line 100 mm long and five 4 mm holes along it, 25 mm apart (4.14). */
function strap(): Project {
  const base = { visible: true, locked: false };
  const features: Feature[] = [
    {
      ...base,
      id: 'mark-1',
      name: 'Marking',
      kind: 'marking-line',
      purpose: 'other',
      source: {
        kind: 'path',
        path: PathOps.polyline(
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          false,
        ),
      },
    },
    {
      ...base,
      id: 'row-1',
      name: 'Row of holes',
      kind: 'hole-row',
      source: {
        kind: 'derived',
        sourceId: 'mark-1',
        op: { type: 'hole-row', pitchMm: 25, radiusMm: 2 },
      },
    },
  ];
  return {
    id: 'p',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part-1', name: 'Strap', quantity: 1, features }],
  };
}

const holesDrawn = (pxPerMm: number) =>
  buildDisplayList(evaluate(strap()), { pxPerMm }).items.filter(
    (item) => item.kind === 'path' && item.role === 'hardware',
  );

describe('a row of holes on the canvas (4.14)', () => {
  it('draws each hole as a circle at its true size, in the hardware role', () => {
    const circles = holesDrawn(CANVAS.bands.workingPxPerMm);

    expect(circles).toHaveLength(5);
    for (const [i, item] of circles.entries()) {
      if (item.kind !== 'path') throw new Error('a hole is drawn as a path');
      const box = PathOps.bbox(item.path)!;
      expect(box.maxX - box.minX).toBeCloseTo(4, 9);
      expect((box.minX + box.maxX) / 2).toBeCloseTo(i * 25, 9);
    }
  });

  it('still draws them zoomed out, where a hole set becomes its line', () => {
    expect(holesDrawn(CANVAS.bands.overviewBelowPxPerMm / 2)).toHaveLength(5);
  });

  it('draws no slits: a row is punched, not pricked', () => {
    const list = buildDisplayList(evaluate(strap()));

    expect(list.items.filter((item) => item.kind === 'slits')).toEqual([]);
  });
});
