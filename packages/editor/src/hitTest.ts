import {
  isOnMaterial,
  materialOf,
  projectToGuide,
  type FeatureId,
  type Guide,
  type PartId,
  type ResolvedFeature,
  type ResolvedPart,
  type ResolvedProject,
} from '@leathercad/domain';
import { PathOps, RectOps, dist, type Vec2 } from '@leathercad/geometry';

/** What a press takes: a line, a guide, or a whole piece by its body (3.13). */
export type Pick =
  | { readonly kind: 'feature'; readonly id: FeatureId }
  | { readonly kind: 'guide'; readonly guide: Guide }
  /** `outline` is the piece's outer contour: what the hover halos for it. */
  | { readonly kind: 'part'; readonly id: PartId; readonly outline: FeatureId };

interface PickOptions {
  /**
   * `locked` finds a locked feature too — for the right-click menu alone
   * (8.8), which is how a piece locked on the board is unlocked there. A click,
   * a drag and a snap still pass over it: the lock is what keeps it still.
   */
  readonly locked?: boolean;
}

/**
 * What a press at a point takes (smart-guides spec §3).
 *
 * A line within the pick radius first, anywhere on the board: that is how a
 * fold or a stitch line is edited. Then the nearest guide within it, so a guide
 * laid across a piece can still be dragged. Only then does the press ask whose
 * leather it is on, and take that piece whole — the topmost, as line hits
 * search. A cut-out is not leather, so a press in one takes nothing.
 */
export function pickAt(
  resolved: ResolvedProject,
  pointMm: Vec2,
  toleranceMm: number,
  options: PickOptions = {},
): Pick | null {
  const line = hitTest(resolved, pointMm, toleranceMm, options);
  if (line !== null) return { kind: 'feature', id: line };

  let guide: Guide | undefined;
  let closest = toleranceMm;
  for (const entry of resolved.project.guides ?? []) {
    const distance = dist(projectToGuide(entry, pointMm), pointMm);
    if (distance <= closest) {
      guide = entry;
      closest = distance;
    }
  }
  if (guide !== undefined) return { kind: 'guide', guide };

  for (let p = resolved.parts.length - 1; p >= 0; p--) {
    const part = resolved.parts[p]!;
    const outline = drawnOutline(part, options);
    if (outline === null) continue;
    const bounds = PathOps.bbox(outline.path);
    if (bounds === null || !RectOps.containsPoint(bounds, pointMm)) continue;
    // The domain's own containment, the one DR2 asks, so a click and the
    // validation can never disagree about where the leather is.
    if (isOnMaterial(materialOf(part), pointMm)) {
      return { kind: 'part', id: part.part.id, outline: outline.feature.id };
    }
  }
  return null;
}

/**
 * The outline `materialOf` measures the leather by, when the board draws it
 * and a click may take it: a hidden outline leaves nothing to click, and a
 * locked one keeps its piece still, as its line does.
 */
function drawnOutline(
  part: ResolvedPart,
  options: PickOptions,
): Extract<ResolvedFeature, { ok: true }> | null {
  const outline = part.features.find(
    (entry) => entry.ok && entry.feature.kind === 'cut-contour' && entry.feature.role === 'outer',
  );
  if (outline?.ok !== true || !outline.feature.visible || !outline.path.closed) return null;
  if (outline.feature.locked && options.locked !== true) return null;
  return outline;
}

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
  options: PickOptions = {},
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
