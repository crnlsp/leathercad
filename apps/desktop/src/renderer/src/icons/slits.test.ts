import { NOMINAL_IRON } from '@leathercad/render';
import { describe, expect, it } from 'vitest';

import { slitMarkPath } from './slits.js';

describe('the stitch-holes mark', () => {
  it('leans its slits at the canvas’s slant, not a slant of its own', () => {
    const slits = [...slitMarkPath().matchAll(/M([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/g)].map((m) =>
      m.slice(1).map(Number),
    );
    expect(slits).toHaveLength(3);
    for (const [x1, y1, x2, y2] of slits) {
      // SVG Y points down: rising to the right is a positive world angle.
      const angle = Math.atan2(y1! - y2!, x2! - x1!);
      expect(angle).toBeCloseTo(NOMINAL_IRON.slantRad, 2);
    }
  });

  it('stays inside its 16 px box', () => {
    const numbers = slitMarkPath()
      .match(/[\d.]+/g)!
      .map(Number);
    expect(numbers.every((n) => n >= 0.5 && n <= 15.5)).toBe(true);
  });
});
