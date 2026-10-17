import { formatMm, formatNumber, quantiseAtMost } from '@leathercad/core';
import { rectShape } from '@leathercad/document';
import { Shapes } from '@leathercad/geometry';
import { CANVAS, pathItem, textItem, type DisplayList } from '@leathercad/render';

import type { Mm } from '@leathercad/core';

import { createDrawCommit } from './commitDrawn.js';
import { isDrag } from './gesture.js';

import type { SizeDraft, SizeField, Tool, ToolContext } from '../tool.js';

/**
 * Draws a rectangle from one corner to the other — by dragging the diagonal,
 * or by clicking one corner and then the other. Every two-point tool takes
 * both (F.1): a maker told to drag a line got a rubber band and nothing, and
 * one who clicks a rectangle should not either.
 *
 * The state is an explicit discriminant, not a scatter of booleans — the one
 * convention that keeps canvas tools from rotting. `phase` says which press
 * the next pointer-up ends: the first (a drag, or the first click of two), or
 * the second click.
 *
 * **Typed sizes (U.16).** Once a corner is placed the maker can type the size.
 * A number typed stays; what was not typed follows the pointer, which also
 * says which way from the corner the shape runs. Typing before any click starts the corner at the pointer. The chips and the
 * refusals are the app's (`ValueChips`); the tool takes numbers already
 * checked, and writes only through `draw.commit`.
 */
type Typed = { [field in SizeField]?: Mm };

type State =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'spanning';
      readonly phase: 'first-press' | 'placing' | 'second-press';
      readonly startMm: { x: number; y: number };
      readonly currentMm: { x: number; y: number };
      /** The sizes the maker typed, once any was; null while the pointer sets them. */
      readonly typed: Typed | null;
    };

/** Under this a side is a click, not a rectangle. */
const MIN_SIDE = 0.01;

