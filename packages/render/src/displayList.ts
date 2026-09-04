import type { LayerRole } from '@leathercad/domain';
import type { Path, Vec2 } from '@leathercad/geometry';

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
  /** Dash pattern in device pixels. */
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
  | {
      readonly kind: 'text';
      readonly role: LayerRole;
      readonly at: Vec2;
      readonly text: string;
      readonly sizePx: number;
      readonly colour: string;
      readonly align?: CanvasTextAlign;
      readonly baseline?: CanvasTextBaseline;
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

/** The default screen appearance of each layer role. */
export const ROLE_STROKES: Readonly<Record<LayerRole, Stroke>> = {
  cut: { colour: '#e8eaed', widthPx: 1.5 },
  stitch: { colour: '#5aa9ff', widthPx: 1, dashPx: [4, 3] },
  'stitch-holes': { colour: '#5aa9ff', widthPx: 1 },
  fold: { colour: '#5fd08a', widthPx: 1, dashPx: [7, 3, 2, 3] },
  mark: { colour: '#8b929b', widthPx: 1 },
  hardware: { colour: '#e0913a', widthPx: 1 },
  annotation: { colour: '#8b929b', widthPx: 1 },
  construction: { colour: '#3a4048', widthPx: 1 },
};

export function pathItem(role: LayerRole, path: Path, stroke?: Partial<Stroke>): DisplayItem {
  return { kind: 'path', role, path, stroke: { ...ROLE_STROKES[role], ...stroke } };
}

export function dotsItem(
  role: LayerRole,
  points: readonly Vec2[],
  radiusPx = 2,
  fill?: string,
): DisplayItem {
  return { kind: 'dots', role, points, radiusPx, fill: fill ?? ROLE_STROKES[role].colour };
}

export function textItem(
  role: LayerRole,
  at: Vec2,
  text: string,
  sizePx = 11,
  colour?: string,
): DisplayItem {
  return { kind: 'text', role, at, text, sizePx, colour: colour ?? ROLE_STROKES[role].colour };
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
