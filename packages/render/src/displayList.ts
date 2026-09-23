import type { Mm } from '@leathercad/core';
import { LAYER_ROLES, type LayerRole } from '@leathercad/domain';
import type { Path, Vec2 } from '@leathercad/geometry';
import { placedText, type PlacedText, type TextPlacement } from '@leathercad/typography';

import { CANVAS, ROLE_STYLES, alpha } from './theme/index.js';

export interface Stroke {
  readonly colour: string;
  /**
   * Width in **device pixels**, not millimetres.
   *
   * Screen strokes are constant on screen: a cut line stays legible at any
   * zoom. Export is the opposite — true millimetres, so a 0.25 mm line is
   * 0.25 mm on paper. See CLAUDE.md § Conventions.
   */
  readonly widthPx: number;
  /**
   * A document line's dash rhythm, in **millimetres** — the role table's, the
   * same array the exporter prints (F.4). Drawn true or solid by `screenDash`.
   */
  readonly dashMm?: readonly number[];
  /**
   * A dash in **device pixels**, for the tools' own feedback only — rubber
   * bands, selection boxes, diagnostic highlights. Screen chrome, never
   * printed, so it has no millimetre rhythm to keep. Wins over `dashMm`.
   */
  readonly dashPx?: readonly number[];
}

export type DisplayItem =
  | {
      readonly kind: 'path';
      readonly role: LayerRole;
      readonly path: Path;
      readonly stroke: Stroke;
    }
  | {
      readonly kind: 'dots';
      readonly role: LayerRole;
      readonly points: readonly Vec2[];
      /** Radius in device pixels — dots stay visible when zoomed out. */
      readonly radiusPx: number;
      readonly fill: string;
    }
  /**
   * Stitch holes as a pricking iron makes them (F.7): separate strokes, each a
   * slit's two ends in millimetres, drawn with butt caps so a slit is exactly
   * as long as it says.
   */
  | {
      readonly kind: 'slits';
      readonly role: LayerRole;
      readonly slits: readonly (readonly [Vec2, Vec2])[];
      readonly stroke: { readonly colour: string; readonly widthPx: number };
    }
  /**
   * A region between closed paths, filled even-odd: the seam allowance's band
   * between an edge and the stitching it grew from (F.7). Screen only.
   */
  | {
      readonly kind: 'fill';
      readonly role: LayerRole;
      readonly paths: readonly Path[];
      readonly colour: string;
    }
  /** A cut-out's inward hatch, clipped to its inside (§8.2, F.7). Screen only. */
  | {
      readonly kind: 'hatch';
      readonly role: LayerRole;
      readonly path: Path;
      readonly colour: string;
      /** Screen-constant, like a stroke width: a hatch is a texture, not a rhythm. */
      readonly spacingPx: number;
      readonly widthPx: number;
    }
  /** Which way a fold folds: V or Λ, upright, in screen pixels (F.7). */
  | {
      readonly kind: 'fold-tick';
      readonly role: LayerRole;
      readonly at: Vec2;
      readonly fold: 'valley' | 'mountain';
      readonly colour: string;
    }
  /**
   * That a line is derived: two rings at its midpoint, turned to its tangent,
   * in screen pixels (§8.3, F.7).
   */
  | {
      readonly kind: 'link-tick';
      readonly role: LayerRole;
      readonly at: Vec2;
      /** The line's direction here, in the world. */
      readonly tangent: Vec2;
      readonly colour: string;
    }
  /**
   * Text that can reach paper: a part caption, a dimension value.
   *
   * Sized in **millimetres** and laid out once by `typography`, so the canvas
   * and the exporters place the same glyphs in the same places (ADR 0011).
   */
  | {
      readonly kind: 'document-text';
      readonly role: LayerRole;
      readonly placed: PlacedText;
      readonly colour: string;
    }
  /**
   * Text that never leaves the screen: a rubber-band readout, a snap hint.
   *
   * Sized in **pixels**, because it is chrome rather than content — it should
   * stay the same size as the user zooms. A separate item kind, so an export
   * cannot be handed it by accident.
   */
  | {
      readonly kind: 'overlay-text';
      readonly role: LayerRole;
      readonly at: Vec2;
      readonly text: string;
      readonly sizePx: number;
      readonly colour: string;
      readonly align?: CanvasTextAlign;
      readonly baseline?: CanvasTextBaseline;
    }
  /**
   * Where something is wrong: a severity glyph with a short leader to its
   * evidence (UI Foundations §8.5, F.5). The source geometry draws as itself;
   * the failure is the marker. Screen-constant, like a dot: it stays findable
   * at any zoom.
   */
  | {
      readonly kind: 'marker';
      readonly role: LayerRole;
      /** The point on the evidence the leader starts from, in millimetres. */
      readonly at: Vec2;
      /** Filled triangle, hollow triangle, or dot — a shape, not only a hue. */
      readonly glyph: 'error' | 'warning' | 'info';
      readonly colour: string;
      /** A selected failed feature is haloed here, never on its source (§8.4). */
      readonly selected: boolean;
    };

/**
 * A flat, style-resolved scene in millimetres.
 *
 * Produced from a resolved document, consumed by the Canvas2D backend and
 * later by the SVG backend. Keeping one intermediate is what lets an
 * SVG-string snapshot stand in for "what does the canvas draw" — see
 * docs/testing.md §5.1.
 */
export interface DisplayList {
  readonly items: readonly DisplayItem[];
}

/**
 * The default screen appearance of each layer role — read from the one role
 * table, so the dash is the very array the exporter prints (UI Foundations §2).
 */
