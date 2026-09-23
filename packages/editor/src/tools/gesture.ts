import type { Vec2 } from '@leathercad/geometry';

import type { ToolContext } from '../tool.js';

/**
 * The distance a pointer must travel before a press becomes a drag.
 *
 * Without it, a click that wobbles by one pixel registers as a move and puts a
 * spurious entry in the undo history — or, in a draw tool, finishes a shape the
 * maker meant to start. One number for every tool, so a click means the same
 * thing wherever it lands.
 */
export const DRAG_THRESHOLD_PX = 3;

/** Whether the pointer travelled far enough between two points to be a drag. */
export function isDrag(ctx: ToolContext, from: Vec2, to: Vec2): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= ctx.viewport.pxToMm(DRAG_THRESHOLD_PX);
}
