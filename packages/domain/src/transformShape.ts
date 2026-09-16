import { EPS_ANGLE, EPS_AREA, approxZero, err, ok, type Result } from '@leathercad/core';
import { MatOps, SegmentOps, type Mat2x3 } from '@leathercad/geometry';

import type { ParametricShape, TextSource } from './feature.js';
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
 * The same rule, for a label: a transform it cannot express is refused.
 *
 * Moving and turning are free — `at` and `rotationRad` hold them exactly — and
 * an even scale is just a bigger size. An uneven one would stretch the letters,
 * which is neither expressible as a size nor something anyone wants printed,
 * so it is refused with a reason rather than silently ignored (X1, X9).
 *
 * A **mirror** is refused outright. It is a similarity, so it would otherwise
 * slip through and come out as a rotation — the words the right way round in
 * the wrong place, which is the same silent wrongness as defect D2. Mirrored
 * text reads backwards, and nothing in a leather pattern wants that; slice
 * 4.8's linked counterpart will have to say what a mirrored label means, and
 * this deliberately does not guess.
 */
export function transformTextSource(source: TextSource, m: Mat2x3): Result<TextSource, Problem> {
  if (isSingular(m)) return err(problem('TRANSFORM_FLATTENS', {}));
  if (MatOps.isMirrored(m)) return err(problem('TEXT_WOULD_READ_BACKWARDS', {}));
  if (!MatOps.isSimilarity(m)) return err(problem('TEXT_WOULD_DISTORT', {}));

  return ok({
    ...source,
    at: MatOps.apply(m, source.at),
    sizeMm: source.sizeMm * MatOps.uniformScaleOf(m),
    rotationRad: source.rotationRad + rotationOf(m),
  });
}

/**
 * A rectangle's parameters are axis-aligned in its *own* frame, so a
 * non-uniform scale is expressible only while that frame is still square to
 * the scale axes. Stretching a rectangle sitting at 30° shears it, and a
 * sheared rectangle has no right angles left for `width` and `height` to mean.
 *
 * Everything here is computed from the rectangle's **centre** and its own two
 * axes, because that is what the parameters actually mean: `pathForShape`
 * builds an axis-aligned box from `origin` and then turns it about its own
 * centre. Transforming `origin` directly — what this used to do — moves the
 * box somewhere the rotation then swings away from, which is defect D2: a
 * mirrored panel stayed where it was with its rounded corners diagonally
 * opposite.
 */
function transformRect(
  shape: Extract<ParametricShape, { type: 'rect' }>,
  m: Mat2x3,
): Result<ParametricShape, Problem> {
  const similarity = MatOps.isSimilarity(m);
  if (!similarity && !isAxisAligned(shape.rotation)) return err(problem('WOULD_SHEAR', {}));

  // The rectangle's own axes, and where the transform sends them. Their
  // lengths are the scale along each of *its* axes, which is why a turned
  // rectangle scales correctly without the matrix having to be inspected.
  const along = { x: Math.cos(shape.rotation), y: Math.sin(shape.rotation) };
  const up = { x: -Math.sin(shape.rotation), y: Math.cos(shape.rotation) };
  const alongImage = MatOps.applyDirection(m, along);
  const upImage = MatOps.applyDirection(m, up);

  // A similarity scales both axes by the same factor, and taking it from the
  // determinant keeps a plain rotation exact — measuring the turned axis
  // instead leaves a 105 mm panel 104.99999999999999 mm wide.
  const scale = MatOps.uniformScaleOf(m);
  const width = shape.width * (similarity ? scale : Math.hypot(alongImage.x, alongImage.y));
  const height = shape.height * (similarity ? scale : Math.hypot(upImage.x, upImage.y));

  // A mirror turns the rectangle's frame left-handed, which no `rotation` can
  // express — so one of its two axes is flipped to turn it back, and the
  // corners travel with it. Either axis restores handedness; the one that
  // leaves the rectangle closest to the way it was lying is the one a person
  // would expect, so a mirrored panel comes back the same way up.
  const keepingAlong = Math.atan2(alongImage.y, alongImage.x);
  const flipAlong =
    MatOps.isMirrored(m) &&
    turnedBy(keepingAlong + Math.PI, shape.rotation) < turnedBy(keepingAlong, shape.rotation);

  // Normalised for a mirror only. `atan2` already answers in (−π, π], and
  // adding the half turn can push it past that — a flipped panel reporting
  // 360° instead of 0° is the sort of thing a user retypes by hand. A plain
  // rotation still accumulates, as it did before, so repeated turns behave
  // the way the panel's stepper implies.
  const rotation = MatOps.isMirrored(m)
    ? halfTurnRange(flipAlong ? keepingAlong + Math.PI : keepingAlong)
    : keepingAlong;
  const centre = MatOps.apply(m, {
    x: shape.origin.x + shape.width / 2,
    y: shape.origin.y + shape.height / 2,
  });

  const corners = !MatOps.isMirrored(m)
    ? shape.radii
    : flipAlong
      ? mirrorRadiiLeftToRight(shape.radii)
      : mirrorRadiiBottomToTop(shape.radii);

  return ok({
    ...shape,
    // `origin` is the un-turned box's lower-left corner, so it is read back
    // out of the centre rather than transformed on its own.
    origin: { x: centre.x - width / 2, y: centre.y - height / 2 },
    rotation,
    width,
    height,
    // A corner stretched unevenly is no longer a circular arc, so only a
    // similarity scales the radii — and the corners are the part nobody wants
    // distorted.
    radii: similarity ? scaleRadii(corners, scale) : corners,
  });
}

/** The same angle, brought back into (−π, π]. */
function halfTurnRange(angle: number): number {
  const turn = Math.PI * 2;
  const wrapped = ((angle % turn) + turn) % turn;
  return wrapped > Math.PI ? wrapped - turn : wrapped;
}

/** How far apart two angles are, ignoring which way round. */
function turnedBy(a: number, b: number): number {
  const turn = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(turn, Math.PI * 2 - turn);
}

function mirrorRadiiLeftToRight(radii: CornerRadii): CornerRadii {
  return {
    bottomLeft: radii.bottomRight,
    bottomRight: radii.bottomLeft,
    topLeft: radii.topRight,
    topRight: radii.topLeft,
  };
}

function mirrorRadiiBottomToTop(radii: CornerRadii): CornerRadii {
  return {
    bottomLeft: radii.topLeft,
    bottomRight: radii.topRight,
    topLeft: radii.bottomLeft,
    topRight: radii.bottomRight,
  };
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

type CornerRadii = Extract<ParametricShape, { type: 'rect' }>['radii'];

function scaleRadii(radii: CornerRadii, scale: number): CornerRadii {
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
