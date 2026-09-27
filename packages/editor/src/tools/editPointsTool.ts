import {
  editPathPoint,
  pathPointRefusal,
  pointEditingRefusal,
  type Command,
  type PathPointEdit,
} from '@leathercad/document';
import {
  evaluate,
  findFeature,
  type FeatureId,
  type Problem,
  type Project,
} from '@leathercad/domain';
import { PathOps, polyline, type Path, type Vec2 } from '@leathercad/geometry';
import { CANVAS, dotsItem, pathItem, type DisplayItem, type DisplayList } from '@leathercad/render';

import { hitTest } from '../hitTest.js';
import type { Tool, ToolContext } from '../tool.js';

/** A handle's side, in screen pixels: big enough to grab, small beside a stitch hole. */
const HANDLE_PX = 8;

/**
 * Where a split would be too close to a segment's end to leave both halves a
 * length: a press there takes the point that is already at that end.
 */
const END_SLACK = 1e-3;

type State =
  | {
      readonly kind: 'idle';
      /** The point last pressed, which Delete removes. */
      readonly picked: number | null;
      /** Why the last edit was refused, until the next press. */
      readonly refusal: Problem | null;
    }
  | {
      readonly kind: 'dragging';
      readonly featureId: FeatureId;
      readonly vertex: number;
      /** Set when the press added the point: the split, which the drag moves. */
      readonly inserted: { readonly segment: number; readonly t: number } | null;
      /**
       * The project the move is judged against: as the press found it, with
       * the new point when the press added one. Not the preview, which is
       * the last move's result.
       */
      readonly base: Project;
      readonly refusal: Problem | null;
    };

/**
 * Moves, adds and removes the points of a drawn path (slice 3.9c).
 *
 * The selected drawn path shows a handle on every point. Drag a handle to
 * move its point; press an edge to add a point there and drag it in the same
 * gesture; press a handle and then Delete to remove its point. Each gesture is
 * one step to undo. A shape is changed by its measurements rather than its
 * points, and the tool says so instead of drawing handles.
 *
 * Every edit goes through `editPathPoint`, which keeps stitch runs and
 * dimensions on the corners they were attached to, or refuses (3.9b). The
 * refusal is said beside the pointer, from the same check that refused.
 */
