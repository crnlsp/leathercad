import { DEFAULT_SETTINGS, type Feature, type Project } from '@leathercad/domain';
import { uniformRadii, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { cornerNumbers } from './cornerNumbers.js';
import type { DisplayItem } from './displayList.js';

/** A 100 × 60 panel from the origin, turned `rotation` about its centre. */
function panel(rotation = 0, radius = 0): Project {
  const outline: Feature = {
    id: 'outline',
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    visible: true,
    locked: false,
    source: {
      kind: 'shape',
      shape: {
        type: 'rect',
        origin: { x: 0, y: 0 },
        width: 100,
        height: 60,
        radii: uniformRadii(radius),
        rotation,
      },
    },
  };
  return {
    id: 'p',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part-1', name: 'Panel', quantity: 1, features: [outline] }],
  };
}

const labels = (items: readonly DisplayItem[]) =>
  items.flatMap((item) => (item.kind === 'overlay-text' ? [{ text: item.text, at: item.at }] : []));

describe('corner numbers on the board (Q48)', () => {
  it('numbers each corner as the corner fields name it, beside its corner', () => {
    const shown = labels(cornerNumbers(panel(), 'outline', String).items);
    // Corner 1 is the bottom right, then round anticlockwise (domain anchors.ts).
    const corners: Vec2[] = [
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
      { x: 0, y: 0 },
    ];
    expect(shown.map((s) => s.text)).toEqual(['1', '2', '3', '4']);
    shown.forEach(({ at }, i) => {
      const corner = corners[i]!;
      // Outside the piece, a few millimetres off its own corner.
      expect(Math.hypot(at.x - corner.x, at.y - corner.y)).toBeCloseTo(4, 6);
      expect(at.x < 0 || at.x > 100 || at.y < 0 || at.y > 60).toBe(true);
    });
  });

  it('marks every corner, whatever the radii and the turn, outside the piece', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.integer({ min: 0, max: 30 }),
        (rotation, radius) => {
          const list = cornerNumbers(panel(rotation, radius), 'outline', String);
          const shown = labels(list.items);
          expect(shown.map((s) => s.text)).toEqual(['1', '2', '3', '4']);
          const centre = { x: 50, y: 30 };
          for (const { at } of shown)
            expect(Math.hypot(at.x - centre.x, at.y - centre.y)).toBeGreaterThan(29);
        },
      ),
    );
  });

  it('shows nothing for a feature that is not there', () => {
    expect(cornerNumbers(panel(), 'gone', String).items).toEqual([]);
  });
});
