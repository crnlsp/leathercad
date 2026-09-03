import { createIdFactory } from '@leathercad/core';
import { describe, expect, it } from 'vitest';

import { systemIdSource } from './systemIdSource.js';

describe('systemIdSource', () => {
  it('reports a plausible current time in milliseconds', () => {
    const now = systemIdSource.now();
    expect(Number.isInteger(now)).toBe(true);
    // Somewhere after 2020 and before 2100 — enough to catch seconds-vs-ms.
    expect(now).toBeGreaterThan(1_577_836_800_000);
    expect(now).toBeLessThan(4_102_444_800_000);
  });

  it('returns the requested number of bytes', () => {
    expect(systemIdSource.randomBytes(16)).toHaveLength(16);
    expect(systemIdSource.randomBytes(1)).toHaveLength(1);
  });

  it('does not return a constant buffer', () => {
    // Weak by nature — this checks the generator is wired up at all, not that
    // it is a good one. Two identical 16-byte draws would mean it is not.
    const a = systemIdSource.randomBytes(16);
    const b = systemIdSource.randomBytes(16);
    expect(a).not.toEqual(b);
  });

  it('drives a working id factory', () => {
    const next = createIdFactory(systemIdSource);
    const ids = Array.from({ length: 200 }, () => next());

    expect(new Set(ids).size).toBe(200);
    expect(ids.every((id) => id.length === 26)).toBe(true);
    // Generated in a burst inside one or two milliseconds — still ordered.
    expect([...ids].sort()).toEqual(ids);
  });
});
