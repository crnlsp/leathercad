import { formatAngle } from '@leathercad/core';
import { refusedTransforms, transformFeatures } from '@leathercad/document';
import type { Problem } from '@leathercad/domain';
import { MatOps, type Vec2 } from '@leathercad/geometry';
import { textItem, type DisplayList } from '@leathercad/render';

import type { Tool, ToolContext } from '../tool.js';
import { ANGLE_STEP } from './angleConstraint.js';
import { selectionPivot } from './selectionPivot.js';

/**
 * Turns the selection about its own centre.
 *
 * The angle is the angle *swept by the pointer* around that centre, not the
 * angle to the pointer — so grabbing anywhere and dragging turns the shape by
 * how far you went round, which is what a physical hand does to a piece of
 * leather on a bench.
 *
 * A parametric shape turns through its parameters and stays parametric: a
 * rotated rectangle is still a rectangle whose width you can retype.
 */
type State =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'turning';
      readonly pivot: Vec2;
      readonly from: number;
      readonly angle: number;
      /** Why part of the selection is not turning, while it is not (X3). */
      readonly refusal: Problem | null;
    };

export function createRotateTool(): Tool {
  let state: State = { kind: 'idle' };

  const reset = (ctx: ToolContext): void => {
    if (state.kind === 'turning') ctx.store.rollback();
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  return {
    id: 'rotate',
    label: 'Rotate',
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;

      const { document, selection } = ctx.store.getState();
      const pivot = selectionPivot(document.project, selection.features);
      if (pivot === null) return;

      ctx.store.begin('Rotate');
      state = { kind: 'turning', pivot, from: angleFrom(pivot, event.at), angle: 0, refusal: null };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'turning') return;

      const swept = angleFrom(state.pivot, event.at) - state.from;
      const angle = event.shiftKey ? Math.round(swept / ANGLE_STEP) * ANGLE_STEP : swept;
      const matrix = MatOps.fromRotationAround(state.pivot, angle);
      const { document, selection } = ctx.store.getState();
      const refused = refusedTransforms(document.project, selection.features, matrix);
      state = { ...state, angle, refusal: refused[0]?.problem ?? null };

      ctx.store.preview(transformFeatures(selection.features, matrix, 'Rotate'));
      ctx.invalidate();
    },

    onPointerUp(ctx) {
      if (state.kind !== 'turning') return;
      ctx.store.commit();
      state = { kind: 'idle' };
      ctx.invalidate();
    },

    onKey(ctx, event) {
      if (event.key === 'Escape') reset(ctx);
    },

    notice() {
      return state.kind === 'turning' ? state.refusal : null;
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'turning') return { items: [] };

      return {
        items: [
          textItem(
            'annotation',
            { x: state.pivot.x, y: state.pivot.y },
            formatAngle((state.angle * 180) / Math.PI),
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

function angleFrom(pivot: Vec2, at: Vec2): number {
  return Math.atan2(at.y - pivot.y, at.x - pivot.x);
}
