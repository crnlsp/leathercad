import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { describeCounts, indicatorOf } from './problemsIndicator.js';

/**
 * Print's second half (R-06): a check when there is nothing to fix, then the
 * worst severity there is and how many of it. Read from `countBySeverity`, as
 * the Problems drawer is, so the two say one thing.
 */

const i18n = createI18n('en');
const counts = fc.record({
  error: fc.nat({ max: 50 }),
  warning: fc.nat({ max: 50 }),
  info: fc.nat({ max: 50 }),
});

describe('indicatorOf', () => {
  it('is a check with nothing in the list', () => {
    expect(indicatorOf({ error: 0, warning: 0, info: 0 })).toEqual({ state: 'clear', count: 0 });
  });

  it('shows the warnings when there are no errors', () => {
    expect(indicatorOf({ error: 0, warning: 2, info: 3 })).toEqual({ state: 'warning', count: 2 });
  });

  it('lets an error outrank any number of warnings', () => {
    expect(indicatorOf({ error: 1, warning: 9, info: 0 })).toEqual({ state: 'error', count: 1 });
  });

  it('counts what is only to note, rather than claim there is nothing', () => {
    // The drawer lists them, so the button must not say "nothing to fix".
    expect(indicatorOf({ error: 0, warning: 0, info: 2 })).toEqual({ state: 'info', count: 2 });
  });

  it('shows the count of the worst severity there is, and clear only for none', () => {
    fc.assert(
      fc.property(counts, (c) => {
        const shown = indicatorOf(c);
        expect(shown.state === 'clear').toBe(c.error + c.warning + c.info === 0);
        if (shown.state !== 'clear') expect(shown.count).toBe(c[shown.state]);
        if (c.error > 0) expect(shown.state).toBe('error');
      }),
    );
  });
});

describe('describeCounts', () => {
  it('names each severity there is, worst first', () => {
    expect(describeCounts({ error: 1, warning: 2, info: 0 }, i18n)).toBe('1 error, 2 warnings');
    expect(describeCounts({ error: 0, warning: 1, info: 3 }, i18n)).toBe('1 warning, 3 to note');
  });

  it('says nothing for nothing', () => {
    expect(describeCounts({ error: 0, warning: 0, info: 0 }, i18n)).toBeNull();
  });
});
