import { addMeasurement } from '@leathercad/document';
import {
  evaluate,
  problem,
  type FeatureId,
  type MeasureKind,
  type MeasureRef,
  type Problem,
  type ResolvedPart,
  type ResolvedProject,
} from '@leathercad/domain';
import { CANVAS, dotsItem, pathItem, type DisplayList } from '@leathercad/render';
import { polyline } from '@leathercad/geometry';

import { anchorNear, anchorPointOf } from '../anchorPick.js';
import type { Tool, ToolContext } from '../tool.js';

type State = { readonly kind: 'idle' } | { readonly kind: 'placing'; readonly from: MeasureRef };

/**
 * How near a corner a click must land, in pixels.
 *
 * Turned into millimetres by the viewport's own `pickToleranceMm`, which is
 * what hit-testing and snapping already use — it accounts for device pixel
 * ratio, and doing the arithmetic by hand here made the target a fraction of
 * its intended size on a high-density display.
 */
const PICK_RADIUS_PX = 12;

/**
 * Two corners, and the distance between them.
 *
 * Both ends are **anchors**, so the number keeps meaning the same thing while
 * the drawing changes around it — see `anchorPick.ts`. A click that is not on
 * a corner is **refused with a reason** rather than quietly making a dimension
 * to a point, which would go stale without saying so.
 */
export function createMeasureTool(nextId: () => string, measure: () => MeasureKind): Tool {
  let state: State = { kind: 'idle' };
  /** Why the last click did not land, until the next one. */
  let refusal: Problem | null = null;
  let cursorMm = { x: 0, y: 0 };

  const reset = (ctx: ToolContext): void => {
    state = { kind: 'idle' };
    ctx.invalidate();
  };

  return {
    id: 'measure',
    label: 'Measure',
    cursor: 'crosshair',

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;
      refusal = null;

      const resolved = evaluate(ctx.store.getState().document.project);
      const tolerance = ctx.viewport.pickToleranceMm(PICK_RADIUS_PX);
      let ref = anchorNear(resolved, event.at, tolerance);

      // The second end is on the first end's piece (Q11): a corner there wins
      // over one on a neighbour touching it, and a corner only on another
      // piece is refused with a reason rather than measured.
      if (ref !== null && state.kind === 'placing') {
        const home = partOf(resolved, state.from.featureId);
        const other = partOf(resolved, ref.featureId);
        if (home !== undefined && other !== home) {
          const own = anchorNear({ ...resolved, parts: [home] }, event.at, tolerance);
          if (own === null) {
            refusal = problem('MEASURE_ACROSS_PARTS', { otherPartName: other?.part.name ?? '' });
            ctx.invalidate();
            return;
          }
          ref = own;
        }
      }

      if (ref === null) {
        // X1: nothing happens, and the reason is on screen.
        refusal = problem('MEASURE_NEEDS_ANCHOR', {});
        ctx.invalidate();
        return;
      }

      if (state.kind === 'idle') {
        state = { kind: 'placing', from: ref };
        ctx.invalidate();
        return;
      }

      // A dimension from a corner to itself measures nothing.
      if (ref.featureId === state.from.featureId && ref.anchor === state.from.anchor) {
        refusal = problem('MEASURE_NEEDS_ANCHOR', {});
        ctx.invalidate();
        return;
      }

      const id = nextId() as FeatureId;
      ctx.dispatch(addMeasurement(id, measure(), state.from, ref));
      ctx.store.select([id]);
      reset(ctx);
    },

    onPointerMove(ctx, event) {
      cursorMm = event.at;
      if (state.kind === 'placing') ctx.invalidate();
    },

    notice: () => refusal,

    onKey(ctx, event) {
      if (event.key === 'Escape') {
        refusal = null;
        reset(ctx);
      }
    },

    buildOverlay(ctx): DisplayList {
      const resolved = evaluate(ctx.store.getState().document.project);

      // Every corner that can be measured from, so the maker can see what the
      // tool will take before they click.
      const corners: { x: number; y: number }[] = [];
      for (const part of resolved.parts) {
        for (const entry of part.features) {
          if (!entry.ok || !entry.feature.visible) continue;
          for (const [index, at] of entry.anchors.entries()) {
            if (at === null) continue;
            const point = anchorPointOf(resolved, {
              kind: 'anchor',
              featureId: entry.feature.id,
              anchor: index,
            });
            if (point !== null) corners.push(point);
          }
        }
      }

      const items = [dotsItem('construction', corners, 3, CANVAS.overlay.preview)];

      if (state.kind === 'placing') {
        const from = anchorPointOf(resolved, state.from);
        if (from !== null) {
          items.push(
            pathItem('construction', polyline([from, cursorMm], false), {
              colour: CANVAS.overlay.preview,
              widthPx: 1,
              dashPx: [4, 3],
            }),
          );
        }
      }

      return { items };
    },

    onDeactivate(ctx) {
      refusal = null;
      reset(ctx);
    },
  };
}

/** The resolved part holding a feature. */
function partOf(resolved: ResolvedProject, featureId: FeatureId): ResolvedPart | undefined {
  return resolved.parts.find((part) => part.features.some((e) => e.feature.id === featureId));
}
