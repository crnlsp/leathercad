import type { DrawMode } from '@leathercad/editor';
import { describe, expect, it } from 'vitest';

import { DRAW_GROUPS } from './drawModes.js';

/** Every mode, once: a Record fails to compile when a mode is added or missing. */
const EVERY: Readonly<Record<DrawMode, true>> = {
  outline: true,
  'stitch-allowance': true,
  'cut-out': true,
  stitch: true,
  fold: true,
  marking: true,
};

describe('Draw as (MS.5)', () => {
  it('groups the six modes as the workshop does', () => {
    expect(DRAW_GROUPS).toEqual([
      { group: 'cut', modes: ['outline', 'cut-out'] },
      { group: 'stitch', modes: ['stitch', 'stitch-allowance'] },
      { group: 'mark', modes: ['fold', 'marking'] },
    ]);
    const modes = DRAW_GROUPS.flatMap((entry) => entry.modes);
    expect(new Set(modes).size).toBe(modes.length);
    expect([...modes].sort()).toEqual(Object.keys(EVERY).sort());
  });
});
