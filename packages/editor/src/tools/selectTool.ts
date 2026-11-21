import {
  deleteFeatures,
  deletePart,
  isEmptySelection,
  pieceScope,
  selectedFeatureIds,
  selectionBox,
  toggledFeatureIds,
  transformRefusal,
  translateFeatures,
  setGuide,
  deleteGuide,
} from '@leathercad/document';
import type { FeatureId } from '@leathercad/domain';
import {
  dependentsOf,
  evaluate,
  materialOf,
  type Guide,
  type PartId,
  type Problem,
  type Project,
} from '@leathercad/domain';
import {
  MatOps,
  RectOps,
  Shapes,
  Vec2Ops,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';
import { CANVAS, cssPxPerMm, pathItem, type DisplayList } from '@leathercad/render';

import {
  alignMove,
  alignmentOverlay,
  collectAlignTargets,
  collectHostTargets,
  type AlignTargets,
} from '../align.js';
import {
  clearanceOf,
  distanceOverlay,
  hostPart,
  isOutline,
  punchedBy,
  rayDistances,
  type MoveReadout,
} from '../distances.js';
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
      /**
       * The extent being moved and what it lines up with: other pieces for whole
       * pieces (3.16), the piece they are in for features inside one (3.18).
       */
      readonly guides: Guides | null;
      /** What the last move lined up, held by the next (hysteresis). */
      readonly aligned: Snapped | null;
      readonly delta: Vec2;
      /** How far it went and how near the edges it is, while it is not refused (3.17). */
      readonly readout: MoveReadout | null;
    } & Grab)
  | {
      readonly kind: 'band';
      readonly startMm: { x: number; y: number };
      readonly currentMm: { x: number; y: number };
    };

interface Guides {
  readonly box: Rect;
  readonly targets: AlignTargets;
  /** A single hole or circle, which lines up by its centre alone. */
  readonly centreOnly: boolean;
  /** Features moved inside a piece: what their distances are measured to (3.17). */
  readonly inside: Inside | null;
}

/** What a move inside a piece measures against, collected when it begins (3.17). */
interface Inside {
  /** The piece's outline, which the rays reach. */
  readonly outline: Path;
  /** A single hole's radius: its rays start at its rim. Null for anything else. */
  readonly rimMm: number | null;
  /** What moves and what moves with it: whose holes the clearance is of. */
  readonly punched: ReadonlySet<string>;
}

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
        ctx.store.select(toggledFeatureIds(document.project, selection, [pick.id]));
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
          readout: null,
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
                centreOnly: state.guides.centreOnly,
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
        ctx.store.preview(translateFeatures(state.moving, delta));
        state = {
          ...state,
          refusal,
          aligned: refusal === null ? (alignment?.snapped ?? null) : null,
          delta,
          readout: refusal === null ? readoutOf(ctx, state.guides, delta) : null,
        };
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
        const kept = ctx.store.inTransaction;
        ctx.store.commit();
        if (kept && state.kind === 'moving' && state.readout !== null) ctx.moved?.(state.readout);
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

    readout() {
      return state.kind === 'moving' ? state.readout : null;
    },

    buildOverlay(ctx): DisplayList {
      if (state.kind === 'moving' && state.guides !== null) {
        const pxPerMm = cssPxPerMm(ctx.viewport.toView());
        const { targets } = state.guides;
        const moved = RectOps.translate(state.guides.box, state.delta);
        return {
          items: [
            ...(state.aligned === null
              ? []
              : alignmentOverlay(
                  moved,
                  state.aligned,
                  targets,
                  pxPerMm,
                  ctx.alignmentWords,
                  ctx.distanceWords,
                )),
            ...distanceOverlay(state.readout?.rays ?? [], pxPerMm, ctx.distanceWords),
          ],
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
  ctx.store.select(toggledFeatureIds(document.project, selection, own));
}

/**
 * The extent a move lines up and the targets it lines up with. Whole pieces
 * line up with the board's other pieces (3.16); features inside one piece —
 * the selection all in one part, its outline not among it — with that piece
 * (3.18). Anything else, features across pieces, lines up with nothing.
 */
function guidesFor(project: Project, moving: readonly FeatureId[]): Guides | null {
  const { about } = pieceScope(project, moving);
  const box = about.length === 0 ? null : selectionBox(project, about);
  if (box === null) return null;
  const features = new Map(
    project.parts.flatMap((part) => part.features.map((feature) => [feature.id, feature])),
  );
  const held = about.map((id) => features.get(id));
  const resolved = evaluate(project);

  if (held.every((feature) => feature !== undefined && isOutline(feature))) {
    return {
      box,
      targets: collectAlignTargets(resolved, new Set(moving)),
      centreOnly: false,
      inside: null,
    };
  }
  const host = hostPart(project, about);
  if (host === null) return null;
  const only = held.length === 1 ? held[0] : undefined;
  const circle =
    only?.source.kind === 'shape' && only.source.shape.type === 'circle' ? only.source.shape : null;
  const outline = resolved.parts.find((part) => part.part.id === host.id);
  const material = outline === undefined ? null : materialOf(outline);
  return {
    box,
    // What moves with the selection — a counterpart across a fold — is not
    // where it will be, so it is no target either.
    targets: collectHostTargets(
      resolved,
      host.id,
      new Set([...moving, ...dependentsOf(project, moving)]),
    ),
    centreOnly: circle !== null,
    inside:
      material === null || material.outer === null
        ? null
        : {
            outline: material.outer,
            rimMm: circle?.radius ?? null,
            punched: punchedBy(project, moving),
          },
  };
}

/**
 * What a move reads now (3.17, spec §7), after its preview: the distance as it
 * will be stored, and for features inside a piece their four gaps to its
 * outline and their holes' clearance — read from the previewed document by the
 * domain's own judgement, so the warning is what Problems lists after the drop.
 */
function readoutOf(ctx: ToolContext, guides: Guides | null, delta: Vec2): MoveReadout {
  const deltaMm = Vec2Ops.quantiseVec(delta);
  const inside = guides?.inside ?? null;
  if (guides === null || inside === null) return { deltaMm, rays: [], clearance: null };
  return {
    deltaMm,
    rays: rayDistances(inside.outline, RectOps.translate(guides.box, deltaMm), inside.rimMm),
    clearance: clearanceOf(evaluate(ctx.store.getState().document.project), inside.punched),
  };
}
