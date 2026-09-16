import { EPS_ANGLE, EPS_AREA, approxZero, err, ok, type Result } from '@leathercad/core';
import { MatOps, SegmentOps, type Mat2x3 } from '@leathercad/geometry';

import type { ParametricShape } from './feature.js';
import { problem, type Problem } from './problems/index.js';

/**
 * Applies a transform to a parametric shape, through its parameters.
 *
 * `geometry.md` §4.2 rule 1: parametric shapes are resized through their
 * parameters, not by transforming their geometry — stretching a 105 × 75 panel
 * changes `width` and `height` and regenerates the path, so the corners stay
 * circular instead of becoming ellipses.
 *
 * What rule 1 does not say is what happens when the parameters *cannot*
 * express the result. This is that answer, and it is the rule for every
 * parametric shape added from here on — invariant X9:
 *
 * > A transformation that cannot preserve a shape's semantic representation
 * > must not silently demote it to another representation.
 *
 * So a non-uniformly scaled circle is **refused**, not quietly flattened into
 * cubics that can never be typed as a radius again. The caller gets the
 * problem, which the message catalogue turns into words for the person holding
 * the mouse. Rule 2 — drawn paths convert their arcs to cubics — is unaffected:
 * a drawn path has no parameters to protect.
 */
export function transformShape(
  shape: ParametricShape,
  m: Mat2x3,
): Result<ParametricShape, Problem> {
  if (isSingular(m)) return err(problem('TRANSFORM_FLATTENS', {}));

  switch (shape.type) {
    case 'rect':
      return transformRect(shape, m);
    case 'circle':
      return transformCircle(shape, m);
    case 'arc':
      return transformArc(shape, m);
  }
}

/**
 * A rectangle's parameters are axis-aligned in its *own* frame, so a
 * non-uniform scale is expressible only while that frame is still square to
 * the scale axes. Stretching a rectangle sitting at 30° shears it, and a
 * sheared rectangle has no right angles left for `width` and `height` to mean.
 */
function transformRect(
  shape: Extract<ParametricShape, { type: 'rect' }>,
  m: Mat2x3,
): Result<ParametricShape, Problem> {
  const origin = MatOps.apply(m, shape.origin);
  const rotation = shape.rotation + rotationOf(m);

  if (MatOps.isSimilarity(m)) {
    const scale = MatOps.uniformScaleOf(m);
    return ok({
      ...shape,
      origin,
      rotation,
      width: shape.width * scale,
      height: shape.height * scale,
      radii: scaleRadii(shape.radii, scale),
    });
  }

  if (!isAxisAligned(shape.rotation)) return err(problem('WOULD_SHEAR', {}));

  // Axis-aligned and axis-aligned scaling: exactly rule 1's worked example.
  // The radii do not scale, because a corner stretched unevenly is no longer
  // a circular arc — and the corners are the part nobody wants distorted.
  return ok({
    ...shape,
    origin,
    rotation,
    width: shape.width * Math.abs(m.a),
    height: shape.height * Math.abs(m.d),
  });
}

function transformCircle(
  shape: Extract<ParametricShape, { type: 'circle' }>,
  m: Mat2x3,
): Result<ParametricShape, Problem> {
  if (!MatOps.isSimilarity(m)) return err(problem('WOULD_BECOME_ELLIPSE', { shape: 'circle' }));

  return ok({
    ...shape,
    centre: MatOps.apply(m, shape.centre),
    radius: shape.radius * MatOps.uniformScaleOf(m),
  });
}

/**
 * Delegates to `SegmentOps.ArcOps.transform`, which already implements this for arc
 * *segments* — including the two details that are easy to get wrong: the new
 * start angle comes from applying the matrix to the start direction rather
 * than pulling a rotation out of it, so mirrors fall out for free; and a
 * mirror negates the sweep, because an arc that bent one way bends the other.
 *
 * §4.2 says that decision is made in one place and must not be duplicated by
 * callers. This is a caller.
 */
function transformArc(
  shape: Extract<ParametricShape, { type: 'arc' }>,
  m: Mat2x3,
): Result<ParametricShape, Problem> {
  const ellipse = problem('WOULD_BECOME_ELLIPSE', { shape: 'arc' });
  if (!MatOps.isSimilarity(m)) return err(ellipse);

  const [segment] = SegmentOps.ArcOps.transform(
    {
      kind: 'arc',
      centre: shape.centre,
      radius: shape.radius,
      startAngle: shape.startAngle,
      sweepAngle: shape.sweepAngle,
    },
    m,
  );

  // Unreachable: a similarity always yields exactly one arc segment. Checked
  // rather than asserted, because "unreachable" is where the next bug lives.
  if (segment === undefined || segment.kind !== 'arc') return err(ellipse);

  return ok({
    ...shape,
    centre: segment.centre,
    radius: segment.radius,
    startAngle: segment.startAngle,
    sweepAngle: segment.sweepAngle,
  });
}

function scaleRadii(
  radii: Extract<ParametricShape, { type: 'rect' }>['radii'],
  scale: number,
): Extract<ParametricShape, { type: 'rect' }>['radii'] {
  return {
    topLeft: radii.topLeft * scale,
    topRight: radii.topRight * scale,
    bottomLeft: radii.bottomLeft * scale,
    bottomRight: radii.bottomRight * scale,
  };
}

/** The rotation `m` applies, read off the transformed +X direction. */
function rotationOf(m: Mat2x3): number {
  const direction = MatOps.applyDirection(m, { x: 1, y: 0 });
  return Math.atan2(direction.y, direction.x);
}

/** Square to the axes, to within a quarter turn. */
function isAxisAligned(rotation: number): boolean {
  const quarter = Math.PI / 2;
  return approxZero(rotation / quarter - Math.round(rotation / quarter), EPS_ANGLE);
}

function isSingular(m: Mat2x3): boolean {
  return approxZero(MatOps.determinant(m), EPS_AREA);
}
