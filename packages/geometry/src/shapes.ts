import {
  approxZero,
  assertFinite,
  EPS_AREA,
  EPS_POINT,
  type Mm,
  type Radians,
} from '@leathercad/core';

import * as MatOps from './mat2x3.js';
import { closed as closedPath, open as openPath, type Path } from './path/index.js';
import * as SegmentOps from './segment/index.js';
import { arc, line as lineSegment, FULL_TURN, type Segment } from './segment/index.js';
import { EXPORT_TOLERANCE_MM } from './tolerance.js';
import { cross, dist, lenSq, sub, vec, type Vec2 } from './vec2.js';

/**
 * Constructors for the shapes a leatherworker actually draws.
 *
 * These return plain `Path`s. The *parametric record* — "this part is a
 * 105 x 75 rounded rectangle with 8 mm corners" — belongs in
 * `packages/domain`, not here. If parametric shapes were geometry types,
 * every algorithm in the engine would need a case for each one and would grow
 * a special case per product feature. See docs/geometry.md §4.6.
 */

/** Per-corner radii, counter-clockwise from the bottom-left. Y is up. */
export interface CornerRadii {
  readonly bottomLeft: Mm;
  readonly bottomRight: Mm;
  readonly topRight: Mm;
  readonly topLeft: Mm;
}

export function uniformRadii(radius: Mm): CornerRadii {
  return { bottomLeft: radius, bottomRight: radius, topRight: radius, topLeft: radius };
}

/** Counter-clockwise, starting at the bottom-left corner. */
export function rect(origin: Vec2, width: Mm, height: Mm): Path {
  assertFinite(width, 'rect width');
  assertFinite(height, 'rect height');

  const x1 = origin.x + width;
  const y1 = origin.y + height;
  return closedPath([
    lineSegment(vec(origin.x, origin.y), vec(x1, origin.y)),
    lineSegment(vec(x1, origin.y), vec(x1, y1)),
    lineSegment(vec(x1, y1), vec(origin.x, y1)),
    lineSegment(vec(origin.x, y1), vec(origin.x, origin.y)),
  ]);
}

/**
 * A rectangle with independent corner radii — the workhorse of leathercraft.
 *
 * Radii are clamped so that adjacent corners cannot overlap; a corner asking
 * for more than the space between it and its neighbour gets what is available
 * rather than producing self-intersecting nonsense. A zero radius emits no arc
 * at all, so a square corner is genuinely square rather than an arc of
 * vanishing sweep.
 */
export function roundedRect(origin: Vec2, width: Mm, height: Mm, radii: CornerRadii | Mm): Path {
  assertFinite(width, 'roundedRect width');
  assertFinite(height, 'roundedRect height');

  const requested = typeof radii === 'number' ? uniformRadii(radii) : radii;
  const r = clampRadii(requested, Math.abs(width), Math.abs(height));

  const x0 = Math.min(origin.x, origin.x + width);
  const y0 = Math.min(origin.y, origin.y + height);
  const x1 = x0 + Math.abs(width);
  const y1 = y0 + Math.abs(height);

  const quarter = Math.PI / 2;
  const segments: Segment[] = [];

  const push = (from: Vec2, to: Vec2): void => {
    if (Math.hypot(to.x - from.x, to.y - from.y) > 0) segments.push(lineSegment(from, to));
  };

  // Bottom edge, then anticlockwise around.
  push(vec(x0 + r.bottomLeft, y0), vec(x1 - r.bottomRight, y0));
  if (r.bottomRight > 0) {
    segments.push(
      arc(vec(x1 - r.bottomRight, y0 + r.bottomRight), r.bottomRight, -quarter, quarter),
    );
  }

  push(vec(x1, y0 + r.bottomRight), vec(x1, y1 - r.topRight));
  if (r.topRight > 0) {
    segments.push(arc(vec(x1 - r.topRight, y1 - r.topRight), r.topRight, 0, quarter));
  }

  push(vec(x1 - r.topRight, y1), vec(x0 + r.topLeft, y1));
  if (r.topLeft > 0) {
    segments.push(arc(vec(x0 + r.topLeft, y1 - r.topLeft), r.topLeft, quarter, quarter));
  }

  push(vec(x0, y1 - r.topLeft), vec(x0, y0 + r.bottomLeft));
  if (r.bottomLeft > 0) {
    segments.push(arc(vec(x0 + r.bottomLeft, y0 + r.bottomLeft), r.bottomLeft, Math.PI, quarter));
  }

  return closedPath(segments);
}

