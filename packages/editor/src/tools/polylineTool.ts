import { formatAngle, formatMm } from '@leathercad/core';
import { dist, polyline, type Vec2 } from '@leathercad/geometry';
import { pathItem, textItem, type DisplayList } from '@leathercad/render';

import { createDrawCommit } from './commitDrawn.js';

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

  const draw = createDrawCommit();

  /**
   * Whether a refused run could still be corrected where it stands.
   *
   * The correction for "this does not enclose anything" is to keep going and
   * close it, which needs a third point. A polyline can always take one; the
   * line tool finishes itself at two and never can, so holding its points
   * would only trap the user in a refusal they cannot answer.
   */
  const correctable = config.maxPoints === Infinity;

  const reset = (ctx: ToolContext): void => {
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  /** Commits what has been drawn, if it is worth committing. */
  const finish = (ctx: ToolContext, points: readonly Vec2[], closed: boolean): void => {
    // One point is a click, not a line. Committing it would leave a part in
    // the list that cannot be seen or selected.
    if (points.length < 2 || (closed && points.length < 3)) {
      reset(ctx);
      return;
    }

    const source = { kind: 'path', path: polyline(points, closed) } as const;

    if (draw.commit(ctx, nextId, closed ? 'Panel' : 'Line', source) !== null) {
      reset(ctx);
      return;
    }

    // Refused. The run stays live where it can still be answered, so the user
    // can add a point, Backspace one off, click the first point to close, or
    // press Escape to let it go — a refusal that says "not an outline yet"
    // rather than one that eats eleven clicks round a gusset.
    if (!correctable) {
      reset(ctx);
      return;
    }

    state = { kind: 'drawing', points, cursor: points[points.length - 1]! };
    ctx.invalidate();
  };

  return {
    id: config.id,
    label: config.label,
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;

      // Every click is the user answering whatever the last one was told, so
      // the held refusal clears here and `finish` puts it back if it still
      // applies. A run kept alive after a refusal stops nagging the moment it
      // is being corrected.
      draw.begin();

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

    notice: (ctx) => draw.notice(ctx),

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
            `${formatMm(run, 1)}  ${formatAngle(angle)}`,
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
