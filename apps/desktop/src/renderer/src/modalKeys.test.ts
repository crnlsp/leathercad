import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { wrapTab } from './modalKeys.js';

describe('Tab inside an open dialog (U.20)', () => {
  it('goes round from the last stop to the first, and back from the first to the last', () => {
    expect(wrapTab(4, 5, false)).toBe(0);
    expect(wrapTab(0, 5, true)).toBe(4);
  });

  it('leaves every other step to the browser', () => {
    expect(wrapTab(0, 5, false)).toBeNull();
    expect(wrapTab(2, 5, true)).toBeNull();
    expect(wrapTab(3, 5, false)).toBeNull();
  });

  it('brings focus that is outside the dialog back in, at the end it was heading for', () => {
    expect(wrapTab(-1, 5, false)).toBe(0);
    expect(wrapTab(-1, 5, true)).toBe(4);
  });

  it('keeps a dialog with one stop on it', () => {
    expect(wrapTab(0, 1, false)).toBe(0);
    expect(wrapTab(0, 1, true)).toBe(0);
  });

  it('does nothing for a dialog with no stop at all', () => {
    expect(wrapTab(-1, 0, false)).toBeNull();
  });

  it('never sends focus outside the dialog', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 50 })
          .chain((count) =>
            fc.tuple(fc.constant(count), fc.integer({ min: -1, max: count - 1 }), fc.boolean()),
          ),
        ([count, index, back]) => {
          const next = wrapTab(index, count, back);
          if (next === null) {
            // The browser's own step, from a stop inside to the next inside.
            expect(index).toBeGreaterThanOrEqual(0);
            expect(back ? index > 0 : index < count - 1).toBe(true);
          } else {
            expect(next).toBeGreaterThanOrEqual(0);
            expect(next).toBeLessThan(count);
          }
        },
      ),
    );
  });
});
