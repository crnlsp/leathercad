import {
  depthBelowOpening,
  evaluate,
  pocketSize,
  type FeatureId,
  type PocketSize,
  type Project,
} from '@leathercad/domain';
import type { Path } from '@leathercad/geometry';

import {
  drawRectangle,
  outlineOf,
  punchHoles,
  stitchLeavingOpen,
  type Side,
} from '../harness/actions.js';
import type { Action } from '../harness/bench.js';

/**
 * Constructions several scenarios share, each the way a maker builds it with
 * the app's own tools. Their measurements are worked out in the comment beside
 * each, so a scenario's expected numbers can be checked by hand.
 */

/**
 * A pocket as the card holder's is made: a rectangle with 3 mm corners,
 * stitched 3 mm in on three sides, holes at the default iron, open on one side
 * (the top unless said).
 *
 * The 3 mm inset on 3 mm corners ends the stitching on each corner's centre,
 * 3 mm below the opening and 3 mm in from the side. So, open at the top:
 * - width between stitch lines = width − 6;
 * - stitch depth = height − 6;
 * - depth below the opening = height − 3.
 */
export function cardPocket(
  piece: string,
  size: { width: number; height: number; x?: number; y?: number; open?: Side },
): Action[] {
  return [
    drawRectangle(piece, {
      x: size.x ?? 0,
      y: size.y ?? 0,
      width: size.width,
      height: size.height,
      radius: 3,
      name: 'Pocket',
    }),
    stitchLeavingOpen(piece, size.open ?? 'top', 3),
    punchHoles(piece),
  ];
}

function pathOf(project: Project, id: FeatureId): Path | null {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((f) => f.feature.id === id);
  return entry?.ok === true ? entry.path : null;
}

/** What Properties and the selection bar read for this stitching: its pocket reading, or none. */
export function stitchReading(project: Project, stitch: FeatureId): PocketSize | null {
  const path = pathOf(project, stitch);
  return path === null ? null : pocketSize(path);
}

/** The depth from the opening the leather makes to the farthest stitching, as DR8 reads it. */
export function depthFromOpening(project: Project, piece: string, stitch: FeatureId) {
  const path = pathOf(project, stitch);
  const outline = pathOf(project, outlineOf(piece));
  return path === null || outline === null ? null : depthBelowOpening(path, outline);
}
