import { addTextLabel } from '@leathercad/document';
import { problem, type FeatureId, type Problem } from '@leathercad/domain';

import type { Tool, ToolContext } from '../tool.js';
import { targetPart } from './commitDrawn.js';

/**
 * Places a label where the user clicks.
 *
 * A click rather than a drag: a label's size is a number you set, not
 * something you rubber-band out, and dragging would make its size depend on
 * how far the mouse travelled at whatever zoom happened to be on.
 *
 * It lands with the word "Text" and the selection on it, so the panel is
 * already showing the field to type into. Placing something empty and
 * invisible would be worse than placing something obviously provisional.
 */
export function createTextTool(nextId: () => string): Tool {
  return {
    id: 'text',
    label: 'Text',
    cursor: 'text',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;

      const partId = targetPart(ctx);
      if (partId === null) return;

      const featureId = nextId() as FeatureId;
      ctx.dispatch(addTextLabel(partId, featureId, event.at));
      ctx.store.select([featureId]);
    },

    notice(ctx: ToolContext): Problem | null {
      if (targetPart(ctx) !== null) return null;

      // A label belongs to a part, like a fold line does: features live in
      // parts, and one floating outside a part would have nowhere to be.
      const spansParts = ctx.store.getState().selection.features.size > 0;
      return spansParts
        ? problem('TARGET_SPANS_PARTS', { what: 'label' })
        : problem('NO_TARGET_PART', { what: 'label' });
    },
  };
}
