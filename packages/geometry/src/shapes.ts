import { assertFinite, type Mm } from '@leathercad/core';

import { closed as closedPath, type Path } from './path/index.js';
import { arc, line, type Segment } from './segment/index.js';
import { vec, type Vec2 } from './vec2.js';

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
    line(vec(origin.x, origin.y), vec(x1, origin.y)),
    line(vec(x1, origin.y), vec(x1, y1)),
    line(vec(x1, y1), vec(origin.x, y1)),
    line(vec(origin.x, y1), vec(origin.x, origin.y)),
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
    if (Math.hypot(to.x - from.x, to.y - from.y) > 0) segments.push(line(from, to));
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
