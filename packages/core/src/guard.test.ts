import { describe, expect, it } from 'vitest';

import { assertFinite, invariant } from './guard.js';

describe('assertFinite', () => {
  it('returns the value unchanged when it is finite', () => {
    expect(assertFinite(0, 'x')).toBe(0);
    expect(assertFinite(-2000.5, 'x')).toBe(-2000.5);
  });

  it('throws a RangeError naming the offending parameter', () => {
    // A NaN that propagates silently blanks a canvas and writes an unopenable
    // file. Naming the parameter turns a mystery into a message.
    expect(() => assertFinite(Number.NaN, 'radius')).toThrow(RangeError);
    expect(() => assertFinite(Number.NaN, 'radius')).toThrow(/radius/);
    expect(() => assertFinite(Number.NaN, 'radius')).toThrow(/NaN/);
  });

  it('rejects both infinities and reports which', () => {
    expect(() => assertFinite(Number.POSITIVE_INFINITY, 'w')).toThrow(/Infinity/);
    expect(() => assertFinite(Number.NEGATIVE_INFINITY, 'w')).toThrow(/Infinity/);
  });
});

describe('invariant', () => {
  it('does nothing when the condition holds', () => {
    expect(() => invariant(true, 'unreachable')).not.toThrow();
  });

  it('throws with the given message when it does not', () => {
    expect(() => invariant(false, 'path must be closed')).toThrow('path must be closed');
  });

  it('narrows the type for the compiler', () => {
    const value: number | null = 1 as number | null;
    invariant(value !== null, 'value must be set');
    // If the assertion signature is wrong this line fails to compile, which is
    // the actual thing under test.
    expect(value + 1).toBe(2);
  });
});
