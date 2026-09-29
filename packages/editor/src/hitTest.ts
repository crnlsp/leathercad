import type { FeatureId, ResolvedProject } from '@leathercad/domain';
import { PathOps, RectOps, type Vec2 } from '@leathercad/geometry';

/**
 * Which feature is under a point.
 *
 * **Every comparison happens in millimetres.** The caller converts its pixel
 * pick radius to a millimetre tolerance through the viewport first. Testing in
 * screen space instead would make results depend on zoom in a way no unit test
 * could pin down. See CLAUDE.md invariant 1.
 */
export function hitTest(
  resolved: ResolvedProject,
  pointMm: Vec2,
  toleranceMm: number,
  /**
   * `locked` finds a locked feature too — for the right-click menu alone
   * (8.8), which is how a piece locked on the board is unlocked there. A click,
   * a drag and a snap still pass over it: the lock is what keeps it still.
   */
  options: { readonly locked?: boolean } = {},
): FeatureId | null {
  // Later features sit on top, so search backwards and take the first match.
  for (let p = resolved.parts.length - 1; p >= 0; p--) {
    const part = resolved.parts[p]!;
    for (let f = part.features.length - 1; f >= 0; f--) {
      const entry = part.features[f]!;
      if (!entry.ok || !entry.feature.visible) continue;
      if (entry.feature.locked && options.locked !== true) continue;

      // Cheap rejection first: most features are nowhere near the cursor.
      const bounds = PathOps.bbox(entry.path);
      if (bounds === null) continue;
      if (!RectOps.containsPoint(RectOps.expand(bounds, toleranceMm), pointMm)) continue;

      if (PathOps.isPointOnPath(entry.path, pointMm, toleranceMm)) return entry.feature.id;
    }
  }
  return null;
}

/** Every feature whose bounds fall entirely inside a rubber band. */
export function featuresWithin(resolved: ResolvedProject, band: RectOps.Rect): FeatureId[] {
  const found: FeatureId[] = [];
  for (const part of resolved.parts) {
    for (const entry of part.features) {
      if (!entry.ok || !entry.feature.visible || entry.feature.locked) continue;
      const bounds = PathOps.bbox(entry.path);
      if (bounds !== null && RectOps.containsRect(band, bounds)) found.push(entry.feature.id);
    }
  }
  return found;
}
