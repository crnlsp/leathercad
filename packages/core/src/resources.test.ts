import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { RESOURCE_LIMITS, ResourceLimitError, checkResourceLimit } from './resources.js';

describe('work limits (PERF-012)', () => {
  it('accepts every integer up to the limit, including the boundary', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: RESOURCE_LIMITS.holes }), (count) => {
        expect(() => checkResourceLimit('holes', count)).not.toThrow();
      }),
    );
  });

  it('refuses larger requests with facts, without doing any of the work', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000000 }), (extra) => {
        const requested = RESOURCE_LIMITS.holes + extra;
        expect(() => checkResourceLimit('holes', requested)).toThrowError(ResourceLimitError);
        try {
          checkResourceLimit('holes', requested);
        } catch (error) {
          expect(error).toMatchObject({
            resource: 'holes',
            requested,
            limit: RESOURCE_LIMITS.holes,
          });
        }
      }),
    );
  });

  it.each([NaN, Infinity, -1])('refuses an unusable count (%s)', (count) => {
    expect(() => checkResourceLimit('holes', count)).toThrowError(ResourceLimitError);
  });
});
