import { addPart, pathPart } from '@leathercad/document';
import { dist, polyline, type Vec2 } from '@leathercad/geometry';
import { pathItem, textItem, type DisplayList } from '@leathercad/render';

import type { Tool, ToolContext } from '../tool.js';
import { constrainToAngleStep } from './angleConstraint.js';

type State =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'drawing';
      /** Points already committed by a click. */
      readonly points: readonly Vec2[];
      /** Where the cursor is now — the rubber segment's far end. */
      readonly cursor: Vec2;
    };

/** How near the first point a click must land to close the shape, in pixels. */
const CLOSE_RADIUS_PX = 10;

export function createPolylineTool(nextId: () => string): Tool {
  return polylineLike(nextId, { id: 'polyline', label: 'Polyline', maxPoints: Infinity });
}

/**
 * The two-point case.
 *
 * Not a separate implementation: a line is a polyline that finishes itself,
 * and two implementations of the same rubber-banding would drift apart.
 */
export function createLineTool(nextId: () => string): Tool {
  return polylineLike(nextId, { id: 'line', label: 'Line', maxPoints: 2 });
}

function polylineLike(
  nextId: () => string,
  config: { id: string; label: string; maxPoints: number },
): Tool {
  let state: State = { kind: 'idle' };

  const reset = (ctx: ToolContext): void => {
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  /** Commits what has been drawn, if it is worth committing. */
  const finish = (ctx: ToolContext, points: readonly Vec2[], closed: boolean): void => {
    reset(ctx);

    // One point is a click, not a line. Committing it would leave a part in
    // the list that cannot be seen or selected.
    if (points.length < 2) return;
    if (closed && points.length < 3) return;

    const featureId = nextId();
    ctx.dispatch(
      addPart(pathPart(nextId(), featureId, closed ? 'Panel' : 'Line', polyline(points, closed))),
    );
    ctx.store.select([featureId]);
  };

  return {
    id: config.id,
    label: config.label,
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;

      if (state.kind === 'idle') {
        state = { kind: 'drawing', points: [event.at], cursor: event.at };
        ctx.invalidate();
        return;
      }

      const placed = constrain(state.points, event.at, event.shiftKey);
      const first = state.points[0];

      // Clicking back on the first point closes the shape rather than adding a
      // point on top of it.
      const closeMm = CLOSE_RADIUS_PX / ctx.viewport.scale;
      if (first !== undefined && state.points.length >= 3 && dist(placed, first) <= closeMm) {
        finish(ctx, state.points, true);
        return;
      }

      const points = [...state.points, placed];
      if (points.length >= config.maxPoints) {
        finish(ctx, points, false);
        return;
      }

      state = { kind: 'drawing', points, cursor: placed };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'drawing') return;
      state = { ...state, cursor: constrain(state.points, event.at, event.shiftKey) };
      ctx.invalidate();
    },

    onKey(ctx, event) {
      if (state.kind !== 'drawing') return;

      if (event.key === 'Escape') {
        reset(ctx);
        return;
      }

      if (event.key === 'Enter') {
        finish(ctx, state.points, false);
        return;
      }

      // Undoing a misplaced point without abandoning the whole run. Removing
      // the last one leaves idle rather than an empty drawing state.
      if (event.key === 'Backspace') {
        const points = state.points.slice(0, -1);
        if (points.length === 0) reset(ctx);
        else {
          state = { kind: 'drawing', points, cursor: points[points.length - 1]! };
          ctx.invalidate();
        }
      }
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'drawing') return { items: [] };

      const preview = [...state.points, state.cursor];
      const stroke = { colour: '#ffcc44', widthPx: 1, dashPx: [4, 3] };
      const last = state.points[state.points.length - 1]!;
      const run = dist(last, state.cursor);
      const angle = (Math.atan2(state.cursor.y - last.y, state.cursor.x - last.x) * 180) / Math.PI;

      return {
        items: [
          pathItem('construction', polyline(preview, false), stroke),
          // The numbers matter more than the rubber band on a millimetre tool.
          textItem(
            'annotation',
            { x: state.cursor.x, y: state.cursor.y + 3 },
            `${run.toFixed(1)} mm  ${angle.toFixed(1)}°`,
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

/** Shift snaps the new segment's direction to a multiple of 15°. */
function constrain(points: readonly Vec2[], at: Vec2, shift: boolean): Vec2 {
  return constrainToAngleStep(points[points.length - 1], at, shift);
}
