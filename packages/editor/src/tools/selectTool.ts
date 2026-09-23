import { deleteFeatures, refusedTransforms, translateFeatures } from '@leathercad/document';
import { evaluate, type Problem } from '@leathercad/domain';
import { MatOps, RectOps, Shapes } from '@leathercad/geometry';
import { pathItem, type DisplayList } from '@leathercad/render';

import { featuresWithin, hitTest } from '../hitTest.js';
import type { Tool, ToolContext } from '../tool.js';
import { isDrag } from './gesture.js';

type State =
  | { readonly kind: 'idle' }
  /** Pressed on a feature; becomes a move once the pointer actually travels. */
  | { readonly kind: 'maybe-move'; readonly startMm: { x: number; y: number } }
  | {
      readonly kind: 'moving';
      readonly startMm: { x: number; y: number };
      /** Why part of the selection is not moving, while it is not (X3). */
      readonly refusal: Problem | null;
    }
  | {
      readonly kind: 'band';
      readonly startMm: { x: number; y: number };
      readonly currentMm: { x: number; y: number };
    };

export function createSelectTool(): Tool {
  let state: State = { kind: 'idle' };

  const reset = (ctx: ToolContext): void => {
    if (ctx.store.inTransaction) ctx.store.rollback();
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  return {
    id: 'select',
    label: 'Select',
    cursor: 'default',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;

      const resolved = evaluate(ctx.store.getState().document.project);
      const hit = hitTest(resolved, event.at, ctx.viewport.pickToleranceMm());

      if (hit === null) {
        if (!event.shiftKey) ctx.store.clearSelection();
        state = { kind: 'band', startMm: event.at, currentMm: event.at };
        ctx.invalidate();
        return;
      }

      const selection = ctx.store.getState().selection;
      if (event.shiftKey) {
        const next = new Set(selection.features);
        if (next.has(hit)) next.delete(hit);
        else next.add(hit);
        ctx.store.select(next);
      } else if (!selection.features.has(hit)) {
        ctx.store.select([hit]);
      }

      state = { kind: 'maybe-move', startMm: event.at };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind === 'band') {
        state = { ...state, currentMm: event.at };
        ctx.invalidate();
        return;
      }

      if (state.kind === 'maybe-move') {
        if (!isDrag(ctx, state.startMm, event.at)) return;
        ctx.store.begin('Move');
        state = { kind: 'moving', startMm: state.startMm, refusal: null };
      }

      if (state.kind === 'moving') {
        const delta = { x: event.at.x - state.startMm.x, y: event.at.y - state.startMm.y };
        const { document, selection } = ctx.store.getState();

        // The same check the command makes, asked first so the user is told why
        // a stitch line dragged on its own stays where it is.
        const refused = refusedTransforms(
          document.project,
          selection.features,
          MatOps.fromTranslation(delta),
        );
        state = { ...state, refusal: refused[0]?.problem ?? null };

        ctx.store.preview(translateFeatures(selection.features, delta));
        ctx.invalidate();
      }
    },

    onPointerUp(ctx, event) {
      if (state.kind === 'band') {
        const band = RectOps.fromCorners(state.startMm, event.at);
        const found = featuresWithin(evaluate(ctx.store.getState().document.project), band);
        const existing = event.shiftKey ? [...ctx.store.getState().selection.features] : [];
        ctx.store.select([...existing, ...found]);
      } else if (state.kind === 'moving') {
        ctx.store.commit();
      }

      state = { kind: 'idle' };
      ctx.invalidate();
    },

    onKey(ctx, event) {
      if (event.key === 'Escape') {
        reset(ctx);
        ctx.store.clearSelection();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = [...ctx.store.getState().selection.features];
        if (selected.length === 0) return;

        if (ctx.requestDelete !== undefined) {
          ctx.requestDelete(selected);
          return;
        }

        // Without an app to ask, a delete with dependents is refused. Keep the
        // selection in that case: nothing was deleted, so nothing should vanish.
        const before = ctx.store.getState().document;
        ctx.dispatch(deleteFeatures(selected));
        if (ctx.store.getState().document !== before) ctx.store.clearSelection();
      }
    },

    /**
     * While a move is in progress, the moving features snap to everything
     * except themselves. Without this a dragged panel catches its own corner
     * the instant it leaves it, and cannot be moved at all.
     */
    snapExclusions(ctx) {
      if (state.kind !== 'moving') return [];
      return [...ctx.store.getState().selection.features];
    },

    notice() {
      return state.kind === 'moving' ? state.refusal : null;
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'band') return { items: [] };

      const band = RectOps.fromCorners(state.startMm, state.currentMm);
      return {
        items: [
          pathItem(
            'construction',
            Shapes.rect({ x: band.minX, y: band.minY }, RectOps.width(band), RectOps.height(band)),
            { colour: '#7f8794', widthPx: 1, dashPx: [3, 3] },
          ),
        ],
      };
    },

    onDeactivate(ctx) {
      reset(ctx);
    },
  };
}
