import { COORDINATE_LIMIT_MM, isErr, quantise } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { beyondLimitRefusal, farthestMove, fieldErrorText, readField } from './fieldText.js';

const english = createI18n('en').t;
const huge = '1' + '0'.repeat(305);

describe('readField', () => {
  it('refuses the sizes that blanked the window, rather than storing them (QA F1, F2, F6)', () => {
    // Height 1e10, Width 1e305, X 1e16, a guide at 1e305, a pitch of 1e305, 150 m.
    for (const text of ['10000000000', '99999999999999999999', huge, '1e16', '150000', '-200000'])
      expect(readField(text, true), text).toEqual({ ok: false, error: { kind: 'beyondLimit' } });
  });

  it('refuses a turn or a count past the same bound (QA F1: Turn 1e305)', () => {
    expect(readField(huge, false)).toEqual({ ok: false, error: { kind: 'beyondLimit' } });
    expect(readField('-200000', false)).toEqual({ ok: false, error: { kind: 'beyondLimit' } });
    expect(readField('45', false)).toEqual({ ok: true, value: 45 });
  });

  it('reads scientific notation in millimetres (QA F8)', () => {
    expect(readField('1e3', true)).toEqual({ ok: true, value: 1000 });
    expect(readField('1e-9', true)).toEqual({ ok: true, value: 1e-9 });
    expect(readField('1e6', true)).toEqual({ ok: false, error: { kind: 'beyondLimit' } });
  });

  it('gives only values a project holds, which quantise to a finite value inside the limit', () => {
    fc.assert(
      fc.property(fc.oneof(fc.double().map(String), fc.string()), fc.boolean(), (text, inMm) => {
        const read = readField(text, inMm);
        if (isErr(read)) return true;
        const stored = quantise(read.value);
        return Number.isFinite(stored) && Math.abs(stored) <= COORDINATE_LIMIT_MM;
      }),
    );
  });
});

describe('fieldErrorText', () => {
  it('names the limit, in millimetres for a size', () => {
    expect(fieldErrorText({ kind: 'beyondLimit' }, true, english)).toBe(
      'More than a project holds: up to 100,000 mm either way',
    );
    expect(fieldErrorText({ kind: 'beyondLimit' }, false, english)).toBe(
      'More than a field holds: up to 100,000 either way',
    );
  });

  it('says why for every other refusal as before', () => {
    expect(fieldErrorText({ kind: 'unit', unit: 'ft' }, true, english)).toBe(
      '“ft” is not a unit here. Use mm, cm or in',
    );
    expect(fieldErrorText({ kind: 'notFinite' }, true, english)).toBe(
      'That doesn’t come to a number',
    );
  });
});

describe('farthestMove', () => {
  const L = COORDINATE_LIMIT_MM;

  it('lets a move that stays within the limit go as typed', () => {
    expect(farthestMove(0, 100, 1000)).toBeNull();
    expect(farthestMove(0, 100, L - 100)).toBeNull();
    expect(farthestMove(0, 100, -L)).toBeNull();
  });

  it('offers the farthest that fits for a move past it (QA F2, F6: Move by 1e305)', () => {
    expect(farthestMove(50, 150, L)).toBe(L - 150);
    expect(farthestMove(50, 150, 1e305)).toBe(L - 150);
    expect(farthestMove(-50, 0, -L)).toBe(-L + 50);
  });

  it('keeps the moved box within the limit, on the grid', () => {
    const at = fc.double({ min: -L, max: L, noNaN: true });
    fc.assert(
      fc.property(at, at, fc.double({ min: -3 * L, max: 3 * L, noNaN: true }), (a, b, delta) => {
        const low = quantise(Math.min(a, b));
        const high = quantise(Math.max(a, b));
        const use = farthestMove(low, high, delta);
        const moved = use ?? delta;
        const inside = low + moved >= -L - 1e-6 && high + moved <= L + 1e-6;
        return inside && (use === null || quantise(use) === use);
      }),
    );
  });

  it('says what it offers, and how to take it', () => {
    expect(beyondLimitRefusal(99_850, { t: english, enter: 'Enter' })).toEqual({
      reason:
        'That takes the selection past what a project holds, 100,000 mm either way. Enter uses 99850.0.',
      use: 99_850,
    });
  });
});