export function createRectangleTool(nextId: () => string): Tool {
  let state: State = { kind: 'idle' };
  /** Where the pointer last was while idle: where typing starts with no corner placed. */
  let hover: { x: number; y: number } | null = null;

  /** Every draw tool commits through one of these, so no refusal is silent. */
  const draw = createDrawCommit();

  const reset = (ctx: ToolContext): void => {
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  const finish = (ctx: ToolContext): void => {
    if (state.kind !== 'spanning' || state.phase !== 'placing') return;
    const made = shown(state);
    // Nothing to make yet — a side still at the pointer's nothing: the
    // rectangle stays open for the other size to be typed, not lost.
    if (made.width < MIN_SIDE || made.height < MIN_SIDE) return;
    reset(ctx);
    make(ctx, made);
  };

  const make = (ctx: ToolContext, made: SizeDraft): void => {
    // A second click on the first corner is not a rectangle. Creating a
    // zero-size part would leave something invisible in the parts list that
    // cannot be selected to delete.
    if (made.width < MIN_SIDE || made.height < MIN_SIDE) return;
    // The chips refuse a corner too large for the sizes shown; a pointer that
    // has since shrunk one cannot make a corner the rectangle would draw smaller.
    const corner = Math.min(made.corner, quantiseAtMost(Math.min(made.width, made.height) / 2));
    draw.commit(ctx, nextId, 'Panel', {
      kind: 'shape',
      shape: rectShape(made.origin, made.width, made.height, corner),
    });
  };

  return {
    id: 'rectangle',
    label: 'Rectangle',
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;
      if (state.kind === 'spanning' && state.phase === 'placing') {
        state = { ...state, phase: 'second-press' };
        return;
      }
      draw.begin();
      state = {
        kind: 'spanning',
        phase: 'first-press',
        startMm: event.at,
        currentMm: event.at,
        typed: null,
      };
      ctx.invalidate();
    },

    onPointerMove(ctx, event) {
      if (state.kind !== 'spanning') {
        hover = event.at;
        return;
      }
      state = { ...state, currentMm: constrain(state.startMm, event.at, event.shiftKey) };
      ctx.invalidate();
    },

    onPointerUp(ctx, event) {
      if (state.kind !== 'spanning' || state.phase === 'placing') return;

      // A first press that never became a drag is the first of two clicks:
      // the corner is placed and the rectangle follows the pointer.
      if (state.phase === 'first-press' && !isDrag(ctx, state.startMm, event.at)) {
        state = { ...state, phase: 'placing' };
        ctx.invalidate();
        return;
      }

      // Read everything out of the state *before* resetting it. `reset`
      // reassigns the closure variable, and TypeScript keeps the narrowing
      // across that call because the assignment happens in another function —
      // so `state.startMm` afterwards compiles fine and is undefined at run
      // time.
      const made = shapeOf(state.startMm, event.at, event, state.typed);
      reset(ctx);
      make(ctx, made);
    },

    notice: (ctx) => draw.notice(ctx),

    onKey(ctx, event) {
      // Enter makes the rectangle as shown. Claimed, so the board's Enter does
      // not open the selected outline's chips instead (U.14).
      if (event.key === 'Enter' && state.kind === 'spanning' && state.phase === 'placing') {
        finish(ctx);
        return true;
      }
      if (event.key !== 'Escape') return false;
      // Claimed only when it gives something up (U.5).
      const busy = state.kind !== 'idle';
      reset(ctx);
      return busy;
    },

    buildOverlay(): DisplayList {
      if (state.kind !== 'spanning') return { items: [] };

      const { origin, width, height, corner } = shown(state);
      const preview = pathItem('construction', Shapes.roundedRect(origin, width, height, corner), {
        colour: CANVAS.overlay.preview,
        widthPx: 1,
        dashPx: [4, 3],
      });
      // Between the clicks the numbers are chips, which can be typed over;
      // while dragging they are this readout. A millimetre tool shows its numbers.
      if (state.phase === 'placing') return { items: [preview] };
      return {
        items: [
          preview,
          textItem(
            'annotation',
            { x: origin.x, y: origin.y + height + 3 },
            `${formatNumber(width, 1)} × ${formatMm(height, 1)}`,
            12,
            CANVAS.overlay.preview,
          ),
        ],
      };
    },

    sizing() {
      return state.kind === 'spanning' && state.phase === 'placing' ? shown(state) : null;
    },

    beginSizing(ctx) {
      if (state.kind === 'spanning') return state.phase === 'placing';
      if (hover === null) return false;
      draw.begin();
      state = { kind: 'spanning', phase: 'placing', startMm: hover, currentMm: hover, typed: null };
      ctx.invalidate();
      return true;
    },

    setSize(ctx, field, value) {
      if (state.kind !== 'spanning' || state.phase !== 'placing') return;
      state = {
        ...state,
        typed: { ...state.typed, [field]: value },
      };
      ctx.invalidate();
    },

    finishSizing: finish,

    onDeactivate(ctx) {
      reset(ctx);
    },
  };
}

/**
 * The rectangle between a corner and the pointer: as the pointer sets it, or —
 * once sizes were typed — as typed, running from the corner towards the pointer.
 */
function shapeOf(
  start: { x: number; y: number },
  current: { x: number; y: number },
  event: { shiftKey: boolean },
  typed: Typed | null,
): SizeDraft {
  const end = constrain(start, current, event.shiftKey);
  const width = typed?.width ?? Math.abs(end.x - start.x);
  const height = typed?.height ?? Math.abs(end.y - start.y);
  return {
    // Towards the pointer; level with the corner, to the right and up.
    origin: {
      x: end.x < start.x ? start.x - width : start.x,
      y: end.y < start.y ? start.y - height : start.y,
    },
    width,
    height,
    corner: typed?.corner ?? 0,
  };
}

/** What the rectangle in progress is now. */
function shown(state: Extract<State, { kind: 'spanning' }>): SizeDraft {
  return shapeOf(state.startMm, state.currentMm, { shiftKey: false }, state.typed);
}

/** Shift constrains to a square, using the larger of the two extents. */
function constrain(
  start: { x: number; y: number },
  current: { x: number; y: number },
  square: boolean,
): { x: number; y: number } {
  if (!square) return current;

  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx) * size, y: start.y + Math.sign(dy) * size };
}
