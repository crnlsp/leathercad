import { RESOURCE_LIMITS, ResourceLimitError } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PathOps } from '../index.js';
import { distributeAlongPath, planDistribution } from './distribute.js';

describe('distribution preflight (PERF-012)', () => {
  it('plans exactly the count and spacing that generation uses', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 2000, noNaN: true }),
        fc.double({ min: 0.5, max: 20, noNaN: true }),
        fc.constantFrom('fit-whole' as const, 'exact-pitch' as const),
        fc.boolean(),
        (length, pitchMm, mode, closed) => {
          const path = PathOps.polyline(
            [
              { x: 0, y: 0 },
              { x: length, y: 0 },
            ],
            closed,
          );
          const measure = PathOps.measure(path);
          const options = { pitchMm, mode, closed, startOffsetMm: 0.25 };
          const plan = planDistribution(measure.totalLength(), options);
          const result = distributeAlongPath(measure, options);
          expect(plan).toEqual({ count: result.points.length, actualPitch: result.actualPitch });
        },
      ),
    );
  });

  it('refuses excessive work before placing points', () => {
    const length = (RESOURCE_LIMITS.holes + 1) * 0.5;
    const line = PathOps.polyline([
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ]);
    expect(() =>
      distributeAlongPath(PathOps.measure(line), {
        pitchMm: 0.5,
        mode: 'exact-pitch',
        closed: false,
      }),
    ).toThrowError(ResourceLimitError);
  });
});
