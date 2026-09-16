import { refusedTransforms, transformFeatures } from '@leathercad/document';
import type { Problem } from '@leathercad/domain';
import { MatOps, type Mat2x3, type Vec2 } from '@leathercad/geometry';
import { textItem, type DisplayList } from '@leathercad/render';

import type { Tool, ToolContext } from '../tool.js';
import { selectionPivot } from './selectionPivot.js';

/**
 * Resizes the selection about its own centre.
 *
 * Each axis follows the pointer independently, and **Shift holds the aspect
 * ratio** — the same meaning Shift carries everywhere else in this editor:
 * constrain. That ordering is deliberate rather than cosmetic. A circle cannot
 * survive an uneven scale, so a plain drag on one is refused and Shift is what
 * makes it work; the key that constrains is the key that keeps the shape a
 * shape, which is the rule this slice is teaching.
 */
type State =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'scaling';
      readonly pivot: Vec2;
      readonly from: Vec2;
      readonly factors: Vec2;
      readonly refusal: Problem | null;
    };

/** Below this the shape collapses, and a zero-size part cannot be selected to delete. */
const MIN_FACTOR = 1e-6;

export function createScaleTool(): Tool {
  let state: State = { kind: 'idle' };

  const reset = (ctx: ToolContext): void => {
    if (state.kind === 'scaling') ctx.store.rollback();
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  return {
    id: 'scale',
    label: 'Scale',
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;

      const { document, selection } = ctx.store.getState();
      const pivot = selectionPivot(document.project, selection.features);
      if (pivot === null) return;

      ctx.store.begin('Scale');
      state = {
        kind: 'scaling',
        pivot,
        from: event.at,
        factors: { x: 1, y: 1 },
        refusal: null,
      };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'scaling') return;

      const factors = factorsFor(state.pivot, state.from, event.at, event.shiftKey);
      if (factors === null) return;

      const matrix = scaleAbout(state.pivot, factors);
      const { document, selection } = ctx.store.getState();
      const refused = refusedTransforms(document.project, selection.features, matrix);

      state = { ...state, factors, refusal: refused[0]?.problem ?? null };
      ctx.store.preview(transformFeatures(selection.features, matrix, 'Scale'));
      ctx.invalidate();
    },

    onPointerUp(ctx) {
      if (state.kind !== 'scaling') return;
      ctx.store.commit();
      state = { kind: 'idle' };
      ctx.invalidate();
    },

    onKey(ctx, event) {
      if (event.key === 'Escape') reset(ctx);
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'scaling') return { items: [] };

      const { pivot, factors } = state;
      return {
        items: [
          textItem(
            'annotation',
            { x: pivot.x, y: pivot.y },
            `${factors.x.toFixed(2)} × ${factors.y.toFixed(2)}`,
            12,
            '#ffcc44',
          ),
        ],
      };
    },

    // Said during the drag, not after it: the user finds out why the circle is
    // not moving while they can still do something about it.
    notice() {
      return state.kind === 'scaling' ? state.refusal : null;
    },

    onDeactivate(ctx) {
      reset(ctx);
    },
  };
}

/**
 * How far the pointer has moved from the pivot, relative to where it started.
 *
 * Null when the grab began on the pivot itself, where there is no ratio to
 * take, or when the drag would collapse an axis.
 */
function factorsFor(pivot: Vec2, from: Vec2, to: Vec2, uniform: boolean): Vec2 | null {
  const startX = from.x - pivot.x;
  const startY = from.y - pivot.y;
  if (Math.abs(startX) < MIN_FACTOR && Math.abs(startY) < MIN_FACTOR) return null;

  const x = Math.abs(startX) < MIN_FACTOR ? 1 : (to.x - pivot.x) / startX;
  const y = Math.abs(startY) < MIN_FACTOR ? 1 : (to.y - pivot.y) / startY;

  if (Math.abs(x) < MIN_FACTOR || Math.abs(y) < MIN_FACTOR) return null;
  if (!uniform) return { x, y };

  // Shift: one factor for both axes, taken from whichever axis the pointer
  // actually moved along, so the gesture still feels like a drag.
  const dominant = Math.abs(startX) >= Math.abs(startY) ? x : y;
  return { x: dominant, y: dominant };
}

function scaleAbout(pivot: Vec2, factors: Vec2): Mat2x3 {
  return MatOps.composeAll(
    MatOps.fromTranslation({ x: -pivot.x, y: -pivot.y }),
    MatOps.fromScale(factors.x, factors.y),
    MatOps.fromTranslation(pivot),
  );
}
