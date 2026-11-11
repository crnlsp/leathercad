import type { AlignmentMark } from '@leathercad/domain';
import { PathOps, Vec2Ops, type Path } from '@leathercad/geometry';

import { ALIGNMENT_MARK } from './theme/index.js';

/**
 * An alignment mark as it is drawn, on the board and on paper alike: one
 * straight tick along its inward normal, in millimetres.
 */
export function alignmentTick({ point, inward }: AlignmentMark): Path {
  const { gapMm, lengthMm } = ALIGNMENT_MARK;
  return PathOps.polyline(
    [
      Vec2Ops.add(point, Vec2Ops.scale(inward, gapMm)),
      Vec2Ops.add(point, Vec2Ops.scale(inward, gapMm + lengthMm)),
    ],
    false,
  );
}
