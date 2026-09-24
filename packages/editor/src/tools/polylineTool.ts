import { EPS_POINT, approxZero, formatAngle, formatMm } from '@leathercad/core';
import {
  PathOps,
  SegmentOps,
  Shapes,
  dist,
  type Path,
  type Segment,
  type Vec2,
} from '@leathercad/geometry';
import { CANVAS, pathItem, textItem, type DisplayList } from '@leathercad/render';

import { isDrag } from './gesture.js';
import { createDrawCommit } from './commitDrawn.js';

import type { Tool, ToolContext } from '../tool.js';
import { constrainToAngleStep } from './angleConstraint.js';

/** An arc whose end is placed and whose bulge is not yet. */
interface PendingArc {
  readonly end: Vec2;
  /** Whether that end is the first point, so the bulge click closes the shape. */
  readonly closes: boolean;
}

type State =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'drawing';
      /** Points already committed by a click. */
      readonly points: readonly Vec2[];
      /**
       * For each edge between two points, the point an arc passes through, or
       * null for a straight. One fewer than `points`.
       */
      readonly throughs: readonly (Vec2 | null)[];
      /** Where the cursor is now — the rubber segment's far end, or an arc's bulge. */
      readonly cursor: Vec2;
      readonly pending: PendingArc | null;
      /** Whether the next segment is an arc: A turns it on, L back off. */
      readonly arc: boolean;
    };

/** How near the first point a click must land to close the shape, in pixels. */
const CLOSE_RADIUS_PX = 10;

