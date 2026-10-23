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
