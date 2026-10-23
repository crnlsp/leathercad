import { EPS_ANGLE, approxZero, assertFinite } from '@leathercad/core';
import { Vec2Ops, type Vec2 } from '@leathercad/geometry';

import type { Guide } from './feature.js';

type GuideLine = Pick<Guide, 'origin' | 'angleRad'>;

function direction(guide: GuideLine): Vec2 {
  Vec2Ops.assertFiniteVec(guide.origin, 'guide origin');
  assertFinite(guide.angleRad, 'guide angle');
  return { x: Math.cos(guide.angleRad), y: Math.sin(guide.angleRad) };
}

/** The nearest point on the infinite guide; finite world coordinates only. */
export function projectToGuide(guide: GuideLine, at: Vec2): Vec2 {
  Vec2Ops.assertFiniteVec(at, 'point');
  const along = direction(guide);
  return Vec2Ops.add(
    guide.origin,
    Vec2Ops.scale(along, Vec2Ops.dot(Vec2Ops.sub(at, guide.origin), along)),
  );
}

/** The guide through `a` and `b`, kept at `a`; null when they coincide. */
export function guideThrough(a: Vec2, b: Vec2): GuideLine | null {
  Vec2Ops.assertFiniteVec(a, 'point');
  Vec2Ops.assertFiniteVec(b, 'point');
  if (Vec2Ops.equals(a, b)) return null;
  return { origin: a, angleRad: Vec2Ops.angleOf(Vec2Ops.sub(b, a)) };
}

export type GuideSide = 'above' | 'below' | 'left' | 'right';

const TOWARDS: Readonly<Record<GuideSide, Vec2>> = {
  above: { x: 0, y: 1 },
  below: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The two sides a maker names: above/below a guide nearer horizontal, left/right otherwise. */
export function guideSides(guide: GuideLine): readonly [GuideSide, GuideSide] {
  const along = direction(guide);
  return Math.abs(along.x) >= Math.abs(along.y) ? ['above', 'below'] : ['left', 'right'];
}

/**
 * The same guide moved `distanceMm` across itself, towards `side`. Null when
 * the guide runs that way, so it has no such side (a horizontal guide's left).
 */
export function parallelGuide<T extends GuideLine>(
  guide: T,
  side: GuideSide,
  distanceMm: number,
): T | null {
  assertFinite(distanceMm, 'distance');
  const normal = Vec2Ops.perp(direction(guide));
  const facing = Vec2Ops.dot(normal, TOWARDS[side]);
  if (approxZero(facing)) return null;
  return {
    ...guide,
    origin: Vec2Ops.add(guide.origin, Vec2Ops.scale(normal, Math.sign(facing) * distanceMm)),
  };
}

/** Null for parallel/coincident lines, including angles within EPS_ANGLE. */
export function guideCrossing(a: GuideLine, b: GuideLine): Vec2 | null {
  const da = direction(a);
  const db = direction(b);
  const determinant = Vec2Ops.cross(da, db);
  if (approxZero(determinant, EPS_ANGLE)) return null;
  return Vec2Ops.add(
    a.origin,
    Vec2Ops.scale(da, Vec2Ops.cross(Vec2Ops.sub(b.origin, a.origin), db) / determinant),
  );
}
