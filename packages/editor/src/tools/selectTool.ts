import {
  deleteFeatures,
  deletePart,
  isEmptySelection,
  pieceScope,
  selectedFeatureIds,
  selectionBox,
  transformRefusal,
  translateFeatures,
  setGuide,
  deleteGuide,
} from '@leathercad/document';
import type { FeatureId } from '@leathercad/domain';
import { evaluate, type Guide, type PartId, type Problem, type Project } from '@leathercad/domain';
import { MatOps, RectOps, Shapes, type Rect, type Vec2 } from '@leathercad/geometry';
import { CANVAS, cssPxPerMm, pathItem, type DisplayList } from '@leathercad/render';

import { alignMove, alignmentOverlay, collectAlignTargets, type AlignTargets } from '../align.js';
import { featuresWithin, pickAt } from '../hitTest.js';
import type { SnapCandidate, Snapped } from '../snap.js';
import { means, type Tool, type ToolContext } from '../tool.js';
import { isDrag } from './gesture.js';

type State =
  | { readonly kind: 'guide'; readonly guide: Guide; readonly startMm: Vec2 }
  | { readonly kind: 'idle' }
  /** Pressed on a feature; becomes a move once the pointer actually travels. */
  | ({ readonly kind: 'maybe-move' } & Grab)
  | ({
      readonly kind: 'moving';
      /** Why the selection is not moving, while it is not (X3). */
      readonly refusal: Problem | null;
      /** The extent being moved and what it lines up with; null unless whole pieces move (3.16). */
      readonly guides: { readonly box: Rect; readonly targets: AlignTargets } | null;
      /** What the last move lined up, held by the next (hysteresis). */
      readonly aligned: Snapped | null;
      readonly delta: Vec2;
    } & Grab)
  | {
      readonly kind: 'band';
      readonly startMm: { x: number; y: number };
      readonly currentMm: { x: number; y: number };
    };

/** What a press took hold of, from the press to the release. */
interface Grab {
  readonly startMm: Vec2;
  /** The selection, each piece in it made whole (Q30): what the drag moves. */
  readonly moving: readonly FeatureId[];
  /**
   * Whether the press caught a fixed point of what moves — a corner, a
   * midpoint, a centre. Only then does a point the cursor catches move that
   * point onto it, winning both axes (smart-guides spec §6); a piece grabbed
   * anywhere else has no point of its own to put there, and lines up by its
   * extent alone (3.16).
   */
  readonly byPoint: boolean;
}

/** The kinds that name one point of a feature, rather than wherever the cursor is along it. */
const FIXED: ReadonlySet<SnapCandidate['kind']> = new Set([
  'endpoint',
  'midpoint',
  'centre',
  'intersection',
]);

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

      // What moves is known at the press, so the moves before the drag
      // begins already skip its own geometry when they snap.
      const after = ctx.store.getState();
      const { features } = pieceScope(
        after.document.project,
        selectedFeatureIds(after.document.project, after.selection),
      );
      const caught = event.snap;
      const byPoint =
        caught !== undefined &&
        FIXED.has(caught.kind) &&
        [caught.featureId, caught.otherFeatureId].some(
          (id) => id !== undefined && features.includes(id),
        );
      state = { kind: 'maybe-move', startMm: event.at, moving: features, byPoint };
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
        ctx.store.begin({ action: 'move' });
        // A piece's outline carries the piece (Q30), hidden features and all —
        // and a piece picked by its body or its heading is its features (3.13).
        // Its targets come from the document as it was, once: nothing else
        // moves during a move.
        const project = ctx.store.committedDocument.project;
        state = {
          ...state,
          kind: 'moving',
          refusal: null,
          guides: guidesFor(project, state.moving),
          aligned: null,
          delta: { x: 0, y: 0 },
        };
      }

      // Undo, or a command, cancelled the move under the pointer.
      if (state.kind === 'moving' && !ctx.store.inTransaction) {
        state = { kind: 'idle' };
        ctx.invalidate();
        return;
      }

      if (state.kind === 'moving') {
        const raw = { x: event.at.x - state.startMm.x, y: event.at.y - state.startMm.y };
        // A point caught by a grabbed corner wins both axes; Ctrl suspends
        // every guide, as it does every snap.
        const pointCaught = state.byPoint && event.snap !== undefined;
        const alignment =
          state.guides === null || pointCaught || event.ctrlKey
            ? null
            : alignMove(state.guides.box, raw, state.guides.targets, state.aligned, {
                toleranceMm: ctx.viewport.pickToleranceMm(),
                smartGuides: ctx.smartGuides?.() ?? true,
              });
        const delta = alignment?.delta ?? raw;
        const { document } = ctx.store.getState();

        // The same check the command makes, asked first so the user is told why
        // nothing moves: a stitch line dragged on its own, or a locked rivet in
        // the piece being dragged. A refused move shows no guides: nothing
        // would move to them.
        const refusal = transformRefusal(
          document.project,
          state.moving,
          MatOps.fromTranslation(delta),
        );
        state = {
          ...state,
          refusal,
          aligned: refusal === null ? (alignment?.snapped ?? null) : null,
          delta,
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
        : state.kind === 'moving' || state.kind === 'maybe-move'
          ? state.moving
          : [];
    },

    snapsPoints() {
      return state.kind === 'moving' || state.kind === 'maybe-move' ? state.byPoint : true;
    },

    notice() {
      return state.kind === 'moving' ? state.refusal : null;
    },

    buildOverlay(ctx): DisplayList {
      if (state.kind === 'moving' && state.guides !== null && state.aligned !== null) {
        const { box, targets } = state.guides;
        const moved = {
          minX: box.minX + state.delta.x,
          maxX: box.maxX + state.delta.x,
          minY: box.minY + state.delta.y,
          maxY: box.maxY + state.delta.y,
        };
        return {
          items: alignmentOverlay(moved, state.aligned, targets, cssPxPerMm(ctx.viewport.toView())),
        };
      }
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

/**
 * The extent a move lines up and the targets it lines up with — for whole
 * pieces only. Features moved inside a piece line up with that piece (3.18),
 * not with the board.
 */
function guidesFor(
  project: Project,
  moving: readonly FeatureId[],
): { box: Rect; targets: AlignTargets } | null {
  const { about } = pieceScope(project, moving);
  const outlines = new Set(
    project.parts.flatMap((part) =>
      part.features
        .filter((feature) => feature.kind === 'cut-contour' && feature.role === 'outer')
        .map((feature) => feature.id),
    ),
  );
  if (about.length === 0 || !about.every((id) => outlines.has(id))) return null;
  const box = selectionBox(project, about);
  if (box === null) return null;
  return { box, targets: collectAlignTargets(evaluate(project), new Set(moving)) };
}
