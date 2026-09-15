import { quantise } from '@leathercad/core';
import { addHardwareHole } from '@leathercad/document';
import type { HardwareHole } from '@leathercad/domain';
import { Shapes, type Vec2 } from '@leathercad/geometry';
import { pathItem, type DisplayList } from '@leathercad/render';

import type { FeatureId } from '@leathercad/domain';
import type { Tool } from '../tool.js';
import { drawTargetNotice, targetPart } from './commitDrawn.js';

/** What the panel asks for and the tool places. */
export interface HardwareOptions {
  readonly diameterMm: number;
  readonly hardwareType: HardwareHole['hardwareType'];
}

export const DEFAULT_HARDWARE: HardwareOptions = { diameterMm: 4, hardwareType: 'rivet' };

/**
 * Places one hole for one piece of hardware.
 *
 * A click, not a drag: a punch has a size the user owns, so the diameter is
 * chosen rather than dragged out. That is the difference between this and the
 * circle tool, and the reason it is worth being a separate tool rather than a
 * mode of that one.
 *
 * Rows of holes — a belt's adjustment holes, rivets along a strap — are
 * deliberately not here. A row is a *set* distributed along a path at a pitch,
 * which is what `StitchHoleSet` already is; building it as repeated single
 * holes would be the wrong shape to later fix.
 */
export function createHardwareTool(
  nextId: () => string,
  options: () => HardwareOptions = () => DEFAULT_HARDWARE,
): Tool {
  let hoverMm: Vec2 | null = null;

  return {
    id: 'hardware',
    label: 'Hardware',
    cursor: 'crosshair',

    onPointerMove(ctx, event) {
      hoverMm = event.at;
      ctx.invalidate();
    },

    onPointerDown(ctx, event) {
      if (event.button !== 0) return;

      const partId = targetPart(ctx);
      if (partId === null) return;

      const featureId = nextId() as FeatureId;
      ctx.dispatch(
        addHardwareHole(partId, featureId, event.at, radiusOf(options()), options().hardwareType),
      );
      ctx.store.select([featureId]);
    },

    notice: drawTargetNotice,

    onKey(ctx) {
      hoverMm = null;
      ctx.invalidate();
    },

    buildOverlay(ctx): DisplayList {
      if (hoverMm === null || targetPart(ctx) === null) return { items: [] };

      // At true diameter, so what is previewed is what lands. A preview drawn
      // at a fixed pixel size would look the same for a 2 mm eyelet and a 6 mm
      // rivet, which are not remotely the same hole.
      return {
        items: [pathItem('hardware', Shapes.circle(hoverMm, radiusOf(options())), { widthPx: 1 })],
      };
    },

    onDeactivate(ctx) {
      hoverMm = null;
      ctx.invalidate();
    },
  };
}

/**
 * The radius, quantised.
 *
 * Halve **then** quantise: the stored number is the radius, so the radius is
 * what has to land on the 1e-4 mm grid. Quantising the typed diameter first
 * puts the radius on a 5e-5 grid whenever the last digit is odd — off the
 * quantum, in violation of CLAUDE.md invariant 8.
 */
function radiusOf(options: HardwareOptions): number {
  return quantise(options.diameterMm / 2);
}
