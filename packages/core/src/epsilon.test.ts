import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  EPS_ANGLE,
  EPS_AREA,
  EPS_LENGTH,
  EPS_PARAM,
  EPS_POINT,
  approxCmp,
  approxEq,
  approxGte,
  approxLte,
  approxZero,
} from './epsilon.js';

/** Values inside the documented working range: 0.1 mm to 2000 mm, both signs. */
const workingRange = fc.double({ min: -2000, max: 2000, noNaN: true });

describe('epsilon constants', () => {
  it('sit above floating-point noise and far below any meaningful leather dimension', () => {
    // At 2000 mm a double resolves to ~1e-13 mm, so 1e-7 has four orders of
    // headroom; 0.1 µm is also far below anything a maker can cut.
    expect(EPS_POINT).toBe(1e-7);
    expect(EPS_LENGTH).toBe(1e-7);
    expect(EPS_PARAM).toBe(1e-9);
    expect(EPS_ANGLE).toBe(1e-9);
    expect(EPS_AREA).toBe(1e-12);
  });
});

describe('approxEq', () => {
  it('is reflexive for every finite value', () => {
    fc.assert(fc.property(workingRange, (a) => approxEq(a, a)));
  });

  it('is symmetric', () => {
    fc.assert(fc.property(workingRange, workingRange, (a, b) => approxEq(a, b) === approxEq(b, a)));
  });

  it('accepts a difference strictly inside the tolerance and rejects one outside', () => {
    expect(approxEq(1, 1 + 5e-8)).toBe(true);
    expect(approxEq(1, 1 + 5e-7)).toBe(false);
  });

  it('treats a difference of exactly the tolerance as equal', () => {
    // Measured from zero on purpose. The obvious form, approxEq(1, 1 +
    // EPS_POINT), does not test what it looks like: (1 + 1e-7) - 1 evaluates
    // to 1.0000000005838672e-7, so it is a hair *outside* the tolerance and
    // the assertion fails for reasons that have nothing to do with approxEq.
    // An exact boundary is only testable where the subtraction is exact.
    expect(approxEq(0, EPS_POINT)).toBe(true);
    expect(approxEq(0, -EPS_POINT)).toBe(true);
  });

  it('rejects a difference just outside the tolerance', () => {
    expect(approxEq(0, EPS_POINT * 1.001)).toBe(false);
  });

  it('honours an explicit tolerance', () => {
    expect(approxEq(1, 1.05, 0.1)).toBe(true);
    expect(approxEq(1, 1.05, 0.01)).toBe(false);
  });

  it('treats +0 and -0 as equal', () => {
    expect(approxEq(0, -0)).toBe(true);
  });

  it('is false for NaN against anything, including itself', () => {
    expect(approxEq(Number.NaN, Number.NaN)).toBe(false);
    expect(approxEq(Number.NaN, 1)).toBe(false);
    expect(approxEq(1, Number.NaN)).toBe(false);
  });

  it('treats identical infinities as equal and opposite ones as not', () => {
    // Infinity should never reach geometry, but returning NaN-driven garbage
    // here would hide the bug rather than surface it.
    expect(approxEq(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(true);
    expect(approxEq(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toBe(false);
    expect(approxEq(Number.POSITIVE_INFINITY, 1)).toBe(false);
  });
});

describe('approxZero', () => {
  it('agrees with approxEq against zero', () => {
    fc.assert(fc.property(workingRange, (a) => approxZero(a) === approxEq(a, 0)));
  });

  it('accepts values inside the tolerance', () => {
    expect(approxZero(1e-9)).toBe(true);
    expect(approxZero(-1e-9)).toBe(true);
    expect(approxZero(1e-5)).toBe(false);
  });
});

describe('approxLte / approxGte / approxCmp', () => {
  it('treat values within tolerance as satisfying both orderings', () => {
    const a = 1;
    const b = 1 + EPS_POINT / 2;
    expect(approxLte(a, b)).toBe(true);
    expect(approxGte(a, b)).toBe(true);
    expect(approxLte(b, a)).toBe(true);
    expect(approxGte(b, a)).toBe(true);
  });

  it('order strictly outside the tolerance', () => {
    expect(approxLte(1, 2)).toBe(true);
    expect(approxGte(1, 2)).toBe(false);
    expect(approxLte(2, 1)).toBe(false);
    expect(approxGte(2, 1)).toBe(true);
  });

  it('approxCmp returns 0 exactly when approxEq is true', () => {
    fc.assert(
      fc.property(workingRange, workingRange, (a, b) => (approxCmp(a, b) === 0) === approxEq(a, b)),
    );
  });

  it('approxCmp is antisymmetric', () => {
    fc.assert(
      fc.property(workingRange, workingRange, (a, b) => approxCmp(a, b) === -approxCmp(b, a)),
    );
  });
});
