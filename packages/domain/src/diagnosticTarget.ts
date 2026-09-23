import { PathOps, RectOps, type Rect } from '@leathercad/geometry';

import type { ResolvedPart, ResolvedProject } from './evaluate.js';
import type { FeatureId, PartId } from './feature.js';
import type { Diagnostic } from './problems/index.js';

/**
 * Margin left around the evidence, so a problem is never shown pressed against
 * the edge of the window with none of its surroundings.
 */
const EVIDENCE_MARGIN_MM = 5;

/**
 * The smallest window a problem is framed in.
 *
 * A single hole is a point, and a point has no size to zoom to: the viewport
 * would keep whatever scale it had and the click would look like it did
 * nothing. Twenty millimetres is about five stitch pitches — enough of the
 * surrounding work to see what the hole is too close to.
 */
export const MIN_FRAME_MM = 20;

/** Where to go when a diagnostic is clicked. */
export interface DiagnosticTarget {
  /**
   * The evidence, to frame. Null when the problem is about something with no
   * geometry at all — an empty part — because there is nothing true to show and
   * a rectangle at the origin would move the view somewhere arbitrary.
   */
  readonly bounds: Rect | null;
  /** The subject, to select. */
  readonly subject:
    | { readonly kind: 'feature'; readonly featureId: FeatureId }
    | { readonly kind: 'part'; readonly partId: PartId };
}

/**
 * What clicking a diagnostic goes to: **select the subject, frame the evidence.**
 *
 * The two are not always the same thing, and that is the point. A stitch line
 * that failed to inset has no geometry of its own; its diagnostic carries the
 * outline it was built *from*, which is both the only thing there is to show
 * and the thing that has to be edited to fix it. So the view goes to the
 * outline while the selection stays on the stitch line the maker clicked.
 *
 * Nothing is searched for. The target is computed from the diagnostic the panel
 * is already displaying, against the same `ResolvedProject` every surface
 * reads, so clicking one row twice always goes to the same place.
 */
export function diagnosticTarget(
  resolved: ResolvedProject,
  diagnostic: Diagnostic,
): DiagnosticTarget {
  const part = resolved.parts.find((p) => p.part.id === diagnostic.partId);

  const subject: DiagnosticTarget['subject'] =
    diagnostic.featureId === undefined
      ? { kind: 'part', partId: diagnostic.partId }
      : { kind: 'feature', featureId: diagnostic.featureId };

  return { bounds: framed(evidence(part, diagnostic)), subject };
}

/**
 * The geometry a diagnostic is about, in the order §3 of the slice design
 * fixes: its own location, then the feature it names, then the part. Never a
 * fourth guess.
 */
function evidence(part: ResolvedPart | undefined, diagnostic: Diagnostic): Rect | null {
  const { location } = diagnostic;
  if (location !== undefined) {
    return location.kind === 'points'
      ? RectOps.fromPoints(location.points)
      : PathOps.bbox(location.path);
  }

  if (part === undefined) return null;

  if (diagnostic.featureId !== undefined) {
    const entry = part.features.find((f) => f.feature.id === diagnostic.featureId);
    // A failed feature has no path. Widening to the part is not a guess about
    // where the problem is — it is the smallest thing that certainly contains
    // it.
    if (entry?.ok === true) return PathOps.bbox(entry.path);
  }

  return boundsOfPart(part);
}

/** Everything in a part that resolved, together. Null when nothing did. */
function boundsOfPart(part: ResolvedPart): Rect | null {
  const boxes: Rect[] = [];
  for (const entry of part.features) {
    if (!entry.ok) continue;
    const box = PathOps.bbox(entry.path);
    if (box !== null) boxes.push(box);
  }
  return RectOps.unionAll(boxes);
}

/** The evidence, given room and a floor on its size. */
function framed(bounds: Rect | null): Rect | null {
  if (bounds === null) return null;

  const withMargin = RectOps.expand(bounds, EVIDENCE_MARGIN_MM);
  // Zero whenever the evidence is already big enough, so this is the same
  // expression either way.
  const growX = Math.max(0, MIN_FRAME_MM - RectOps.width(withMargin)) / 2;
  const growY = Math.max(0, MIN_FRAME_MM - RectOps.height(withMargin)) / 2;

  return {
    minX: withMargin.minX - growX,
    minY: withMargin.minY - growY,
    maxX: withMargin.maxX + growX,
    maxY: withMargin.maxY + growY,
  };
}
