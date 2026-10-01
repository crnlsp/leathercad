import type { Mm } from '@leathercad/core';
import { PathOps, Shapes, type Path, type Vec2 } from '@leathercad/geometry';

/**
 * LeatherCAD's mark on paper: the pocket from the app icon
 * (`apps/desktop/build/icon.svg`) — a card pocket with a thumb scoop, stitched
 * on its three sewn sides — as one filled shape with its stitch holes knocked
 * out. Black, like everything printed, and drawn from the icon's own numbers
 * rather than its file, so nothing parses an SVG.
 *
 * The icon's pocket spans 520 × 486 of its 1024 units, from (252, 286) to
 * (772, 772), Y down.
 */

/** Width over height. */
export const BRAND_MARK_ASPECT = 520 / 486;

/** The mark `heightMm` tall, its bottom-left corner at `at`. */
export function brandMark(at: Vec2, heightMm: Mm): Path[] {
  const unit = heightMm / 486;
  // Icon units to millimetres, Y up.
  const p = (x: number, y: number): Vec2 => ({
    x: at.x + (x - 252) * unit,
    y: at.y + (772 - y) * unit,
  });
  const line = (points: Vec2[]) => PathOps.polyline(points, false).segments;
  // A quarter round, from `a` to `b` about `centre`, through its middle.
  const corner = (a: Vec2, centre: Vec2, b: Vec2) => {
    const middle = { x: (a.x + b.x) / 2 - centre.x, y: (a.y + b.y) / 2 - centre.y };
    const length = Math.hypot(middle.x, middle.y);
    const radius = Math.hypot(a.x - centre.x, a.y - centre.y);
    const through = {
      x: centre.x + (middle.x / length) * radius,
      y: centre.y + (middle.y / length) * radius,
    };
    return Shapes.arcThroughPoints(a, through, b).segments;
  };

  const outline = PathOps.withOrientation(
    {
      closed: true,
      segments: [
        ...line([p(252, 286), p(402, 286)]),
        // The thumb scoop: radius 113.35, dipping to 372.
        ...Shapes.arcThroughPoints(p(402, 286), p(512, 372), p(622, 286)).segments,
        ...line([p(622, 286), p(772, 286), p(772, 716)]),
        ...corner(p(772, 716), p(716, 716), p(716, 772)),
        ...line([p(716, 772), p(308, 772)]),
        ...corner(p(308, 772), p(308, 716), p(252, 716)),
        ...line([p(252, 716), p(252, 286)]),
      ],
    },
    'ccw',
  );

  // Seven holes up each side and seven along the bottom, corners shared: 20.
  const holes: Vec2[] = [];
  for (let i = 0; i < 7; i++) holes.push(p(310, 350 + (364 * i) / 6));
  for (let i = 1; i < 7; i++) holes.push(p(310 + (404 * i) / 7, 714));
  for (let i = 0; i < 7; i++) holes.push(p(714, 714 - (364 * i) / 6));
  return [
    outline,
    // Wound against the outline, so either fill rule leaves them open.
    ...holes.map((centre) => PathOps.withOrientation(Shapes.circle(centre, 15 * unit), 'cw')),
  ];
}
