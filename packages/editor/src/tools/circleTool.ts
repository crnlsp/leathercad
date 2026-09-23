import { formatMm } from '@leathercad/core';
import { circleShape } from '@leathercad/document';
import { Shapes, type Vec2 } from '@leathercad/geometry';
import { pathItem, textItem, type DisplayList } from '@leathercad/render';

import { createDrawCommit } from './commitDrawn.js';
import { isDrag } from './gesture.js';

import type { Tool, ToolContext } from '../tool.js';

/**
 * Draws a circle by dragging out from its centre.
 *
 * Centre-out rather than corner-to-corner like the rectangle: a hole, a rivet
 * and a strap end are all positioned by where their middle goes, and the
 * record stores a centre and a radius, so the gesture and the parameters agree.
 *
 * No Shift constraint. A circle is already uniform, so there is nothing for it
 * to hold square.
 *
 * A drag, or two clicks — the centre, then the rim — like every two-point
 * tool (F.1). `phase` says which press the next pointer-up ends.
 */
type State =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'spanning';
      readonly phase: 'first-press' | 'placing' | 'second-press';
      readonly centreMm: Vec2;
      readonly currentMm: Vec2;
    };

/** Below this a drag is a misclick, and a zero-radius part cannot be selected to delete. */
const MIN_RADIUS_MM = 0.01;

export function createCircleTool(nextId: () => string): Tool {
  let state: State = { kind: 'idle' };

  /** Every draw tool commits through one of these, so no refusal is silent. */
  const draw = createDrawCommit();

  const reset = (ctx: ToolContext): void => {
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  return {
    id: 'circle',
    label: 'Circle',
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;
      if (state.kind === 'spanning' && state.phase === 'placing') {
        state = { ...state, phase: 'second-press' };
        return;
      }
      draw.begin();
      state = { kind: 'spanning', phase: 'first-press', centreMm: event.at, currentMm: event.at };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'spanning') return;
      state = { ...state, currentMm: event.at };
      ctx.invalidate();
    },

    onPointerUp(ctx, event) {
      if (state.kind !== 'spanning' || state.phase === 'placing') return;

      // A first press that never became a drag places the centre; the rim is
      // the next click.
      if (state.phase === 'first-press' && !isDrag(ctx, state.centreMm, event.at)) {
        state = { ...state, phase: 'placing' };
        ctx.invalidate();
        return;
      }

      // Read the state out before resetting: `reset` reassigns the closure
      // variable, and the narrowing survives the call because the assignment
      // happens in another function.
      const centreMm = state.centreMm;
      const radius = distance(centreMm, event.at);
      reset(ctx);

      if (radius < MIN_RADIUS_MM) return;

      draw.commit(ctx, nextId, 'Panel', { kind: 'shape', shape: circleShape(centreMm, radius) });
    },

    notice: (ctx) => draw.notice(ctx),

    onKey(ctx, event) {
      if (event.key === 'Escape') reset(ctx);
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'spanning') return { items: [] };

      const { centreMm, currentMm } = state;
      const radius = distance(centreMm, currentMm);
      if (radius < MIN_RADIUS_MM) return { items: [] };

      return {
        items: [
          pathItem('construction', Shapes.circle(centreMm, radius), {
            colour: '#ffcc44',
            widthPx: 1,
            dashPx: [4, 3],
          }),
          // Diameter, not radius: it is the number on a punch, and it is what
          // the property panel will ask for once this is committed.
          textItem(
            'annotation',
            { x: centreMm.x, y: centreMm.y - radius - 3 },
            `⌀ ${formatMm(radius * 2, 1)}`,
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

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
