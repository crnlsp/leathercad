import { PathOps, type Path } from '@leathercad/geometry';

/**
 * Which piece of a split offset to keep, and how many were left out.
 *
 * An offset can come apart: insetting a dumbbell outline far enough pinches it
 * into two islands. Keeping only the first piece and saying nothing is the
 * failure invariant E2 exists to forbid, so the caller keeps the **largest**
 * and reports the rest as `OFFSET_SPLIT`.
 *
 * Largest by enclosed area for a closed piece, by length for an open one. Ties
 * keep the earlier piece, so the choice is deterministic.
 *
 * Tier 1 `offsetPath` never returns more than one piece today — it refuses a
 * result that folds over itself rather than splitting it — so this runs on real
 * geometry only once Tier 2 offsetting arrives. It is written and tested now so
 * E2 holds on that day without anyone having to remember it.
 */
export function keepLargestPiece(pieces: readonly Path[]): { kept: Path; dropped: number } {
  const [first, ...rest] = pieces;
  if (first === undefined) throw new RangeError('keepLargestPiece needs at least one piece');

  let kept = first;
  let keptSize = sizeOf(first);
  for (const piece of rest) {
    const size = sizeOf(piece);
    if (size > keptSize) {
      kept = piece;
      keptSize = size;
    }
  }

  return { kept, dropped: pieces.length - 1 };
}

function sizeOf(piece: Path): number {
  return piece.closed ? Math.abs(PathOps.signedArea(piece)) : PathOps.length(piece);
}
