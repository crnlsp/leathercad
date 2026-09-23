import type { Diagnostic, FeatureId, ResolvedProject, Severity } from '@leathercad/domain';
import { PathOps, RectOps, type Path, type Rect } from '@leathercad/geometry';

import { CAPTION_GAP_MM, CAPTION_SIZE_MM, describePart } from './captions.js';
import {
  ROLE_STROKES,
  documentTextItem,
  dotsItem,
  markerItem,
  pathItem,
  placedTextItem,
  type DisplayItem,
  type DisplayList,
} from './displayList.js';
import { CANVAS, ROLE_STYLES, STATE } from './theme/index.js';

export interface BuildOptions {
  /** Haloed beneath, never repainted (UI Foundations §8.4). */
  readonly selected?: ReadonlySet<FeatureId>;
  /** The feature under the pointer: a fainter halo than selection. */
  readonly hovered?: FeatureId | null;
  /**
   * What is wrong with the design, from `diagnose`.
   *
   * Anything with a location is marked on the canvas by a severity marker at
   * its evidence — including the geometry a **failed** feature was being built
   * from, which is what keeps a feature that cannot resolve from simply
   * vanishing (domain-model.md §4.4), without painting its healthy source red.
   */
  readonly diagnostics?: readonly Diagnostic[];
  /**
   * Name each part above it, as the printed sheet does. On by default: a part
   * is the thing the user is designing, and an unlabelled rectangle is not.
   */
  readonly captions?: boolean;
  /**
   * The zoom, in device pixels per millimetre, which picks the zoom band
   * (§9.3). Absent means the working band — what a test or an export of the
   * screen wants.
   */
  readonly pxPerMm?: number;
}

/** How a problem marks the drawing: the severity's value on the ground. */
export const DIAGNOSTIC_COLOURS: Readonly<Record<Severity, string>> = STATE.ground;

/**
 * Turns an evaluated project into something drawable.
 *
 * The one place a layer role becomes an appearance. Because the role is
 * decided by the domain, the user never picks a stroke style: a cut line is
 * solid because it is a cut line.
 */
export function buildDisplayList(
  resolved: ResolvedProject,
  options: BuildOptions = {},
): DisplayList {
  const selected = options.selected ?? new Set<FeatureId>();
  const overview = (options.pxPerMm ?? Infinity) < CANVAS.bands.overviewBelowPxPerMm;
  const items: DisplayItem[] = [];
  const hidden = new Set<FeatureId>();

  /**
   * A halo beneath a line: the accent, broad and translucent, laid down before
   * the line so the role colour and dash stay exactly as they are (§8.4).
   */
  const halo = (id: FeatureId, path: Path): void => {
    const colour = selected.has(id)
      ? CANVAS.halo.selected
      : options.hovered === id
        ? CANVAS.halo.hover
        : null;
    if (colour === null) return;
    items.push(
      pathItem('construction', path, { colour, widthPx: CANVAS.halo.widthPx, dashPx: [] }),
    );
  };

  for (const part of resolved.parts) {
    const drawn: Rect[] = [];

    for (const entry of part.features) {
      if (!entry.feature.visible) hidden.add(entry.feature.id);
      if (!entry.ok || !entry.feature.visible) continue;

      const box = PathOps.bbox(entry.path);
      if (box !== null) drawn.push(box);
      const id = entry.feature.id;

      // A label draws its words. The layout came from evaluation, so the
      // canvas and the printed sheet place the same glyphs in the same spots.
      if (entry.text !== undefined) {
        if (entry.feature.kind === 'measurement') {
          // A dimension halos its dimension line only: extension lines, arrows
          // and the number stay untouched (§8.4). The dimension line is the
          // middle of the three segments evaluation builds.
          const line = entry.path.segments[1];
          if (line !== undefined) halo(id, { closed: false, segments: [line] });
        } else {
          halo(id, entry.path);
        }
        items.push(placedTextItem(entry.role, entry.text));

        // A label's `path` is the box its words occupy, which is for selection
        // and bounds and must never be drawn. A **dimension** is the other
        // case: its path is the dimension line and its two extension lines,
        // and a number floating with no line under it says nothing about what
        // it measures.
        if (entry.feature.kind !== 'measurement') continue;
        items.push(pathItem(entry.role, entry.path));
        continue;
      }

      // A hole set is haloed along the line its holes are placed on — a halo
      // per hole is a cloud of blobs — and the holes stay as they are (§8.4).
      if (entry.holes !== undefined) {
        halo(id, entry.path);
        items.push(
          overview
            ? // Zoomed out, the holes stop being drawn and the set renders as
              // its stitch line, in stitch blue: still stitching, on the
              // stitch line, only less detailed (§9.3).
              pathItem(entry.role, entry.path, {
                colour: ROLE_STROKES.stitch.colour,
                dashMm: ROLE_STYLES.stitch.dashMm,
              })
            : dotsItem(
                entry.role,
                entry.holes.holes.map((hole) => hole.point),
              ),
        );
        continue;
      }

      halo(id, entry.path);
      items.push(pathItem(entry.role, entry.path));
    }

    // The caption is document text: the same words, size and position the
    // printed sheet uses, so the screen is a preview of the paper rather than
    // a different drawing — in the ground's quiet ink, not a role's colour.
    const bounds = RectOps.unionAll(drawn);
    if ((options.captions ?? true) && bounds !== null) {
      items.push(
        documentTextItem(
          'annotation',
          { x: bounds.minX, y: bounds.maxY + CAPTION_GAP_MM },
          describePart(part.part),
          CAPTION_SIZE_MM,
          {},
          CANVAS.caption,
        ),
      );
    }
  }

  // Markers last, so a problem is never drawn under the geometry it is about.
  // The evidence keeps its own look; the failure is the marker (§8.5).
  for (const diagnostic of options.diagnostics ?? []) {
    if (diagnostic.location === undefined) continue;
    if (diagnostic.featureId !== undefined && hidden.has(diagnostic.featureId)) continue;

    const colour = DIAGNOSTIC_COLOURS[diagnostic.severity];
    const isSelected = diagnostic.featureId !== undefined && selected.has(diagnostic.featureId);
    const { location } = diagnostic;
    if (location.kind === 'path') {
      const measure = PathOps.measure(location.path);
      items.push(
        markerItem(
          measure.pointAtDistance(measure.totalLength() / 2),
          diagnostic.severity,
          colour,
          isSelected,
        ),
      );
    } else if (location.points.length > 0) {
      // The points are the problem itself — the holes off the material, the
      // crossing — so they are shown, and the marker points at the first.
      items.push(dotsItem('construction', location.points, 3, colour));
      items.push(markerItem(location.points[0]!, diagnostic.severity, colour, isSelected));
    }
  }

  return { items };
}
