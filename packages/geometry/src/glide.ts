import { EPS_POINT, approxEq, approxZero, type Mm } from '@leathercad/core';

import { compose, fromMirror, fromTranslation, type Mat2x3 } from './mat2x3.js';
import type { Vec2 } from './vec2.js';

/**
 * Glide reflections: a reflection across a line, then a slide along it.
 *
 * These are exactly the **orientation-reversing isometries** of the plane —
 * every way of putting a reflected copy of something somewhere. That
 * completeness is the whole reason the mirror derivation stores an axis and a
 * glide and nothing else (ADR 0012): any move, turn or flip applied to a
 * mirrored counterpart composes to another one of these, so it can always be
 * absorbed back into the same two parameters. There is no gesture that leaves
 * the representation unable to describe the result.
 *
 * Pure maths over `Mat2x3`: the domain's `axis` and `glideMm` are these
 * numbers, but nothing here knows that.
 */

/** A glide reflection, in the canonical form `decomposeGlide` returns. */
export interface Glide {
  /**
   * A point on the axis — the foot of the perpendicular from the world origin.
   *
   * Canonical on purpose: a line has infinitely many points, and picking an
   * arbitrary one would make two equal mirrors store unequal parameters and
   * compare unequal.
   */
  readonly origin: Vec2;
  /** The axis direction, normalised to `[0, π)`. */
  readonly angleRad: number;
  /** How far along the axis, after reflecting. Signed against `angleRad`. */
  readonly glideMm: Mm;
}

/** The transform: reflect across the axis, then slide `glideMm` along it. */
export function glideMatrix(origin: Vec2, angleRad: number, glideMm: Mm): Mat2x3 {
  const along = { x: Math.cos(angleRad) * glideMm, y: Math.sin(angleRad) * glideMm };
  return compose(fromMirror(origin, angleRad), fromTranslation(along));
}

/**
 * The axis and glide a transform is, or `null` if it is not one.
 *
 * **`null` is how scaling a counterpart is refused** — not by a special case
 * for scale, but because a scaled reflection is not a glide reflection at all.
 * Anything that is not an orientation-reversing isometry comes back null:
 * scales, shears, rotations, translations and the identity alike.
 *
 * The maths, because it is short enough to check by eye. The linear part of an
 * orientation-reversing isometry is a reflection about some line through the
 * origin at angle φ:
 *
 * ```
 * [ cos 2φ   sin 2φ ]
 * [ sin 2φ  -cos 2φ ]
 * ```
 *
 * so `2φ = atan2(b, a)`. Splitting the translation into a part **along** that
 * direction and a part **across** it: the along-part is the glide, and the
 * across-part offsets the axis by **half** of itself, because translating a
 * mirror line across by `t` moves the image by `2t`.
 */
export function decomposeGlide(m: Mat2x3): Glide | null {
  // An isometry with det = -1. Checked on the matrix rather than assumed:
  // this is the gate that refuses a scaled or sheared counterpart.
  const det = m.a * m.d - m.b * m.c;
  if (!approxEq(det, -1, 1e-9)) return null;
  if (!approxEq(m.a * m.a + m.b * m.b, 1, 1e-9)) return null;
  if (!approxEq(m.c * m.c + m.d * m.d, 1, 1e-9)) return null;
  if (!approxZero(m.a * m.c + m.b * m.d, 1e-9)) return null;

  // A line at θ and at θ + π is the same line, and only one of them may be
  // stored. The reflection matrix is identical for both, so the direction is
  // taken from the *normalised* angle and the glide's sign follows from it —
  // rather than being normalised afterwards and having to be flipped to match.
  let angleRad = Math.atan2(m.b, m.a) / 2;
  angleRad %= Math.PI;
  if (angleRad < 0) angleRad += Math.PI;
  // A hair under a half-turn is a hair over nothing. Without this an angle
  // that wraps lands exactly on π, which is the one value `[0, π)` excludes.
  if (approxEq(angleRad, Math.PI, 1e-12)) angleRad = 0;

  const alongX = Math.cos(angleRad);
  const alongY = Math.sin(angleRad);

  const glideMm = m.e * alongX + m.f * alongY;
  // Across the axis, halved: the axis sits midway between a point and its image.
  const across = (m.e * -alongY + m.f * alongX) / 2;

  return {
    origin: { x: -alongY * across, y: alongX * across },
    angleRad,
    glideMm,
  };
}

/** Whether two glide reflections are the same placement. */
export function glideEquals(a: Glide, b: Glide, eps: number = EPS_POINT): boolean {
  return (
    Math.abs(a.origin.x - b.origin.x) <= eps &&
    Math.abs(a.origin.y - b.origin.y) <= eps &&
    approxEq(a.angleRad, b.angleRad, eps) &&
    approxEq(a.glideMm, b.glideMm, eps)
  );
}
