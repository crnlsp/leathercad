import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CROCKFORD_ALPHABET, createIdFactory, type IdSource } from './id.js';

/**
 * A fully scripted source. Determinism is not a nicety here: golden fixtures,
 * byte-stable saves and document round-trip tests all depend on ids being
 * reproducible. See docs/testing.md §8.
 */
function fixedSource(startMs: number, fill = 0): IdSource & { ms: number } {
  return {
    ms: startMs,
    now() {
      return this.ms;
    },
    randomBytes(n: number) {
      return new Uint8Array(n).fill(fill);
    },
  };
}

describe('createIdFactory', () => {
  it('produces 26-character ULIDs', () => {
    const next = createIdFactory(fixedSource(1_700_000_000_000));
    expect(next()).toHaveLength(26);
  });

  it('uses only the Crockford base32 alphabet', () => {
    const source = fixedSource(1_700_000_000_000, 0xff);
    const next = createIdFactory(source);
    for (let i = 0; i < 50; i++) {
      source.ms += 1;
      // I, L, O and U are excluded so ids cannot be misread aloud or retyped wrong.
      expect(next()).toMatch(new RegExp(`^[${CROCKFORD_ALPHABET}]{26}$`));
    }
    expect(CROCKFORD_ALPHABET).not.toMatch(/[ILOU]/);
  });

  it('is deterministic for a fixed source', () => {
    const a = createIdFactory(fixedSource(1_700_000_000_000, 7))();
    const b = createIdFactory(fixedSource(1_700_000_000_000, 7))();
    expect(a).toBe(b);
  });

  it('sorts lexicographically by creation time', () => {
    const source = fixedSource(1_700_000_000_000);
    const next = createIdFactory(source);

    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      ids.push(next());
      source.ms += 1000;
    }

    expect([...ids].sort()).toEqual(ids);
  });

  it('stays strictly increasing within a single millisecond', () => {
    // Without the monotonic increment, two ids made in the same millisecond
    // would sort by their random component — which is to say, arbitrarily.
    const next = createIdFactory(fixedSource(1_700_000_000_000, 0));

    const ids = Array.from({ length: 100 }, () => next());

    expect(new Set(ids).size).toBe(100);
    expect([...ids].sort()).toEqual(ids);
  });

  it('never goes backwards when the clock does', () => {
    // NTP steps and suspend/resume both move a wall clock backwards. Ids must
    // not, or document ordering silently corrupts.
    const source = fixedSource(1_700_000_000_000);
    const next = createIdFactory(source);

    const first = next();
    source.ms -= 60_000;
    const second = next();

    expect(second > first).toBe(true);
  });

  it('encodes the timestamp in the first 10 characters', () => {
    const source = fixedSource(1_700_000_000_000);
    const next = createIdFactory(source);
    const earlier = next().slice(0, 10);

    source.ms = 1_800_000_000_000;
    const later = createIdFactory(source)().slice(0, 10);

    expect(later > earlier).toBe(true);
  });

  it('produces distinct ids across a range of clock values', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 40 }), fc.integer({ min: 0, max: 255 }), (ms, b) => {
        const next = createIdFactory(fixedSource(ms, b));
        return next() !== next();
      }),
    );
  });

  it('rolls the timestamp forward when the random component wraps', () => {
    // Regression: fast-check shrank to [ms=0, byte=255]. Every digit starts at
    // its maximum, so the first increment overflows immediately. The original
    // implementation threw. Losing an id — and so a user's edit — to an
    // entropy edge case is never the right trade.
    const next = createIdFactory(fixedSource(0, 0xff));

    const first = next();
    const second = next();

    expect(second).not.toBe(first);
    expect(second > first).toBe(true);
    // The randomness is unchanged, so the ordering must come from the time part.
    expect(second.slice(0, 10) > first.slice(0, 10)).toBe(true);
  });

  it('rejects a timestamp beyond what 48 bits can hold', () => {
    const next = createIdFactory(fixedSource(2 ** 48));
    expect(() => next()).toThrow(RangeError);
  });

  it('rejects a non-integer or negative clock', () => {
    expect(() => createIdFactory(fixedSource(-1))()).toThrow(RangeError);
    expect(() => createIdFactory(fixedSource(1.5))()).toThrow(RangeError);
  });
});