export const ROLE_STROKES: Readonly<Record<LayerRole, Stroke>> = Object.fromEntries(
  LAYER_ROLES.map((role) => {
    const { colour, widthPx, dashMm } = ROLE_STYLES[role];
    return [role, { colour, widthPx, dashMm }];
  }),
) as Record<LayerRole, Stroke>;

export function pathItem(role: LayerRole, path: Path, stroke?: Partial<Stroke>): DisplayItem {
  return { kind: 'path', role, path, stroke: { ...ROLE_STROKES[role], ...stroke } };
}

/**
 * Text in millimetres, laid out and placed in one step.
 *
 * `at` means whatever `placement` says it means — the left end of the
 * baseline by default, the centre of the run when centred.
 */
export function documentTextItem(
  role: LayerRole,
  at: Vec2,
  text: string,
  sizeMm: Mm,
  placement: TextPlacement = {},
  colour?: string,
): DisplayItem {
  return placedTextItem(role, placedText(text, sizeMm, at, placement), colour);
}

/**
 * Text that has already been laid out — a label, whose layout evaluation
 * produced and which nothing downstream may redo.
 */
export function placedTextItem(role: LayerRole, placed: PlacedText, colour?: string): DisplayItem {
  return {
    kind: 'document-text',
    role,
    placed,
    colour: colour ?? ROLE_STROKES[role].colour,
  };
}

export function dotsItem(
  role: LayerRole,
  points: readonly Vec2[],
  radiusPx = 2,
  fill?: string,
): DisplayItem {
  return { kind: 'dots', role, points, radiusPx, fill: fill ?? ROLE_STROKES[role].colour };
}

export function slitsItem(
  slits: readonly (readonly [Vec2, Vec2])[],
  widthPx: number,
  colour: string = ROLE_STROKES['stitch-holes'].colour,
): DisplayItem {
  return { kind: 'slits', role: 'stitch-holes', slits, stroke: { colour, widthPx } };
}

export function fillItem(role: LayerRole, paths: readonly Path[], colour: string): DisplayItem {
  return { kind: 'fill', role, paths, colour };
}

export function hatchItem(path: Path): DisplayItem {
  const { colour, spacingPx, widthPx } = CANVAS.hatch;
  return { kind: 'hatch', role: 'cut', path, colour, spacingPx, widthPx };
}

export function foldTickItem(at: Vec2, fold: 'valley' | 'mountain'): DisplayItem {
  return { kind: 'fold-tick', role: 'fold', at, fold, colour: ROLE_STROKES.fold.colour };
}

/** In the role's colour at the link tick's opacity: derived is a state, not a colour. */
export function linkTickItem(role: LayerRole, at: Vec2, tangent: Vec2): DisplayItem {
  const colour = alpha(ROLE_STROKES[role].colour, CANVAS.linkTick.opacity);
  return { kind: 'link-tick', role, at, tangent, colour };
}

export function markerItem(
  at: Vec2,
  glyph: 'error' | 'warning' | 'info',
  colour: string,
  selected = false,
): DisplayItem {
  return { kind: 'marker', role: 'construction', at, glyph, colour, selected };
}

export function textItem(
  role: LayerRole,
  at: Vec2,
  text: string,
  sizePx = 11,
  colour?: string,
): DisplayItem {
  return {
    kind: 'overlay-text',
    role,
    at,
    text,
    sizePx,
    colour: colour ?? ROLE_STROKES[role].colour,
  };
}

/** Millimetre bounds of everything in the list, or null when it is empty. */
export function displayListBounds(list: DisplayList): { min: Vec2; max: Vec2 } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let seen = false;

  const include = (p: Vec2): void => {
    seen = true;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };

  for (const item of list.items) {
    if (item.kind === 'path') {
      for (const segment of item.path.segments) {
        // Endpoints are enough for a fit-to-content estimate; exact bounds
        // live in the geometry package and cost more than this needs.
        include(segmentStart(segment));
        include(segmentEnd(segment));
      }
    } else if (item.kind === 'dots') {
      for (const point of item.points) include(point);
    } else if (item.kind === 'slits') {
      for (const [a, b] of item.slits) {
        include(a);
        include(b);
      }
    } else if (item.kind === 'fill' || item.kind === 'hatch') {
      for (const path of item.kind === 'fill' ? item.paths : [item.path]) {
        for (const segment of path.segments) {
          include(segmentStart(segment));
          include(segmentEnd(segment));
        }
      }
    } else if (item.kind === 'document-text') {
      // The baseline's two ends: enough for fit-to-content, and in
      // millimetres, unlike overlay text.
      include(item.placed.origin);
      include({
        x: item.placed.origin.x + item.placed.layout.widthMm,
        y: item.placed.origin.y + item.placed.layout.ascentMm,
      });
    } else {
      include(item.at);
    }
  }

  return seen ? { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } } : null;
}

function segmentStart(s: Path['segments'][number]): Vec2 {
  switch (s.kind) {
    case 'line':
      return s.a;
    case 'cubic':
      return s.p0;
    case 'arc':
      return {
        x: s.centre.x + Math.cos(s.startAngle) * s.radius,
        y: s.centre.y + Math.sin(s.startAngle) * s.radius,
      };
  }
}

function segmentEnd(s: Path['segments'][number]): Vec2 {
  switch (s.kind) {
    case 'line':
      return s.b;
    case 'cubic':
      return s.p3;
    case 'arc': {
      const end = s.startAngle + s.sweepAngle;
      return {
        x: s.centre.x + Math.cos(end) * s.radius,
        y: s.centre.y + Math.sin(end) * s.radius,
      };
    }
  }
}
