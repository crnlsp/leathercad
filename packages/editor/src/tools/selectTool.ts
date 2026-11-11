import {
  deleteFeatures,
  deletePart,
  isEmptySelection,
  pieceScope,
  selectedFeatureIds,
  transformRefusal,
  translateFeatures,
  setGuide,
  deleteGuide,
} from '@leathercad/document';
import type { FeatureId } from '@leathercad/domain';
import { evaluate, type Guide, type PartId, type Problem } from '@leathercad/domain';
import { MatOps, RectOps, Shapes, type Vec2 } from '@leathercad/geometry';
import { CANVAS, pathItem, type DisplayList } from '@leathercad/render';

import { featuresWithin, pickAt } from '../hitTest.js';
import { means, type Tool, type ToolContext } from '../tool.js';
import { isDrag } from './gesture.js';

type State =
  | { readonly kind: 'guide'; readonly guide: Guide; readonly startMm: Vec2 }
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
      const pick = pickAt(resolved, event.at, ctx.viewport.pickToleranceMm());

      if (pick?.kind === 'guide') {
        ctx.store.selectGuide(pick.guide.id);
        ctx.store.begin({ action: 'edit-guide' });
        state = { kind: 'guide', guide: pick.guide, startMm: event.at };
        ctx.invalidate();
        return;
      }
      if (pick === null) {
        if (!event.shiftKey) ctx.store.clearSelection();
        state = { kind: 'band', startMm: event.at, currentMm: event.at };
        ctx.invalidate();
        return;
      }

      const { selection, document } = ctx.store.getState();
      if (pick.kind === 'part') {
        pickPiece(ctx, pick.id, pick.outline, event.shiftKey);
      } else if (event.shiftKey) {
        // Added to what is picked — a part picked by its heading included, as
        // the features it stands for, rather than dropped (Q29).
        const next = new Set(selectedFeatureIds(document.project, selection));
        if (next.has(pick.id)) next.delete(pick.id);
        else next.add(pick.id);
        ctx.store.select(next);
      } else if (!selection.features.has(pick.id)) {
        ctx.store.select([pick.id]);
      }

      state = { kind: 'maybe-move', startMm: event.at };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind === 'guide') {
        if (!ctx.store.inTransaction) {
          state = { kind: 'idle' };
          return;
        }
        ctx.store.preview(
          setGuide({
            ...state.guide,
            origin: {
              x: state.guide.origin.x + event.at.x - state.startMm.x,
              y: state.guide.origin.y + event.at.y - state.startMm.y,
            },
          }),
        );
        ctx.invalidate();
        return;
      }
      if (state.kind === 'band') {
        state = { ...state, currentMm: event.at };
        ctx.invalidate();
        return;
      }

      if (state.kind === 'maybe-move') {
        if (!isDrag(ctx, state.startMm, event.at)) return;
        const { document, selection } = ctx.store.getState();
        ctx.store.begin({ action: 'move' });
        // A piece's outline carries the piece (Q30), hidden features and all —
        // and a piece picked by its body or its heading is its features (3.13).
        const { features } = pieceScope(
          document.project,
          selectedFeatureIds(document.project, selection),
        );
        state = { kind: 'moving', startMm: state.startMm, moving: features, refusal: null };
      }

      // Undo, or a command, cancelled the move under the pointer.
      if (state.kind === 'moving' && !ctx.store.inTransaction) {
        state = { kind: 'idle' };
        ctx.invalidate();
        return;
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
      } else if (state.kind === 'moving' || state.kind === 'guide') {
        ctx.store.commit();
      }

      state = { kind: 'idle' };
      ctx.invalidate();
    },

    onKey(ctx, event) {
      if (event.key === 'Escape') {
        // Claimed only when there was something to let go of (U.5): a drag,
        // or a selection.
        const busy = state.kind !== 'idle' || !isEmptySelection(ctx.store.getState().selection);
        reset(ctx);
        ctx.store.clearSelection();
        return busy;
      }

      // Claimed whenever it acts (U.12): the key is this delete's, and no
      // command the maker gave the same key runs as well.
      if (means(event, 'delete')) {
        const { selection } = ctx.store.getState();
        if (selection.guide !== undefined) {
          ctx.dispatch(deleteGuide(selection.guide));
          return true;
        }
        // A part picked by its heading goes whole, as its menu's Delete part
        // does (Q29), not feature by feature into an empty part.
        const [partId] = selection.parts;
        if (partId !== undefined && selection.features.size === 0) {
          if (ctx.requestDeletePart !== undefined) {
            ctx.requestDeletePart(partId);
            return true;
          }
          const before = ctx.store.getState().document;
          ctx.dispatch(deletePart(partId));
          if (ctx.store.getState().document !== before) ctx.store.clearSelection();
          return true;
        }

        const selected = [...selection.features];
        if (selected.length === 0) return false;

        if (ctx.requestDelete !== undefined) {
          ctx.requestDelete(selected);
          return true;
        }

        // Without an app to ask, a delete with dependents is refused. Keep the
        // selection in that case: nothing was deleted, so nothing should vanish.
        const before = ctx.store.getState().document;
        ctx.dispatch(deleteFeatures(selected));
        if (ctx.store.getState().document !== before) ctx.store.clearSelection();
        return true;
      }
      return false;
    },

    /**
     * While a move is in progress, the moving features snap to everything
     * except themselves. Without this a dragged panel catches its own corner
     * the instant it leaves it, and cannot be moved at all — and a piece
     * carried by its outline catches its own slot.
     */
    snapExclusions() {
      return state.kind === 'guide'
        ? [state.guide.id]
        : state.kind === 'moving'
          ? state.moving
          : [];
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

/**
 * A press on a piece's body (3.13). Alone, it picks the piece as its heading in
 * Parts does — unless what is picked already holds the piece, which the press
 * then drags as it is. With Shift, the piece's features join what is picked or,
 * when all of them already are, leave it: Shift toggles, as on a line.
 */
function pickPiece(ctx: ToolContext, partId: PartId, outline: FeatureId, shift: boolean): void {
  const { selection, document } = ctx.store.getState();
  if (!shift) {
    if (!selection.parts.has(partId) && !selection.features.has(outline)) {
      ctx.store.selectParts([partId]);
    }
    return;
  }
  const part = document.project.parts.find((candidate) => candidate.id === partId);
  const own = part?.features.map((feature) => feature.id) ?? [];
  const next = new Set(selectedFeatureIds(document.project, selection));
  if (own.every((id) => next.has(id))) for (const id of own) next.delete(id);
  else for (const id of own) next.add(id);
  ctx.store.select(next);
}
