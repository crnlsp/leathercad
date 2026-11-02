import { addGuide, deleteGuide } from '@leathercad/document';
import { guideThrough } from '@leathercad/domain';
import type { Vec2 } from '@leathercad/geometry';

import { means, type Tool, type ToolContext } from '../tool.js';
import { isDrag } from './gesture.js';

type State =
  | { readonly kind: 'idle' }
  /** Pressed; a click places a level guide, a drag one through both points. */
  | {
      readonly kind: 'pressed';
      readonly id: string;
      readonly from: Vec2;
      readonly vertical: boolean;
    }
  | { readonly kind: 'dragging'; readonly id: string; readonly from: Vec2 };

/**
 * A click places a horizontal guide (vertical with Shift); a drag places one
 * through the press and the release, both snapped — along an edge, from corner
 * to corner. Exact position and angle are edited in Properties.
 */
export function createGuideTool(nextId: () => string): Tool {
  let state: State = { kind: 'idle' };

  const reset = (ctx: ToolContext): void => {
    if (state.kind === 'dragging') ctx.store.rollback();
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  const through = (ctx: ToolContext, id: string, from: Vec2, to: Vec2): void => {
    const line = guideThrough(from, to);
    if (line !== null) ctx.store.preview(addGuide({ id, ...line }));
  };

  return {
    id: 'guide',
    label: 'Guide',
    cursor: 'crosshair',
    onPointerDown(_ctx, event) {
      if (event.button !== 0) return;
      state = { kind: 'pressed', id: nextId(), from: event.at, vertical: event.shiftKey };
    },
    onPointerMove(ctx, event) {
      if (state.kind === 'pressed' && isDrag(ctx, state.from, event.at)) {
        ctx.store.begin({ action: 'add-guide' });
        state = { kind: 'dragging', id: state.id, from: state.from };
      }
      if (state.kind !== 'dragging') return;
      // Undo, or a command, cancelled the guide under the pointer.
      if (!ctx.store.inTransaction) {
        state = { kind: 'idle' };
        return;
      }
      through(ctx, state.id, state.from, event.at);
      ctx.invalidate();
    },
    onPointerUp(ctx, event) {
      if (state.kind === 'pressed') {
        const angleRad = state.vertical ? Math.PI / 2 : 0;
        ctx.dispatch(addGuide({ id: state.id, origin: state.from, angleRad }));
        ctx.store.selectGuide(state.id);
      } else if (state.kind === 'dragging' && ctx.store.inTransaction) {
        through(ctx, state.id, state.from, event.at);
        ctx.store.commit();
        ctx.store.selectGuide(state.id);
      }
      state = { kind: 'idle' };
      ctx.invalidate();
    },
    onKey(ctx, event) {
      if (event.key === 'Escape') {
        const busy = state.kind !== 'idle';
        reset(ctx);
        return busy;
      }
      const id = ctx.store.getState().selection.guide;
      if (!means(event, 'delete') || id === undefined) return false;
      ctx.dispatch(deleteGuide(id));
      return true;
    },
    /** The guide being placed would otherwise catch the pointer it follows. */
    snapExclusions: () => (state.kind === 'dragging' ? [state.id] : []),
    underway: () => state.kind !== 'idle',
    onDeactivate(ctx) {
      reset(ctx);
    },
  };
}