/**
 * A run of straights, and — since slice 3.9a — arcs.
 *
 * Mid-run, **A** makes the next segment an arc and **L** a straight again: the
 * CAD convention for a polyline, and why the tool claims those two keys while
 * a run is live rather than letting them switch to the Arc or Line tool and
 * throw the run away. An arc takes two clicks, as the arc tool does: where it
 * ends, then a point it passes through. That draws the product spec's own
 * example — a card pocket with a curved thumb scoop in its top edge — as one
 * closed outline. No vertex editing, no tangency: a curve editor is 1.1.
 */
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
  const finish = (
    ctx: ToolContext,
    points: readonly Vec2[],
    throughs: readonly (Vec2 | null)[],
    closed: boolean,
    closingThrough: Vec2 | null = null,
  ): void => {
    // One point is a click, not a line. Committing it would leave a part in
    // the list that cannot be seen or selected. Two points close only with a
    // curve back: a straight there and back encloses nothing.
    const enough = closingThrough === null ? 3 : 2;
    if (points.length < 2 || (closed && points.length < enough)) {
      reset(ctx);
      return;
    }

    const source = {
      kind: 'path',
      path: runPath(points, throughs, closed, closingThrough),
    } as const;

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

    state = {
      kind: 'drawing',
      points,
      throughs,
      cursor: points[points.length - 1]!,
      pending: null,
      arc: false,
    };
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
        state = {
          kind: 'drawing',
          points: [event.at],
          throughs: [],
          cursor: event.at,
          pending: null,
          arc: false,
        };
        ctx.invalidate();
        return;
      }

      const { points, throughs, pending } = state;
      const last = points[points.length - 1]!;

      // The second click of an arc: the point it passes through. One on either
      // end describes no circle, so it is not taken; the arc waits for another.
      if (pending !== null) {
        const through = event.at;
        if (arcEdge(last, through, pending.end) === null) return;
        if (pending.closes) {
          finish(ctx, points, throughs, true, through);
          return;
        }
        state = {
          ...state,
          points: [...points, pending.end],
          throughs: [...throughs, through],
          cursor: pending.end,
          pending: null,
        };
        ctx.invalidate();
        return;
      }

      const placed = constrain(points, event.at, event.shiftKey);
      const first = points[0];

      // Clicking back on the first point closes the shape rather than adding a
      // point on top of it — straight away for a straight, after its bulge for
      // an arc.
      const closeMm = CLOSE_RADIUS_PX / ctx.viewport.scale;
      const onFirst = first !== undefined && dist(placed, first) <= closeMm;

      if (state.arc) {
        if (onFirst && points.length >= 2) {
          state = { ...state, cursor: placed, pending: { end: first, closes: true } };
        } else if (!approxZero(dist(placed, last), EPS_POINT)) {
          state = { ...state, cursor: placed, pending: { end: placed, closes: false } };
        }
        ctx.invalidate();
        return;
      }

      if (onFirst && points.length >= 3) {
        finish(ctx, points, throughs, true);
        return;
      }

      const next = [...points, placed];
      const nextThroughs = [...throughs, null];
      if (next.length >= config.maxPoints) {
        finish(ctx, next, nextThroughs, false);
        return;
      }

      state = {
        ...state,
        points: next,
        throughs: nextThroughs,
        cursor: placed,
        pending: null,
      };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'drawing') return;
      // An arc's bulge goes where it is put; Shift steps only a segment's angle.
      const cursor =
        state.pending === null ? constrain(state.points, event.at, event.shiftKey) : event.at;
      state = { ...state, cursor };
      ctx.invalidate();
    },

    // A line takes a drag as well as two clicks, like every two-point tool
    // (F.1). A polyline does not: each of its presses is a point, and a drag
    // between them has no second meaning to give.
    onPointerUp(ctx, event) {
      if (config.maxPoints !== 2 || event.button !== 0) return;
      if (state.kind !== 'drawing' || state.points.length !== 1) return;
      const first = state.points[0]!;
      if (!isDrag(ctx, first, event.at)) return;
      finish(ctx, [first, constrain(state.points, event.at, event.shiftKey)], [null], false);
    },

    notice: (ctx) => draw.notice(ctx),

    onKey(ctx, event): boolean {
      if (state.kind !== 'drawing') return false;

      if (event.key === 'Escape') {
        reset(ctx);
        return false;
      }

      // A and L choose the next segment. Claimed, so the app does not also
      // switch to the Arc or Line tool and throw the run away. The line tool
      // finishes itself at two points and never has a next segment to choose.
      const letter = event.key.toLowerCase();
      if (correctable && !event.ctrlKey && (letter === 'a' || letter === 'l')) {
        state = { ...state, arc: letter === 'a' };
        ctx.invalidate();
        return true;
      }

      if (event.key === 'Enter') {
        // An arc with no bulge yet is not part of what was drawn.
        finish(ctx, state.points, state.throughs, false);
        return false;
      }

      // Undoing a misplaced point without abandoning the whole run: an arc's
      // placed end first, then the point before it. Removing the last one
      // leaves idle rather than an empty drawing state.
      if (event.key === 'Backspace') {
        if (state.pending !== null) {
          state = { ...state, pending: null, cursor: state.points[state.points.length - 1]! };
          ctx.invalidate();
          return false;
        }
        const points = state.points.slice(0, -1);
        if (points.length === 0) reset(ctx);
        else {
          state = {
            ...state,
            points,
            throughs: state.throughs.slice(0, -1),
            cursor: points[points.length - 1]!,
            pending: null,
          };
          ctx.invalidate();
        }
      }
      return false;
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'drawing') return { items: [] };

      const { points, throughs, cursor, pending, arc: arcNext } = state;
      const stroke = { colour: CANVAS.overlay.preview, widthPx: 1, dashPx: [4, 3] };
      const last = points[points.length - 1]!;
      const drawn = runPath(points, throughs, false, null).segments;

      // The numbers matter more than the rubber band on a millimetre tool: a
      // straight's run and angle, and an arc's radius.
      let rubber: readonly Segment[];
      let reading: string;
      const arc = pending === null ? null : arcEdge(last, cursor, pending.end);
      if (pending !== null) {
        rubber = arc ?? [SegmentOps.line(last, pending.end)];
        const bend = rubber[0];
        reading =
          bend?.kind === 'arc'
            ? `R ${formatMm(bend.radius, 1)}`
            : formatMm(dist(last, pending.end), 1);
      } else {
        rubber = [SegmentOps.line(last, cursor)];
        const angle = (Math.atan2(cursor.y - last.y, cursor.x - last.x) * 180) / Math.PI;
        const run = `${formatMm(dist(last, cursor), 1)}  ${formatAngle(angle)}`;
        // Placing an arc's end looks like placing a point, so it says so.
        reading = arcNext ? `Arc to · ${run}` : run;
      }

      return {
        items: [
          pathItem('construction', PathOps.unsafePath([...drawn, ...rubber], false), stroke),
          textItem(
            'annotation',
            { x: cursor.x, y: cursor.y + 3 },
            reading,
            12,
            CANVAS.overlay.preview,
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
 * The run as a path: each edge a straight, or an arc through its point.
 *
 * Built with `Shapes.arcThroughPoints`, which the arc tool uses too — the tool
 * does no circle-fitting of its own.
 */
function runPath(
  points: readonly Vec2[],
  throughs: readonly (Vec2 | null)[],
  closed: boolean,
  closingThrough: Vec2 | null,
): Path {
  if (points.length < 2) return PathOps.unsafePath([], closed);

  const segments: Segment[] = [];
  const edge = (a: Vec2, b: Vec2, through: Vec2 | null): void => {
    const arc = through === null ? null : arcEdge(a, through, b);
    if (arc !== null) segments.push(...arc);
    else if (!approxZero(dist(a, b), EPS_POINT)) segments.push(SegmentOps.line(a, b));
  };

  for (let i = 0; i < points.length - 1; i++) edge(points[i]!, points[i + 1]!, throughs[i] ?? null);
  if (closed) edge(points[points.length - 1]!, points[0]!, closingThrough);
  return PathOps.unsafePath(segments, closed);
}

/**
 * The arc from `a` through `through` to `b` — or the straight, when the three
 * are in a line — and null when two of them coincide, which describes no
 * circle at all.
 */
function arcEdge(a: Vec2, through: Vec2, b: Vec2): readonly Segment[] | null {
  const apart = (p: Vec2, q: Vec2): boolean => !approxZero(dist(p, q), EPS_POINT);
  if (!apart(a, through) || !apart(through, b) || !apart(a, b)) return null;
  return Shapes.arcThroughPoints(a, through, b).segments;
}

/** Shift snaps the new segment's direction to a multiple of 15°. */
function constrain(points: readonly Vec2[], at: Vec2, shift: boolean): Vec2 {
  return constrainToAngleStep(points[points.length - 1], at, shift);
}
