import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { minutesUntilAgain } from './updateWait.js';

const answer = (againAt: number) => ({ checkedAt: againAt - 300_000, againAt });

describe('minutesUntilAgain', () => {
  it('counts whole minutes up to the next check, and nothing once it may ask', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10 ** 12 }),
        fc.integer({ min: -600_000, max: 300_000 }),
        (at, left) => {
          const minutes = minutesUntilAgain({ state: 'current', ...answer(at + left) }, at);
          if (left <= 0) expect(minutes).toBeNull();
          else {
            expect(minutes).toBeGreaterThanOrEqual(1);
            // Never says less than is left, nor a minute more.
            expect(minutes! * 60_000).toBeGreaterThanOrEqual(left);
            expect((minutes! - 1) * 60_000).toBeLessThan(left);
          }
        },
      ),
    );
  });

  it('says five minutes the moment an answer comes, whichever it was', () => {
    for (const state of ['current', 'available'] as const) {
      const status =
        state === 'current'
          ? { state, ...answer(300_000) }
          : { state, version: '9.0.0', url: 'https://example.test/', ...answer(300_000) };
      expect(minutesUntilAgain(status, 0)).toBe(5);
    }
  });

  it('never says more than the five minutes, however early the clock was read', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 ** 12 }), fc.nat({ max: 10 ** 9 }), (checkedAt, early) => {
        const status = { state: 'current' as const, checkedAt, againAt: checkedAt + 300_000 };
        expect(minutesUntilAgain(status, checkedAt - early)).toBe(5);
      }),
    );
  });

  it('never waits after a failed check, before one, or in the Flatpak', () => {
    for (const state of ['idle', 'failed', 'managed'] as const) {
      expect(minutesUntilAgain({ state }, 0)).toBeNull();
    }
  });
});
