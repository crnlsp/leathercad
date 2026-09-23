import type { Diagnostic, Feature, FeatureId, ResolvedProject, Severity } from '@leathercad/domain';
import { PathOps, RectOps, type Path, type Rect } from '@leathercad/geometry';
import { placedText } from '@leathercad/typography';

import {
  CAPTION_GAP_MM,
  CAPTION_LINE_GAP_MM,
  CAPTION_SIZE_MM,
  STITCHING_CAPTION_SIZE_MM,
  describePart,
  describeStitching,
} from './captions.js';
import {
  ROLE_STROKES,
  dotsItem,
  fillItem,
  foldTickItem,
  hatchItem,
  linkTickItem,
  markerItem,
  pathItem,
  placedTextItem,
  slitsItem,
  type DisplayItem,
  type DisplayList,
} from './displayList.js';
import { foldTicksAlong, linkTickOn, slitsFor } from './leather.js';
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
   * (§9.3) and spaces the fold ticks. Absent means the working zoom — what a
   * test or an export of the screen wants.
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
  const zoom = options.pxPerMm ?? CANVAS.bands.workingPxPerMm;
  const overview = zoom < CANVAS.bands.overviewBelowPxPerMm;
  const items: DisplayItem[] = [];
  const hidden = new Set<FeatureId>();

  // What every feature resolved to, so a seam allowance can find the stitching
  // it grew from.
  const resolvedPaths = new Map<FeatureId, Path>();
  for (const part of resolved.parts) {
    for (const entry of part.features) {
      if (entry.ok) resolvedPaths.set(entry.feature.id, entry.path);
    }
  }

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
    // Bands and hatches: beneath every halo and line in the part, so nothing
    // drawn on top of a region is tinted by it.
    const beneath: DisplayItem[] = [];
    const partStart = items.length;

    for (const entry of part.features) {
      if (!entry.feature.visible) hidden.add(entry.feature.id);
      if (!entry.ok || !entry.feature.visible) continue;

      const box = PathOps.bbox(entry.path);
      if (box !== null) drawn.push(box);
      const id = entry.feature.id;
      const { feature } = entry;

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
        if (overview) {
          // Zoomed out, the holes stop being drawn and the set renders as its
          // stitch line, in stitch blue: still stitching, on the stitch line,
          // only less detailed (§9.3).
          items.push(
            pathItem(entry.role, entry.path, {
              colour: ROLE_STROKES.stitch.colour,
              dashMm: ROLE_STYLES.stitch.dashMm,
            }),
          );
        } else {
          // Each hole a slit, sized from the iron — the nominal pitch, not the
          // spacing achieved — and slanted as the iron cuts (F.7).
          const { source } = feature;
          const pitchMm =
            source.kind === 'derived' && source.op.type === 'stitch-holes'
              ? source.op.pitchMm
              : entry.holes.achievedPitchMm;
          const { slits, widthPx } = slitsFor(entry.holes.holes, pitchMm, zoom);
          items.push(slitsItem(slits, widthPx));
        }
        continue;
      }

      // A seam allowance is the material between the stitching and the edge
      // grown from it, so it is drawn as that band (F.7). Both are closed:
      // 4.9 refuses an allowance on an open line or a partial run.
      const stitching = allowanceSource(feature);
      const stitchPath = stitching === null ? undefined : resolvedPaths.get(stitching);
      if (stitchPath !== undefined && stitchPath.closed && entry.path.closed) {
        beneath.push(fillItem(entry.role, [entry.path, stitchPath], CANVAS.allowance));
      }
      // A cut-out is removal, not boundary: hatched inward (§8.2).
      if (feature.kind === 'cut-contour' && feature.role === 'inner' && entry.path.closed) {
        beneath.push(hatchItem(entry.path));
      }

      halo(id, entry.path);
      items.push(pathItem(entry.role, entry.path));

      // A fold says which way it folds, on the drawing itself (F.7).
      if (feature.kind === 'fold-line') {
        for (const at of foldTicksAlong(entry.path, zoom)) {
          items.push(foldTickItem(at, feature.direction));
        }
      }
      // Derived is a state, not a colour: the line keeps its role and wears a
      // link (§8.3).
      if (isLinked(feature)) {
        const tick = linkTickOn(entry.path);
        if (tick !== null) items.push(linkTickItem(entry.role, tick.at, tick.tangent));
      }
    }
    items.splice(partStart, 0, ...beneath);

    const bounds = RectOps.unionAll(drawn);
    if ((options.captions ?? true) && bounds !== null) items.push(...captionsFor(part, bounds));
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

/**
 * The caption above a part: its name, and under the name the iron (F.7).
 *
 * The name is document text in the words and size the printed sheet uses, in
 * the ground's quiet ink rather than a role's colour. The iron line is the
 * canvas caption of UI Foundations §13, smaller; the name sits a line higher to
 * make room for it. Paper keeps the name alone.
 */
function captionsFor(part: ResolvedProject['parts'][number], bounds: Rect): readonly DisplayItem[] {
  const base = { x: bounds.minX, y: bounds.maxY + CAPTION_GAP_MM };
  const stitching = describeStitching(part);
  const name = (y: number) =>
    placedTextItem(
      'annotation',
      placedText(describePart(part.part), CAPTION_SIZE_MM, { x: base.x, y }),
      CANVAS.caption,
    );
  if (stitching === null) return [name(base.y)];

  const iron = placedText(stitching, STITCHING_CAPTION_SIZE_MM, base);
  return [
    name(base.y + iron.layout.ascentMm + CAPTION_LINE_GAP_MM),
    placedTextItem('annotation', iron, CANVAS.caption),
  ];
}

/** The stitch line a seam allowance grew from: an edge offset outward from it. */
function allowanceSource(feature: Feature): FeatureId | null {
  const { source } = feature;
  return feature.kind === 'cut-contour' &&
    source.kind === 'derived' &&
    source.op.type === 'offset' &&
    source.op.side === 'outward'
    ? source.sourceId
    : null;
}

/**
 * Whether a line wears the link tick: built from another feature, and not a
 * hole set, which is always built from its stitch line and would say nothing
 * by wearing one. A frozen feature is drawn geometry now, and has no link.
 */
function isLinked(feature: Feature): boolean {
  return feature.source.kind === 'derived' && feature.kind !== 'stitch-hole-set';
}