export function createEditPointsTool(): Tool {
  let state: State = { kind: 'idle', picked: null, refusal: null };

  const reset = (ctx: ToolContext): void => {
    if (state.kind === 'dragging') ctx.store.rollback();
    state = { kind: 'idle', picked: null, refusal: null };
    ctx.invalidate();
  };

  return {
    id: 'points',
    label: 'Edit Points',
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;
      if (state.kind === 'dragging') reset(ctx);

      const target = editable(ctx);
      const tolerance = ctx.viewport.pickToleranceMm();

      if (target !== null) {
        const vertices = PathOps.vertices(target.path);
        const handle = nearestWithin(vertices, event.at, tolerance);
        if (handle !== null) {
          const base = ctx.store.getState().document.project;
          ctx.store.begin('Move point');
          state = {
            kind: 'dragging',
            featureId: target.id,
            vertex: handle,
            inserted: null,
            base,
            refusal: null,
          };
          ctx.invalidate();
          return;
        }

        const edge = PathOps.closestPointOnPath(target.path, event.at);
        if (edge !== null && edge.distance <= tolerance) {
          // Right at a segment's end, the point is already there to take.
          if (edge.t > END_SLACK && edge.t < 1 - END_SLACK) {
            const split = { segment: edge.segmentIndex, t: edge.t };
            ctx.store.begin('Add point');
            ctx.store.preview(insertThenMove(target.id, split, null));
            state = {
              kind: 'dragging',
              featureId: target.id,
              vertex: split.segment + 1,
              inserted: split,
              // The preview is exactly the press: the path with its new point.
              base: ctx.store.getState().document.project,
              refusal: null,
            };
            ctx.invalidate();
            return;
          }
        }
      }

      // Not on the path being edited: pick another drawn path to edit, the way
      // Select would. A press on nothing keeps the selection.
      const hit = hitTest(evaluate(ctx.store.getState().document.project), event.at, tolerance);
      if (hit !== null && hit !== target?.id) ctx.store.select([hit]);
      state = { kind: 'idle', picked: null, refusal: null };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'dragging') return;

      const move: PathPointEdit = {
        kind: 'move',
        featureId: state.featureId,
        vertex: state.vertex,
        to: event.at,
      };
      state = { ...state, refusal: pathPointRefusal(state.base, move) };
      ctx.store.preview(
        state.inserted === null
          ? editPathPoint(move)
          : insertThenMove(state.featureId, state.inserted, event.at),
      );
      ctx.invalidate();
    },

    onPointerUp(ctx) {
      if (state.kind !== 'dragging') return;
      ctx.store.commit();
      state = { kind: 'idle', picked: state.vertex, refusal: state.refusal };
      ctx.invalidate();
    },

    onKey(ctx, event) {
      if (event.key === 'Escape') {
        if (state.kind === 'dragging') {
          reset(ctx);
          return true;
        }
        state = { kind: 'idle', picked: null, refusal: null };
        ctx.invalidate();
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (state.kind !== 'idle' || state.picked === null) return;
      const target = editable(ctx);
      if (target === null) return;

      const remove: PathPointEdit = { kind: 'remove', featureId: target.id, vertex: state.picked };
      const refusal = pathPointRefusal(ctx.store.getState().document.project, remove);
      if (refusal === null) ctx.dispatch(editPathPoint(remove));
      state = { kind: 'idle', picked: null, refusal };
      ctx.invalidate();
      // Claimed either way: Delete meant this point, and deleting the whole
      // outline instead would be the opposite of what was asked.
      return true;
    },

    snapExclusions() {
      // A point dragged near its own path would snap to the corner it just
      // left, and pin itself there.
      return state.kind === 'dragging' ? [state.featureId] : [];
    },

    notice(ctx) {
      if (state.refusal !== null) return state.refusal;
      const id = soleSelected(ctx);
      return id === null ? null : pointEditingRefusal(ctx.store.getState().document.project, id);
    },

    buildOverlay(ctx): DisplayList {
      const target = editable(ctx);
      if (target === null) return { items: [] };

      const half = HANDLE_PX / 2 / ctx.viewport.scale;
      const stroke = { colour: CANVAS.overlay.preview, widthPx: 1.5 };
      const vertices = PathOps.vertices(target.path);
      const items: DisplayItem[] = vertices.map((v) =>
        pathItem(
          'construction',
          polyline(
            [
              { x: v.x - half, y: v.y - half },
              { x: v.x + half, y: v.y - half },
              { x: v.x + half, y: v.y + half },
              { x: v.x - half, y: v.y + half },
            ],
            true,
          ),
          stroke,
        ),
      );

      const picked = state.kind === 'dragging' ? state.vertex : state.picked;
      const at = picked === null ? undefined : vertices[picked];
      if (at !== undefined)
        items.push(dotsItem('construction', [at], HANDLE_PX / 3, CANVAS.overlay.preview));
      return { items };
    },

    onDeactivate(ctx) {
      reset(ctx);
    },
  };
}

/** The one selected feature, if exactly one is. */
function soleSelected(ctx: ToolContext): FeatureId | null {
  const selected = ctx.store.getState().selection.features;
  if (selected.size !== 1) return null;
  const [id] = selected;
  return id ?? null;
}

/** The selected feature's drawn path, when its points can be edited. */
function editable(ctx: ToolContext): { id: FeatureId; path: Path } | null {
  const id = soleSelected(ctx);
  if (id === null) return null;
  const project = ctx.store.getState().document.project;
  if (pointEditingRefusal(project, id) !== null) return null;

  const found = findFeature(project, id);
  if (found === null || !found.feature.visible) return null;
  const { source } = found.feature;
  return source.kind === 'path' ? { id, path: source.path } : null;
}

/** The nearest point within reach, by index, or `null`. */
function nearestWithin(points: readonly Vec2[], at: Vec2, reach: number): number | null {
  let best: number | null = null;
  let bestDistance = reach;
  for (const [i, p] of points.entries()) {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * A point added and then moved, as one command: the gesture a press on an
 * edge starts. `to` of `null` is the press itself, before any movement.
 */
function insertThenMove(
  featureId: FeatureId,
  split: { readonly segment: number; readonly t: number },
  to: Vec2 | null,
): Command {
  const insert = editPathPoint({ kind: 'insert', featureId, ...split });
  return {
    label: 'Add point',
    apply: (document) => {
      const inserted = insert.apply(document);
      return to === null
        ? inserted
        : editPathPoint({ kind: 'move', featureId, vertex: split.segment + 1, to }).apply(inserted);
    },
  };
}