/** Counter-clockwise, starting at the rightmost point. */
export function circle(centre: Vec2, radius: Mm): Path {
  assertFinite(radius, 'circle radius');
  return closedPath([arc(centre, Math.abs(radius), 0, Math.PI * 2)]);
}

/**
 * Shrinks radii until adjacent corners stop competing for the same edge.
 *
 * Scaling both corners of an over-subscribed edge by the same factor keeps
 * their proportions, which looks deliberate; clamping each independently would
 * silently turn an asymmetric design symmetric.
 */
function clampRadii(radii: CornerRadii, width: Mm, height: Mm): CornerRadii {
  const clamped = {
    bottomLeft: Math.max(0, radii.bottomLeft),
    bottomRight: Math.max(0, radii.bottomRight),
    topRight: Math.max(0, radii.topRight),
    topLeft: Math.max(0, radii.topLeft),
  };

  const edges: ReadonlyArray<readonly [keyof CornerRadii, keyof CornerRadii, Mm]> = [
    ['bottomLeft', 'bottomRight', width],
    ['topLeft', 'topRight', width],
    ['bottomLeft', 'topLeft', height],
    ['bottomRight', 'topRight', height],
  ];

  let factor = 1;
  for (const [a, b, available] of edges) {
    const wanted = clamped[a] + clamped[b];
    if (wanted > available && wanted > 0) factor = Math.min(factor, available / wanted);
  }

  if (factor >= 1) return clamped;
  return {
    bottomLeft: clamped.bottomLeft * factor,
    bottomRight: clamped.bottomRight * factor,
    topRight: clamped.topRight * factor,
    topLeft: clamped.topLeft * factor,
  };
}

export { polyline } from './path/index.js';

/**
 * A single straight segment, as an open path.
 *
 * `segment.line` returns a `Segment`; this returns the `Path` a caller can
 * draw, measure or offset. Rejects a zero-length line, which has no direction
 * and would break every operation that asks for one.
 */
export function line(a: Vec2, b: Vec2): Path {
  if (approxZero(dist(a, b), EPS_POINT)) {
    throw new RangeError(
      'lineShape needs two distinct points: a zero-length line has no direction',
    );
  }

  return openPath([lineSegment(a, b)]);
}

/**
 * An ellipse, counter-clockwise, centred on `centre` and turned by `rotation`.
 *
 * An ellipse is the affine image of a circle, and an affine map takes cubics
 * to cubics exactly — so this builds a unit circle, converts it to cubics at a
 * tolerance tightened by the largest radius, and transforms the result. The
 * subdivision is therefore tolerance-driven rather than the usual fixed four
 * Béziers, whose 0.027 % radial error is 0.027 mm on a 100 mm ellipse: five
 * times the export tolerance, and visible on a cut line.
 *
 * There is no ellipse in the `Segment` union on purpose. Only lines, arcs and
 * cubics exist, so every algorithm handles three cases rather than four.
 */
export function ellipse(centre: Vec2, rx: Mm, ry: Mm, rotation: Radians): Path {
  assertFinite(rx, 'ellipse rx');
  assertFinite(ry, 'ellipse ry');
  assertFinite(rotation, 'ellipse rotation');
  assertFinite(centre.x, 'ellipse centre.x');
  assertFinite(centre.y, 'ellipse centre.y');

  if (rx <= 0 || ry <= 0) {
    throw new RangeError(`ellipse radii must be positive, received ${rx} x ${ry}`);
  }

  const m = MatOps.composeAll(
    MatOps.fromScale(rx, ry),
    MatOps.fromRotation(rotation),
    MatOps.fromTranslation(centre),
  );

  // The tolerance is a budget in millimetres on the finished ellipse, so it
  // has to be divided by the scale before being spent in unit-circle space.
  const unitTolerance = EXPORT_TOLERANCE_MM / Math.max(rx, ry);

  const segments: Segment[] = [];
  for (const s of circle(vec(0, 0), 1).segments) {
    for (const c of SegmentOps.toCubics(s, unitTolerance)) {
      segments.push(...SegmentOps.transform(c, m));
    }
  }

  return closedPath(segments);
}

