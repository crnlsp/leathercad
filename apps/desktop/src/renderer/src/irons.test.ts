import { MIN_PITCH_MM } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { IRON_PRESETS } from './irons.js';

describe('the iron presets', () => {
  it('are all at or above the pitch floor evaluation enforces (5.6)', () => {
    // The panel's pitch field reads MIN_PITCH_MM; a preset is the other way a
    // pitch is chosen there, and must never be one evaluation refuses.
    for (const iron of IRON_PRESETS)
      expect(iron.pitchMm, iron.label).toBeGreaterThanOrEqual(MIN_PITCH_MM);
  });
});
