import type { Vec2 } from '@leathercad/geometry';

/** What a severity marker is drawn as, in screen pixels. */
export interface MarkerShape {
  /** From the evidence to the glyph. */
  readonly leader: readonly [Vec2, Vec2];
  readonly glyph:
    | {
        readonly kind: 'triangle';
        readonly points: readonly [Vec2, Vec2, Vec2];
        readonly filled: boolean;
      }
    | { readonly kind: 'dot'; readonly centre: Vec2; readonly radius: number };
  /** Where a selection halo goes: around the glyph, never on the source. */
  readonly halo: { readonly centre: Vec2; readonly radius: number };
}

/**
 * A severity marker's geometry (UI Foundations §8.5), shared by both screen
 * backends so the canvas and its SVG snapshot draw the same shapes.
 *
 * The glyph sits up and to the right of its evidence, off the line it points
 * at, on a short leader. Error is a filled triangle, warning a hollow one, info
 * a dot: a shape as well as a colour, which is what keeps the orange warning
 * apart from the red error in greyscale and for colour-blind readers (§5.4).
 */
export function markerShape(
  atPx: Vec2,
  glyph: 'error' | 'warning' | 'info',
  sizePx: number,
  leaderPx: number,
): MarkerShape {
  const centre = { x: atPx.x + leaderPx, y: atPx.y - leaderPx };
  const half = sizePx / 2;
  const halo = { centre, radius: sizePx };

  if (glyph === 'info') {
    return { leader: [atPx, centre], glyph: { kind: 'dot', centre, radius: half * 0.7 }, halo };
  }

  // An upward triangle whose base midpoint and apex straddle the centre.
  const height = sizePx * 0.9;
  return {
    leader: [atPx, centre],
    glyph: {
      kind: 'triangle',
      points: [
        { x: centre.x, y: centre.y - height / 2 },
        { x: centre.x + half, y: centre.y + height / 2 },
        { x: centre.x - half, y: centre.y + height / 2 },
      ],
      filled: glyph === 'error',
    },
    halo,
  };
}
