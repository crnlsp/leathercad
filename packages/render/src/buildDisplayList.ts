import type {
  Diagnostic,
  Feature,
  FeatureId,
  ResolvedPart,
  ResolvedProject,
  Severity,
} from '@leathercad/domain';
import {
  MatOps,
  PathOps,
  RectOps,
  SegmentOps,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';
import { FONT, layoutText } from '@leathercad/typography';

import {
  ROLE_STROKES,
  boardTextItem,
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
import { CANVAS, GROUND, ROLE_STYLES, STATE } from './theme/index.js';
import { TRUE_SIZE_CSS_PX_PER_MM, cssPxPerMm, visibleBoundsMm, type ViewportView } from './view.js';

/** What a piece is called on the board: its name, and the detail under it (R-01). */
export interface Caption {
  /** "Card pocket ×2". */
  readonly name: string;
  /** "52 holes · 3.85 mm"; null with nothing to add. */
  readonly detail: string | null;
}

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
   * The words of each piece's caption, which the app supplies: a caption on the
   * board is the interface's, and this package holds no sentence for it (R-01,
   * ADR 0018). Absent, no piece is captioned.
   */
  readonly caption?: (part: ResolvedPart) => Caption;
  /**
   * The camera. With it, a caption whose piece's top is off the canvas pins to
   * the canvas's top-left (R-01), and the zoom is read from it.
   */
  readonly view?: ViewportView;
  /**
   * The zoom, in CSS pixels per millimetre (`cssPxPerMm`), which picks the
   * zoom band (§9.3), spaces the fold ticks and turns the board's words'
   * pixels into millimetres. Absent, the camera's; with no camera, the working
   * zoom — what a test or an export of the screen wants.
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
  const zoom =
    options.pxPerMm ??
    (options.view === undefined ? CANVAS.bands.workingPxPerMm : cssPxPerMm(options.view));
  const overview = zoom < CANVAS.bands.overviewBelowPxPerMm;
  const words = boardWords(zoom, options.view);
  const items: DisplayItem[] = [];
  /**
   * The pieces themselves (R-02), beneath everything on the board, so one
   * piece laid over another never hides its lines.
   */
  const pieces: DisplayItem[] = [];
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
    // The leather: the outline, and the cut-outs it is left open at.
    let outline: Path | null = null;
    const cutOuts: Path[] = [];

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
        // A label's `path` is the box its words occupy, which is for selection
        // and bounds and must never be drawn. A **dimension** is the other
        // case: its path is the dimension line and its two extension lines,
        // and a number floating with no line under it says nothing about what
        // it measures.
        if (entry.feature.kind !== 'measurement') {
          items.push(placedTextItem(entry.role, entry.text));
          continue;
        }
        items.push(pathItem(entry.role, entry.path));
        // Its number is the board's own: the same size at every zoom, centred
        // on the line (R-01). Paper sets the glyphs evaluation laid out.
        const dimensionLine = entry.path.segments[1];
        if (dimensionLine !== undefined) {
          const number = words.value(
            SegmentOps.pointAt(dimensionLine, 0.5),
            entry.text.layout.text,
            entry.text.rotationRad,
            ROLE_STROKES[entry.role].colour,
          );
          items.push(number.item);
          // It counts towards the part's extent, as it does on paper: the
          // caption goes above it.
          drawn.push(number.box);
        }
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
        cutOuts.push(entry.path);
      }
      // A part has one outline (S5); were a file to hold two, the first is
      // the leather, as `materialOf` reads it.
      if (feature.kind === 'cut-contour' && feature.role === 'outer' && entry.path.closed) {
        outline ??= entry.path;
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

    // Filled even-odd, so a cut-out shows the ground through it as a hole in
    // the leather does. The one being worked on — anything in it selected,
    // which a part picked by its heading is — is warmer.
    if (outline !== null) {
      const worked = part.features.some((entry) => selected.has(entry.feature.id));
      pieces.push(
        fillItem(
          'cut',
          [outline, ...cutOuts],
          worked ? GROUND.pieceFillSelected : GROUND.pieceFill,
        ),
      );
    }

    const bounds = RectOps.unionAll(drawn);
    if (options.caption !== undefined && bounds !== null) {
      items.push(...words.caption(options.caption(part), bounds));
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

  return { items: [...pieces, ...items] };
}

/**
 * The board's own words (R-01), placed at this zoom: each is a constant size on
 * screen, so where it sits in millimetres, and the room it takes, depends on
 * the zoom. Where a caption's or a value's pixels become millimetres.
 */
function boardWords(zoom: number, view: ViewportView | undefined) {
  const { text, caption: spacing } = CANVAS;
  const mm = (px: number): number => px / zoom;
  // A 12/16 line's baseline, up from the line's bottom: the half-leading and
  // the typeface's descent — 3.5 px for Plex Sans.
  const em = (FONT.ascender - FONT.descender) / FONT.unitsPerEm;
  const below = (voice: { sizePx: number; lineHeightPx: number }): number =>
    (voice.lineHeightPx - em * voice.sizePx) / 2 -
    (FONT.descender / FONT.unitsPerEm) * voice.sizePx;
  const detailed = (zoom / TRUE_SIZE_CSS_PX_PER_MM) * 100 >= spacing.detailFromPercent;
  // The canvas the drawing is seen through: inside the rulers.
  const visible = view === undefined ? null : visibleBoundsMm(view);
  const area: Rect | null =
    visible === null
      ? null
      : {
          ...visible,
          minX: visible.minX + mm(CANVAS.ruler.leftThicknessPx),
          maxY: visible.maxY - mm(CANVAS.ruler.thicknessPx),
        };
  // How far down from the canvas's top the pinned captions reach, in CSS px.
  let pinnedPx = 0;

  return {
    /**
     * A dimension's value, centred on its line's middle and turned along it,
     * its baseline half a capital below the line so the figures sit on the
     * line. With the room it takes, halo and all, for the caption to clear.
     */
    value(middle: Vec2, words: string, rotationRad: number, colour: string) {
      const voice = text.value;
      const capital = (FONT.capHeight / FONT.unitsPerEm) * voice.sizePx;
      const turn = MatOps.fromRotationAround(middle, rotationRad);
      const halfWidth = layoutText(words, mm(voice.sizePx)).widthMm / 2 + mm(text.haloPx);
      const box = RectOps.transform(
        {
          minX: middle.x - halfWidth,
          maxX: middle.x + halfWidth,
          minY: middle.y - mm(capital / 2 + below(voice) + text.haloPx),
          maxY: middle.y + mm(voice.lineHeightPx - below(voice) - capital / 2 + text.haloPx),
        },
        turn,
      );
      const at = MatOps.apply(turn, { x: middle.x, y: middle.y - mm(capital / 2) });
      const item = boardTextItem(at, words, voice, colour, { align: 'center', rotationRad });
      return { item, box };
    },

    /**
     * A piece's caption: its name over its detail, left-aligned above the
     * piece — the name alone below 40 %. Once it would run under the ruler —
     * the piece's top off the canvas, or so near it that the name would hide —
     * while the piece is still on the canvas, pinned to the canvas's top-left,
     * under any caption pinned there already.
     */
    caption(caption: Caption, bounds: Rect): DisplayItem[] {
      const lines: [string, typeof text.name | typeof text.meta, string][] = [
        [caption.name, text.name, GROUND.ink],
      ];
      if (caption.detail !== null && detailed) {
        lines.push([caption.detail, text.meta, GROUND.label]);
      }
      const line = text.name.lineHeightPx;

      // The first line's baseline, and the left edge of both.
      let x = bounds.minX;
      let first = bounds.maxY + mm(spacing.gapPx + below(text.name) + (lines.length - 1) * line);
      // Pinned once the caption would run under the ruler — the piece's top
      // off the canvas, or so near its top that the name would be hidden —
      // while the piece is still on the canvas.
      const top = bounds.maxY + mm(spacing.gapPx + lines.length * line);
      if (area !== null && top > area.maxY && RectOps.intersects(bounds, area)) {
        x = area.minX + mm(spacing.insetPx);
        first = area.maxY - mm(pinnedPx + spacing.insetPx + line - below(text.name));
        pinnedPx += lines.length * line + spacing.gapPx;
      }
      return lines.map(([words, voice, colour], index) =>
        boardTextItem({ x, y: first - mm(index * line) }, words, voice, colour),
      );
    },
  };
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
