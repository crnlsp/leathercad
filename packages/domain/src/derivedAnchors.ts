import { EPS_PARAM, approxZero, type Mm } from '@leathercad/core';
import { PathOps, type OffsetPiece, type Path } from '@leathercad/geometry';

/**
 * Where a source's anchors end up on the geometry derived from it.
 *
 * [ADR 0010](../../../docs/adr/0010-anchors-address-geometry.md): derived
 * features carry their source's anchors under the same indices, and the
 * mapping comes from the code that built the geometry — the offset's own trace
 * — never from looking for the nearest point afterwards. A search lands on the
 * wrong corner the moment an offset removes one, which is precisely when a
 * pattern is about to be cut wrong.
 *
 * An anchor with no image is **missing, not moved** (E4): it comes back as
 * `null`, and anything naming it fails with `ANCHOR_MISSING` rather than
 * quietly attaching to a neighbour.
 */
export function mapAnchorsThroughOffset(
  anchorsMm: readonly (Mm | null)[],
  sourcePath: Path,
  piece: OffsetPiece,
): readonly (Mm | null)[] {
  if (sourcePath.segments.length === 0) return anchorsMm.map(() => null);

  const measure = PathOps.measure(sourcePath);
  return anchorsMm.map((anchor) =>
    // An anchor that was already missing stays missing, in its own place. It
    // is never given a number: a missing anchor that acquires one is a run
    // quietly attaching to the wrong corner, which is the whole failure ADR
    // 0010 exists to prevent.
    anchor === null ? null : imageOf(anchor, measure, sourcePath, piece),
  );
}

function imageOf(
  anchorMm: Mm,
  measure: ReturnType<typeof PathOps.measure>,
  sourcePath: Path,
  piece: OffsetPiece,
): Mm | null {
  const at = measure.locate(anchorMm);
  const index = at.segmentIndex;

  // A sharp corner sits exactly on the boundary between two segments, and
  // `locate` may report it from either side. Both mean the same corner.
  //
  // With no corner there, this is the end of an open run — the anchor the run
  // was cut at — so its image is where that run now ends.
  if (approxZero(at.t - 1, EPS_PARAM)) {
    return piece.corners[index] ?? piece.segments[index]?.endMm ?? null;
  }
  if (approxZero(at.t, EPS_PARAM)) {
    if (index > 0) return piece.corners[index - 1] ?? null;
    return sourcePath.closed
      ? (piece.corners[piece.corners.length - 1] ?? null)
      : (piece.segments[index]?.startMm ?? null);
  }

  const range = piece.segments[index];
  // The segment was swallowed — a 3 mm corner inset by 3.5 — so its anchor
  // went where its neighbours now meet, which is the corner it became.
  if (range === null || range === undefined) return piece.corners[index] ?? null;

  // Inside a segment: a rounded corner's midpoint. Both a line and a
  // concentric arc travel at a constant rate, so the parameter carries across
  // exactly rather than approximately.
  return range.startMm + (range.endMm - range.startMm) * at.t;
}
