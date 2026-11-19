import type { Part } from './feature.js';

/**
 * How many of a part's pieces are cut with the template turned over (Q21):
 * half of a mirrored pair's count — one left for each right — and none for a
 * piece cut alike. The figures a count gives (pieces, holes, leather) do not
 * change: turning the template over makes the other hand, not another piece.
 */
export function turnedOver(part: Pick<Part, 'quantity' | 'mirroredPair'>): number {
  if (part.mirroredPair !== true) return 0;
  if (part.quantity % 2 !== 0) {
    throw new RangeError(`A mirrored pair needs an even count, received ${String(part.quantity)}`);
  }
  return part.quantity / 2;
}
