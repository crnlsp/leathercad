import type { IdSource } from '@leathercad/core';

/**
 * The real clock and entropy.
 *
 * Lives here rather than in @leathercad/core deliberately: a system clock and a
 * random number generator are operating-system resources, which is exactly what
 * this package exists to isolate. It also keeps core free of `Date.now` and
 * `crypto`, so the lint rules banning them there stay absolute instead of
 * needing an exception. See docs/testing.md §8.
 *
 * Tests use a scripted IdSource instead; nothing in a deterministic path should
 * reach for this.
 */
export const systemIdSource: IdSource = {
  now: () => Date.now(),

  randomBytes: (count: number): Uint8Array => {
    const bytes = new Uint8Array(count);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  },
};
