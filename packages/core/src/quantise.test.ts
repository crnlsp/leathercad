import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { QUANTUM_MM, quantise } from './quantise.js';

/** The file format's documented coordinate limit. */
const inRange = fc.double({ min: -100_000, max: 100_000, noNaN: true });

describe('quantise', () => {
  it('snaps to a 0.1 µm grid', () => {
    expect(QUANTUM_MM).toBe(1e-4);
    expect(quantise(1.00004)).toBe(1);
    expect(quantise(1.00006)).toBe(1.0001);
    expect(quantise(105)).toBe(105);
  });

  it('never moves a value by more than half a quantum', () => {
    fc.assert(fc.property(inRange, (v) => Math.abs(quantise(v) - v) <= QUANTUM_MM / 2 + 1e-9));
  });

  it('is idempotent', () => {
    // This is what makes saving an untouched file byte-identical.
    fc.assert(fc.property(inRange, (v) => quantise(quantise(v)) === quantise(v)));
  });

  it('preserves ordering', () => {
    fc.assert(fc.property(inRange, inRange, (a, b) => (a <= b ? quantise(a) <= quantise(b) : true)));
  });

  it('lands on a multiple of the quantum', () => {
    fc.assert(
      fc.property(inRange, (v) => {
        const scaled = quantise(v) * 10_000;
        return Math.abs(scaled - Math.round(scaled)) < 1e-6;
      }),
    );
  });

  it('normalises negative zero', () => {
    // Object.is(-0, 0) is false, which would break deep-equality in document
    // round-trip tests for a difference no user could ever perceive.
    expect(Object.is(quantise(-0.00001), 0)).toBe(true);
    expect(Object.is(quantise(-0), 0)).toBe(true);
  });

  it('makes two values that should coincide bitwise equal', () => {
    // The point of quantisation: snapped endpoints become the same point, not
    // "the same within epsilon".
    expect(quantise(10.000_000_04)).toBe(quantise(9.999_999_97));
  });

  it('rejects non-finite input rather than silently producing NaN', () => {
    expect(() => quantise(Number.NaN)).toThrow(RangeError);
    expect(() => quantise(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => quantise(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});
