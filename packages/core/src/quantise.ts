import { assertFinite } from './guard.js';

/**
 * The grid every stored coordinate snaps to: 0.1 micrometre.
 *
 * Chosen to sit far below anything physically meaningful (a 600 dpi printer
 * dot is 42 µm) while being coarse enough that values which *should* coincide
 * actually do.
 */
export const QUANTUM_MM = 1e-4;

const PER_MM = 1 / QUANTUM_MM;

/**
 * Snaps a coordinate to the storage grid.
 *
 * Applied to every value entering the model — typed, clicked or snapped — and
 * it buys three things at once:
 *
 * 1. Coincidence becomes exact. Two endpoints the user snapped together are
 *    bitwise equal, not "equal within epsilon", so no downstream algorithm has
 *    to guess.
 * 2. Saving is byte-stable, which makes .lcp files diff cleanly in git and
 *    makes a re-save of an untouched document a no-op.
 * 3. It matches Clipper2's integer space exactly (1 unit = 1e-4 mm), so the
 *    conversion into offsetting is lossless.
 *
 * Only for values being *stored*. Intermediate computation runs at full double
 * precision; quantising mid-algorithm would accumulate error, not remove it.
 */
export function quantise(value: number): number {
  assertFinite(value, 'quantise value');
  const snapped = Math.round(value * PER_MM) / PER_MM;
  // -0 and 0 are indistinguishable to a user but not to Object.is, and the
  // difference would surface as a spurious document round-trip failure.
  return Object.is(snapped, -0) ? 0 : snapped;
}
