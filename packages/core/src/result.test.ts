import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, mapOk, ok, unwrap, unwrapOr } from './result.js';

describe('Result', () => {
  it('carries a value on success', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(unwrap(r)).toBe(42);
  });

  it('carries an error on failure', () => {
    const r = err('offset collapsed');
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });

  it('throws on unwrapping a failure, including the error in the message', () => {
    expect(() => unwrap(err('offset collapsed'))).toThrow(/offset collapsed/);
  });

  it('unwrapOr substitutes only on failure', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err('nope'), 9)).toBe(9);
  });

  it('mapOk transforms a value and leaves an error untouched', () => {
    expect(mapOk(ok(2), (n) => n * 3)).toEqual(ok(6));

    const failure = err('bad');
    expect(mapOk(failure, (n: number) => n * 3)).toBe(failure);
  });

  it('does not call the mapper for a failure', () => {
    let called = false;
    mapOk(err('bad'), (n: number) => {
      called = true;
      return n;
    });
    expect(called).toBe(false);
  });

  it('distinguishes a successful undefined from a failure', () => {
    // A discriminated union rather than a nullable return: `ok(undefined)` is a
    // success that happens to carry nothing, which null-based APIs cannot say.
    const r = ok(undefined);
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toBeUndefined();
  });
});
