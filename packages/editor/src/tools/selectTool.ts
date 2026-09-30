import {
  deleteFeatures,
  deletePart,
  pieceScope,
  selectedFeatureIds,
  transformRefusal,
  translateFeatures,
} from '@leathercad/document';
import type { FeatureId } from '@leathercad/domain';
import { evaluate, type Problem } from '@leathercad/domain';
import { MatOps, RectOps, Shapes } from '@leathercad/geometry';
import { CANVAS, pathItem, type DisplayList } from '@leathercad/render';

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
      /** The selection, each piece in it made whole (Q30): what the drag moves. */
      readonly moving: readonly FeatureId[];
      /** Why the selection is not moving, while it is not (X3). */
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

      const { selection, document } = ctx.store.getState();
      if (event.shiftKey) {
        // Added to what is picked — a part picked by its heading included, as
        // the features it stands for, rather than dropped (Q29).
        const next = new Set(selectedFeatureIds(document.project, selection));
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
        const { document, selection } = ctx.store.getState();
        ctx.store.begin({ action: 'move' });
        // A piece's outline carries the piece (Q30), hidden features and all.
        const { features } = pieceScope(document.project, [...selection.features]);
        state = { kind: 'moving', startMm: state.startMm, moving: features, refusal: null };
      }

      if (state.kind === 'moving') {
        const delta = { x: event.at.x - state.startMm.x, y: event.at.y - state.startMm.y };
        const { document } = ctx.store.getState();

        // The same check the command makes, asked first so the user is told why
        // nothing moves: a stitch line dragged on its own, or a locked rivet in
        // the piece being dragged.
        state = {
          ...state,
          refusal: transformRefusal(document.project, state.moving, MatOps.fromTranslation(delta)),
        };

        ctx.store.preview(translateFeatures(state.moving, delta));
        ctx.invalidate();
      }
    },

    onPointerUp(ctx, event) {
      if (state.kind === 'band') {
        const band = RectOps.fromCorners(state.startMm, event.at);
        const found = featuresWithin(evaluate(ctx.store.getState().document.project), band);
        const { selection, document } = ctx.store.getState();
        const existing = event.shiftKey ? selectedFeatureIds(document.project, selection) : [];
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
        const { selection } = ctx.store.getState();
        // A part picked by its heading goes whole, as its menu's Delete part
        // does (Q29), not feature by feature into an empty part.
        const [partId] = selection.parts;
        if (partId !== undefined && selection.features.size === 0) {
          if (ctx.requestDeletePart !== undefined) {
            ctx.requestDeletePart(partId);
            return;
          }
          const before = ctx.store.getState().document;
          ctx.dispatch(deletePart(partId));
          if (ctx.store.getState().document !== before) ctx.store.clearSelection();
          return;
        }

        const selected = [...selection.features];
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
     * the instant it leaves it, and cannot be moved at all — and a piece
     * carried by its outline catches its own slot.
     */
    snapExclusions() {
      return state.kind === 'moving' ? state.moving : [];
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
            { colour: CANVAS.overlay.box, widthPx: 1, dashPx: [3, 3] },
          ),
        ],
      };
    },

    onDeactivate(ctx) {
      reset(ctx);
    },
  };
}
