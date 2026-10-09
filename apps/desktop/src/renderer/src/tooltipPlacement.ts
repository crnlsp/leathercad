/** How far a tooltip keeps from the window's edges (R-10). */
export const TOOLTIP_EDGE_PX = 8;

/** Between a control and its tooltip. */
export const TOOLTIP_GAP_PX = 4;

/**
 * Where a tooltip goes, in CSS pixels from the window's top left (R-10).
 *
 * Under its control and lined up with its left edge; turned above when there
 * is no room below and there is above; shifted across to stay 8 px inside the
 * window. Placed by the size it measured at — one line up to its widest, never
 * narrower — so it never sits where the window's edge would leave it less
 * width than that: the thin column of mockup 16, which came from laying the
 * tooltip out first and moving it after.
 */
export function placeTooltip(
  anchor: { readonly left: number; readonly top: number; readonly bottom: number },
  bubble: { readonly width: number; readonly height: number },
  view: { readonly width: number; readonly height: number },
): { left: number; top: number; above: boolean } {
  const left = Math.max(
    TOOLTIP_EDGE_PX,
    Math.min(anchor.left, view.width - TOOLTIP_EDGE_PX - bubble.width),
  );
  // A control scrolled half out of the top still has its tooltip inside.
  const below = Math.max(TOOLTIP_EDGE_PX, anchor.bottom + TOOLTIP_GAP_PX);
  const above = anchor.top - TOOLTIP_GAP_PX - bubble.height;
  const roomBelow = below + bubble.height <= view.height - TOOLTIP_EDGE_PX;
  if (!roomBelow && above >= TOOLTIP_EDGE_PX) {
    // A control in the window's last few pixels: above it, and still inside.
    return {
      left,
      top: Math.min(above, view.height - TOOLTIP_EDGE_PX - bubble.height),
      above: true,
    };
  }
  // Room on neither side, in a window too short for it: inside as far as it goes.
  const top = roomBelow
    ? below
    : Math.max(TOOLTIP_EDGE_PX, view.height - TOOLTIP_EDGE_PX - bubble.height);
  return { left, top, above: false };
}
