import { addGuide, deleteGuide } from '@leathercad/document';
import { means, type Tool } from '../tool.js';

/** Place a horizontal guide; its exact position and angle are edited in Properties. */
export function createGuideTool(nextId: () => string): Tool {
  return {
    id: 'guide',
    label: 'Guide',
    cursor: 'crosshair',
    onPointerDown(ctx, event) {
      if (event.button !== 0) return;
      const id = nextId();
      ctx.dispatch(addGuide({ id, origin: event.at, angleRad: event.shiftKey ? Math.PI / 2 : 0 }));
      ctx.store.selectGuide(id);
      ctx.invalidate();
    },
    onKey(ctx, event) {
      const id = ctx.store.getState().selection.guide;
      if (!means(event, 'delete') || id === undefined) return false;
      ctx.dispatch(deleteGuide(id));
      return true;
    },
  };
}
