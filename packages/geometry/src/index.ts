/**
 * @leathercad/geometry — pure millimetre mathematics.
 *
 * No DOM, no canvas, no colour, no file formats, no state, no randomness, no
 * clock. Imports only @leathercad/core. This is what makes the engine testable
 * in milliseconds, property-testable at scale, runnable from CI, and
 * swappable for a WASM implementation later.
 *
 * **Millimetres and radians. The Y axis points up.** Angles are
 * counter-clockwise from +X. Canvas2D and SVG are Y-down, so the flip happens
 * in the renderer and the SVG writer — never here.
 *
 * See docs/geometry.md.
 */

export * as PathOps from './path/index.js';
export * as Shapes from './shapes.js';
export * as PolynomialOps from './polynomial.js';
export * as SegmentOps from './segment/index.js';
export * as Vec2Ops from './vec2.js';
export * as MatOps from './mat2x3.js';
export * as RectOps from './rect.js';

export type { Vec2 } from './vec2.js';
export type { Mat2x3 } from './mat2x3.js';
export type { Rect } from './rect.js';
export type {
  ArcSegment,
  CubicSegment,
  LineSegment,
  Segment,
  SegmentKind,
} from './segment/index.js';

export { arc, cubic, line, quadraticToCubic } from './segment/index.js';

export type { FillRule, Orientation, Path } from './path/index.js';
export { closed, open, path, polyline } from './path/index.js';

export type { CornerRadii } from './shapes.js';
export { circle, rect, roundedRect, uniformRadii } from './shapes.js';

export { solveCubic, solveLinear, solveQuadratic } from './polynomial.js';

export type { OffsetOptions } from './ops/offset.js';
export { offsetPath } from './ops/offset.js';

export type { DistributedPoint, Distribution, DistributeOptions } from './ops/distribute.js';
export { distributeAlongPath } from './ops/distribute.js';

export {
  ARC_CUBIC_ERROR_COEFFICIENT,
  EXPORT_TOLERANCE_MM,
  SCREEN_TOLERANCE_MM,
  maxArcStepForTolerance,
} from './tolerance.js';

// The handful of names common enough to be worth importing directly.
export {
  ZERO,
  UNIT_X,
  UNIT_Y,
  add,
  angleOf,
  cross,
  dist,
  distSq,
  dot,
  len,
  lenSq,
  lerp,
  midpoint,
  normalise,
  perp,
  scale,
  sub,
  tryNormalise,
  vec,
} from './vec2.js';

export { IDENTITY, apply, applyDirection, compose, composeAll, invert } from './mat2x3.js';
