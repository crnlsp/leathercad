import { arcShape } from '@leathercad/document';
import { Shapes, type Path, type Segment, type Vec2 } from '@leathercad/geometry';
import { pathItem, textItem, type DisplayList } from '@leathercad/render';

import { createDrawCommit } from './commitDrawn.js';

import type { Tool, ToolContext } from '../tool.js';
import { constrainToAngleStep } from './angleConstraint.js';

/**
 * Draws an arc through three points: start, end, then the bulge.
 *
 * The order is the CAD convention, and it maps straight onto
 * `Shapes.arcThroughPoints`, which already solves the circumcentre and returns
 * a segment carrying the four numbers the record stores. This tool does no
 * geometry of its own — it collects clicks and reads the answer.
 *
 * An arc has two ends, so it becomes a `marking-line` rather than a cut
 * contour. That is slice 3.5's rule, applied by `shapePart`.
 */
type State =
  | { readonly kind: 'idle'; readonly cursor: Vec2 | null }
  | {
      readonly kind: 'placing';
      readonly points: readonly Vec2[];
      readonly cursor: Vec2;
    };

export function createArcTool(nextId: () => string): Tool {
  let state: State = { kind: 'idle', cursor: null };

  /**
   * Holds the reason when a drawing is refused, so it reaches the status bar.
   *
   * An arc has two ends, so in Outline or Cut-out mode it is always refused
   * (S6) — and an arc has no correction path, unlike a polyline that can still
   * be closed. The drawing goes; the reason stays until the next one starts.
   */
  const draw = createDrawCommit();

  const reset = (ctx: ToolContext): void => {
    state = { kind: 'idle', cursor: null };
    ctx.invalidate();
  };

  /** Where the next click would land, with Shift applied. */
  const aim = (at: Vec2, shift: boolean): Vec2 =>
    constrainToAngleStep(state.kind === 'placing' ? state.points.at(-1) : undefined, at, shift);

  return {
    id: 'arc',
    label: 'Arc',
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;

      const at = aim(event.at, event.shiftKey);
      if (state.kind !== 'placing') draw.begin();
      const points = state.kind === 'placing' ? [...state.points, at] : [at];

      if (points.length < 3) {
        state = { kind: 'placing', points, cursor: at };
        ctx.invalidate();
        return;
      }

      const [start, end, bulge] = points as [Vec2, Vec2, Vec2];
      reset(ctx);

      const shape = solve(start, bulge, end);
      if (shape === null) return;

      draw.commit(ctx, nextId, 'Line', { kind: 'shape', shape });
    },

    onPointerMove(ctx, event) {
      const at = aim(event.at, event.shiftKey);
      state = state.kind === 'placing' ? { ...state, cursor: at } : { kind: 'idle', cursor: at };
      ctx.invalidate();
    },

    notice: (ctx) => draw.notice(ctx),

    onKey(ctx, event) {
      if (event.key === 'Escape') {
        reset(ctx);
        return;
      }

      if (event.key === 'Backspace' && state.kind === 'placing') {
        const points = state.points.slice(0, -1);
        state =
          points.length === 0
            ? { kind: 'idle', cursor: state.cursor }
            : { kind: 'placing', points, cursor: state.cursor };
        ctx.invalidate();
      }
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'placing') return { items: [] };

      const [start, end] = state.points;
      if (start === undefined) return { items: [] };

      // One point down: a rubber band to where the other end would go. Two
      // points down: the arc itself, bending through the cursor.
      //
      // Both constructors refuse degenerate input, and the moment after a
      // click the cursor is still exactly on the point just placed. This runs
      // inside the draw loop, so letting that reach the caller stops the
      // canvas painting altogether — grid and rulers included.
      const preview =
        end === undefined ? previewLine(start, state.cursor) : previewArc(start, state.cursor, end);
      if (preview === null) return { items: [] };

      const items = [
        pathItem('construction', preview, { colour: '#ffcc44', widthPx: 1, dashPx: [4, 3] }),
      ];

      if (end !== undefined) {
        const shape = solve(start, state.cursor, end);
        if (shape !== null) {
          items.push(
            textItem(
              'annotation',
              { x: state.cursor.x, y: state.cursor.y + 3 },
              `r ${shape.radius.toFixed(1)} mm · ${Math.abs((shape.sweepAngle * 180) / Math.PI).toFixed(0)}°`,
              12,
              '#ffcc44',
            ),
          );
        }
      }

      return { items };
    },

    onDeactivate(ctx) {
      reset(ctx);
    },
  };
}

/**
 * The arc through three points, or null if there is not one.
 *
 * `arcThroughPoints` owns what "degenerate" means: it throws when two points
 * coincide and returns a straight segment when they are collinear. The tool
 * declines both rather than re-deriving the test — a second opinion about
 * collinearity is a second answer waiting to disagree.
 */
function solve(
  start: Vec2,
  through: Vec2,
  end: Vec2,
): Extract<ReturnType<typeof arcShape>, { type: 'arc' }> | null {
  const segment = segmentThrough(start, through, end);
  if (segment === null || segment.kind !== 'arc') return null;

  return arcShape(segment.centre, segment.radius, segment.startAngle, segment.sweepAngle);
}

function segmentThrough(start: Vec2, through: Vec2, end: Vec2): Segment | null {
  try {
    return Shapes.arcThroughPoints(start, through, end).segments[0] ?? null;
  } catch {
    // Coincident points. Not an error the user needs told about — they are
    // mid-gesture, and the preview simply shows nothing.
    return null;
  }
}

function previewArc(start: Vec2, through: Vec2, end: Vec2): Path | null {
  try {
    return Shapes.arcThroughPoints(start, through, end);
  } catch {
    return null;
  }
}

function previewLine(from: Vec2, to: Vec2): Path | null {
  try {
    return Shapes.line(from, to);
  } catch {
    return null;
  }
}
