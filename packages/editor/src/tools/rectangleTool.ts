import { rectShape } from '@leathercad/document';
import { Shapes } from '@leathercad/geometry';
import { pathItem, textItem, type DisplayList } from '@leathercad/render';

import { createDrawCommit } from './commitDrawn.js';

import type { Tool, ToolContext } from '../tool.js';

/**
 * Draws a rectangle by dragging a diagonal.
 *
 * The state is an explicit discriminant, not a scatter of booleans — the one
 * convention that keeps canvas tools from rotting.
 */
type State =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
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
      draw.begin();
      state = { kind: 'dragging', startMm: event.at, currentMm: event.at };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'dragging') return;
      state = { ...state, currentMm: constrain(state.startMm, event.at, event.shiftKey) };
      ctx.invalidate();
    },

    onPointerUp(ctx, event) {
      if (state.kind !== 'dragging') return;

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

      // A click without a drag is not a rectangle. Creating a zero-size part
      // would leave something invisible in the parts list that cannot be
      // selected to delete.
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
      if (state.kind !== 'dragging') return { items: [] };

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
            colour: '#ffcc44',
            widthPx: 1,
            dashPx: [4, 3],
          }),
          // Live dimensions while dragging: this is a millimetre tool, so the
          // numbers matter more than the rubber band.
          textItem(
            'annotation',
            { x: origin.x, y: origin.y + height + 3 },
            `${width.toFixed(1)} × ${height.toFixed(1)} mm`,
            12,
            '#ffcc44',
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
