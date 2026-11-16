import { approxEq, EPS_RATIO, EPS_POINT, checkResourceLimit } from '@leathercad/core';
import {
  arc,
  line,
  SegmentOps,
  maxArcStepForTolerance,
  type Vec2,
  type Segment,
} from '@leathercad/geometry';

/** SVG endpoint parameterisation converted to a unit circle, then its ellipse matrix. */
export function svgArc(
  start: Vec2,
  end: Vec2,
  radiusX: number,
  radiusY: number,
  degrees: number,
  large: number,
  sweep: number,
  tolerance: number,
): Segment[] {
  if (approxEq(start.x, end.x, EPS_POINT) && approxEq(start.y, end.y, EPS_POINT)) return [];
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  if (rx <= 0 || ry <= 0) return [line(start, end)];
  const phi = (degrees * Math.PI) / 180,
    c = Math.cos(phi),
    s = Math.sin(phi);
  const dx = (start.x - end.x) / 2,
    dy = (start.y - end.y) / 2;
  const x = c * dx + s * dy,
    y = -s * dx + c * dy;
  const correction = Math.max(1, Math.hypot(x / rx, y / ry));
  rx *= correction;
  ry *= correction;
  const u = x / rx,
    v = y / ry;
  const factor =
    (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (1 - u * u - v * v) / (u * u + v * v)));
  const cx = factor * rx * v,
    cy = -factor * ry * u;
  const centre = {
    x: c * cx - s * cy + (start.x + end.x) / 2,
    y: s * cx + c * cy + (start.y + end.y) / 2,
  };
  const a = Math.atan2((y - cy) / ry, (x - cx) / rx);
  const b = Math.atan2((-y - cy) / ry, (-x - cx) / rx);
  let delta = b - a;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (approxEq(rx, ry, EPS_RATIO)) return [arc(centre, rx, a + phi, delta)];
  const matrix = { a: rx * c, b: rx * s, c: -ry * s, d: ry * c, e: centre.x, f: centre.y };
  // Convert in final ellipse units so the existing geometry tolerance controls the error.
  checkResourceLimit(
    'nodes',
    Math.ceil(Math.abs(delta) / maxArcStepForTolerance(1, tolerance / Math.max(rx, ry))),
  );
  return SegmentOps.toCubics(
    arc({ x: 0, y: 0 }, 1, a, delta),
    tolerance / Math.max(rx, ry),
  ).flatMap((segment) => SegmentOps.transform(segment, matrix));
}
