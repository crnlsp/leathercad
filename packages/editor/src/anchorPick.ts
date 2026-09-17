import { PathOps, SegmentOps, dist, type Vec2 } from '@leathercad/geometry';
import type { FeatureId, MeasureRef, ResolvedProject } from '@leathercad/domain';

/**
 * Resolving a click to a **durable** place on the drawing.
 *
 * A dimension's ends are anchors, never coordinates: a point-based dimension
 * keeps naming a place the drawing has left behind, and reads as authoritative
 * while being wrong (ADR 0010). So the measure tool asks this, and takes
 * nothing else.
 *
 * **Deliberately not part of the shared snap index.** Adding an `anchor` kind
 * to `snap.ts` would change what *every* tool snaps to — `SnapOptions.enabled`
 * treats absent kinds as enabled, and the kind priority would put a corner
 * above a segment end wherever the two coincide. That may well be an
 * improvement, but it is a change to how the whole application feels and it
 * should be made on its own merits rather than beneath a measurement. Slice
 * 4.10a keeps it here.
 *
 * **This is not the nearest-point search ADR 0010 forbids.** That rule is
 * about recovering a *mapping* — which output corner came from which input —
 * where a guess lands on the wrong one precisely when a corner has been
 * removed. This is authoring: the maker has pointed at a corner, and the
 * question is which anchor they meant. The candidates are the anchor list
 * itself, so the index comes back **with** the answer rather than being
 * inferred from it, and it is then stored and never searched for again.
 */
export function anchorNear(
  resolved: ResolvedProject,
  atMm: Vec2,
  toleranceMm: number,
): MeasureRef | null {
  let best: { ref: MeasureRef; distance: number } | null = null;

  for (const part of resolved.parts) {
    for (const entry of part.features) {
      if (!entry.ok || !entry.feature.visible) continue;
      if (entry.anchors.length === 0) continue;

      const measure = PathOps.measure(entry.path);
      for (const [index, at] of entry.anchors.entries()) {
        // A missing anchor is not a place to point at.
        if (at === null) continue;

        const found = measure.locate(at);
        const point = SegmentOps.pointAt(entry.path.segments[found.segmentIndex]!, found.t);
        const distance = dist(point, atMm);
        if (distance > toleranceMm) continue;

        if (best === null || distance < best.distance) {
          best = {
            ref: { kind: 'anchor', featureId: entry.feature.id as FeatureId, anchor: index },
            distance,
          };
        }
      }
    }
  }

  return best?.ref ?? null;
}

/** Where an anchor is, for drawing the tool's feedback. */
export function anchorPointOf(resolved: ResolvedProject, ref: MeasureRef): Vec2 | null {
  for (const part of resolved.parts) {
    for (const entry of part.features) {
      if (!entry.ok || entry.feature.id !== ref.featureId) continue;
      const at = entry.anchors[ref.anchor];
      if (at === undefined || at === null) return null;
      const found = PathOps.measure(entry.path).locate(at);
      return SegmentOps.pointAt(entry.path.segments[found.segmentIndex]!, found.t);
    }
  }
  return null;
}
