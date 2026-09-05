import type { Vec2 } from '@leathercad/geometry';

/** Shift snaps to 15° — fine enough for a 30° gusset, coarse enough to feel. */
export const ANGLE_STEP = Math.PI / 12;

/**
 * Snaps the direction from `from` to a multiple of 15°, keeping the distance.
 *
 * Shared by every tool that places a point against a previous one, so the
 * constraint means the same thing everywhere. A tool that grew its own copy
 * would drift — and Shift behaving differently between the polyline and the
 * arc is the kind of difference nobody reports and everybody feels.
 */
export function constrainToAngleStep(from: Vec2 | undefined, at: Vec2, shift: boolean): Vec2 {
  if (!shift || from === undefined) return at;

  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const run = Math.hypot(dx, dy);
  if (run === 0) return at;

  const snapped = Math.round(Math.atan2(dy, dx) / ANGLE_STEP) * ANGLE_STEP;
  return { x: from.x + Math.cos(snapped) * run, y: from.y + Math.sin(snapped) * run };
}
