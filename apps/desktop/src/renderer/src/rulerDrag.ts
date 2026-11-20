import type { RulerStyle } from '@leathercad/render';

type Rulers = Pick<RulerStyle, 'thicknessPx' | 'leftThicknessPx'>;

/** A point on the board's canvas, in CSS pixels from its top-left corner. */
interface CssPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The angle of the guide a press starts, or null when it starts none (3.10,
 * U.24c): the top ruler gives a level guide, the left one an upright guide.
 *
 * The square where the two rulers meet belongs to neither, so a press there
 * is the active tool's, as on the board — a selection box begun in the
 * corner used to become a level guide (X7).
 */
export function guideFromRuler(at: CssPoint, rulers: Rulers): number | null {
  const onTop = at.y < rulers.thicknessPx;
  const onLeft = at.x < rulers.leftThicknessPx;
  if (onTop === onLeft) return null;
  return onTop ? 0 : Math.PI / 2;
}

/**
 * Whether a guide dragged from a ruler is kept where it is let go: only on
 * the board, past both rulers and inside the canvas. Let go over a ruler or
 * outside the window, the drag was taken back.
 */
export function guideLandsOnBoard(
  at: CssPoint,
  canvas: { readonly width: number; readonly height: number },
  rulers: Rulers,
): boolean {
  return (
    at.x >= rulers.leftThicknessPx &&
    at.y >= rulers.thicknessPx &&
    at.x <= canvas.width &&
    at.y <= canvas.height
  );
}