/**
 * The arc passing through three points, from `a` through `b` to `c`.
 *
 * Collinear points describe a circle of infinite radius, so this returns the
 * straight line from `a` to `c` — the honest answer, rather than an arc with
 * an absurd centre a long way off the page. In that case `b` is honoured only
 * if it lies between `a` and `c`: when it does not, no path from `a` to `c`
 * passes through it without doubling back, and the endpoints win.
 *
 * Two coincident points throw, which is a different failure from three
 * distinct collinear ones and deserves a different answer.
 */
export function arcThroughPoints(a: Vec2, b: Vec2, c: Vec2): Path {
  for (const [p, name] of [
    [a, 'a'],
    [b, 'b'],
    [c, 'c'],
  ] as const) {
    assertFinite(p.x, `arcThroughPoints ${name}.x`);
    assertFinite(p.y, `arcThroughPoints ${name}.y`);
  }

  // Two points in the same place describe no circle at all — distinct from
  // three distinct points in a line, which describe one of infinite radius.
  if (
    approxZero(dist(a, b), EPS_POINT) ||
    approxZero(dist(b, c), EPS_POINT) ||
    approxZero(dist(a, c), EPS_POINT)
  ) {
    throw new RangeError('arcThroughPoints needs three distinct points');
  }

  // Twice the signed area of the triangle. Zero means collinear, and near
  // zero means an arc so flat that its centre is numerically meaningless.
  const twiceArea = cross(sub(b, a), sub(c, a));

  if (approxZero(twiceArea, EPS_AREA)) return openPath([lineSegment(a, c)]);

  const aa = lenSq(a);
  const bb = lenSq(b);
  const cc = lenSq(c);

  // The circumcentre, from the standard determinant form.
  const centre = vec(
    (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / (2 * twiceArea),
    (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / (2 * twiceArea),
  );

  const radius = dist(centre, a);
  const startAngle = Math.atan2(a.y - centre.y, a.x - centre.x);
  const endAngle = Math.atan2(c.y - centre.y, c.x - centre.x);

  // The sweep turns the way a → b → c turns, which is what makes the arc pass
  // through b rather than take the other way round the circle.
  const direction = Math.sign(twiceArea);
  let sweep = endAngle - startAngle;
  while (sweep * direction < 0) sweep += direction * FULL_TURN;

  return openPath([arc(centre, radius, startAngle, sweep)]);
}

/**
 * A regular polygon with `sides` vertices on a circle of `radius`,
 * counter-clockwise, with the first vertex at `rotation`.
 */
export function regularPolygon(centre: Vec2, radius: Mm, sides: number, rotation: Radians): Path {
  assertFinite(radius, 'regularPolygon radius');
  assertFinite(rotation, 'regularPolygon rotation');
  assertFinite(centre.x, 'regularPolygon centre.x');
  assertFinite(centre.y, 'regularPolygon centre.y');

  if (!Number.isInteger(sides) || sides < 3) {
    throw new RangeError(`regularPolygon needs at least 3 whole sides, received ${sides}`);
  }
  if (radius <= 0) {
    throw new RangeError(`regularPolygon radius must be positive, received ${radius}`);
  }

  // Vertices are placed by index rather than by repeatedly adding a step, so
  // the last one closes on the first exactly. The same reason the tick
  // generator in slice 2.5 and distributeAlongPath in 1.8 do it this way.
  const points: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (FULL_TURN * i) / sides;
    points.push(vec(centre.x + radius * Math.cos(angle), centre.y + radius * Math.sin(angle)));
  }

  const segments: Segment[] = [];
  for (let i = 0; i < sides; i++) {
    segments.push(lineSegment(points[i]!, points[(i + 1) % sides]!));
  }

  return closedPath(segments);
}
