import { formatMm, formatNumber } from '@leathercad/core';
import { rectShape } from '@leathercad/document';
import { Shapes } from '@leathercad/geometry';
import { CANVAS, pathItem, textItem, type DisplayList } from '@leathercad/render';

import { createDrawCommit } from './commitDrawn.js';
import { isDrag } from './gesture.js';

import type { Tool, ToolContext } from '../tool.js';

/**
 * Draws a rectangle from one corner to the other — by dragging the diagonal,
 * or by clicking one corner and then the other. Every two-point tool takes
 * both (F.1): a maker told to drag a line got a rubber band and nothing, and
 * one who clicks a rectangle should not either.
 *
 * The state is an explicit discriminant, not a scatter of booleans — the one
 * convention that keeps canvas tools from rotting. `phase` says which press
 * the next pointer-up ends: the first (a drag, or the first click of two), or
 * the second click.
 */
type State =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'spanning';
      readonly phase: 'first-press' | 'placing' | 'second-press';
      readonly startMm: { x: number; y: number };
      readonly currentMm: { x: number; y: number };
    };

export function createRectangleTool(nextId: () => string): Tool {
  let state: State = { kind: 'idle' };

  /** Every draw tool commits through one of these, so no refusal is silent. */
  const draw = createDrawCommit();

  const reset = (ctx: ToolContext): void => {
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  return {
    id: 'rectangle',
    label: 'Rectangle',
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;
      if (state.kind === 'spanning' && state.phase === 'placing') {
        state = { ...state, phase: 'second-press' };
        return;
      }
      draw.begin();
      state = { kind: 'spanning', phase: 'first-press', startMm: event.at, currentMm: event.at };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'spanning') return;
      state = { ...state, currentMm: constrain(state.startMm, event.at, event.shiftKey) };
      ctx.invalidate();
    },

    onPointerUp(ctx, event) {
      if (state.kind !== 'spanning' || state.phase === 'placing') return;

      // A first press that never became a drag is the first of two clicks:
      // the corner is placed and the rectangle follows the pointer.
      if (state.phase === 'first-press' && !isDrag(ctx, state.startMm, event.at)) {
        state = { ...state, phase: 'placing' };
        ctx.invalidate();
        return;
      }

      // Read everything out of the state *before* resetting it. `reset`
      // reassigns the closure variable, and TypeScript keeps the narrowing
      // across that call because the assignment happens in another function —
      // so `state.startMm` afterwards compiles fine and is undefined at run
      // time.
      const startMm = state.startMm;
      const end = constrain(startMm, event.at, event.shiftKey);
      const width = end.x - startMm.x;
      const height = end.y - startMm.y;
      reset(ctx);

      // A second click on the first corner is not a rectangle. Creating a
      // zero-size part would leave something invisible in the parts list that
      // cannot be selected to delete.
      if (Math.abs(width) < 0.01 || Math.abs(height) < 0.01) return;

      const origin = { x: Math.min(startMm.x, end.x), y: Math.min(startMm.y, end.y) };

      draw.commit(ctx, nextId, 'Panel', {
        kind: 'shape',
        shape: rectShape(origin, Math.abs(width), Math.abs(height)),
      });
    },

    notice: (ctx) => draw.notice(ctx),

    onKey(ctx, event) {
      if (event.key === 'Escape') reset(ctx);
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'spanning') return { items: [] };

      const { startMm, currentMm } = state;
      const width = Math.abs(currentMm.x - startMm.x);
      const height = Math.abs(currentMm.y - startMm.y);
      const origin = {
        x: Math.min(startMm.x, currentMm.x),
        y: Math.min(startMm.y, currentMm.y),
      };

      return {
        items: [
          pathItem('construction', Shapes.rect(origin, width, height), {
            colour: CANVAS.overlay.preview,
            widthPx: 1,
            dashPx: [4, 3],
          }),
          // Live dimensions while dragging: this is a millimetre tool, so the
          // numbers matter more than the rubber band.
          textItem(
            'annotation',
            { x: origin.x, y: origin.y + height + 3 },
            `${formatNumber(width, 1)} × ${formatMm(height, 1)}`,
            12,
            CANVAS.overlay.preview,
          ),
        ],
      };
    },

    onDeactivate(ctx) {
      reset(ctx);
    },
  };
}

/** Shift constrains to a square, using the larger of the two extents. */
function constrain(
  start: { x: number; y: number },
  current: { x: number; y: number },
  square: boolean,
): { x: number; y: number } {
  if (!square) return current;

  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx) * size, y: start.y + Math.sign(dy) * size };
}
