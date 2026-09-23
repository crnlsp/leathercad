import fc from 'fast-check';
import { PathOps, Shapes, Vec2Ops, type Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  foldTickShape,
  foldTicksAlong,
  hatchLines,
  linkTickOn,
  linkTickShape,
  slitsFor,
} from './leather.js';
import { CANVAS, NOMINAL_IRON, ROLE_STYLES } from './theme/index.js';

const DETAIL = CANVAS.bands.detailFromPxPerMm;
const OVERVIEW = CANVAS.bands.overviewBelowPxPerMm;

const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });
const point = fc.record({
  x: fc.double({ min: -500, max: 500, noNaN: true }),
  y: fc.double({ min: -500, max: 500, noNaN: true }),
});
// The editor's range for a pitch: from its 0.5 mm floor to a very coarse iron.
const pitch = fc.double({ min: 0.5, max: 10, noNaN: true });
// Every band a slit is drawn in; below the overview threshold a set is a line.
const drawnZoom = fc.double({ min: OVERVIEW, max: 60, noNaN: true });

const unit = (radians: number): Vec2 => ({ x: Math.cos(radians), y: Math.sin(radians) });
const lengthOf = ([a, b]: readonly [Vec2, Vec2]): number => Vec2Ops.dist(a, b);

describe('slitsFor — a hole as a pricking iron makes it', () => {
  it('centres every slit on its hole', () => {
    fc.assert(
      fc.property(point, angle, pitch, drawnZoom, (at, a, p, zoom) => {
        const [slit] = slitsFor([{ point: at, tangent: unit(a) }], p, zoom).slits;
        const mid = Vec2Ops.midpoint(slit![0], slit![1]);
        return Vec2Ops.dist(mid, at) < 1e-9;
      }),
    );
  });

  it('leans at the iron’s slant to the line, the same way on every side of a piece', () => {
    // Measured from the tangent, counter-clockwise: `/` on a line drawn left to
    // right, and turned with the line as the iron is turned round a corner.
    fc.assert(
      fc.property(point, angle, pitch, drawnZoom, (at, a, p, zoom) => {
        const t = unit(a);
        const [[from, to]] = slitsFor([{ point: at, tangent: t }], p, zoom).slits as [
          readonly [Vec2, Vec2],
        ];
        const d = Vec2Ops.normalise(Vec2Ops.sub(to, from));
        // The angle between a line and the tangent, folded into [0, π): a slit
        // has no direction of its own.
        let between = Math.atan2(Vec2Ops.cross(t, d), Vec2Ops.dot(t, d));
        if (between < 0) between += Math.PI;
        return Math.abs(between - NOMINAL_IRON.slantRad) < 1e-9;
      }),
    );
  });

  it('is the same slit whichever way the line was drawn', () => {
    fc.assert(
      fc.property(point, angle, pitch, drawnZoom, (at, a, p, zoom) => {
        const [one] = slitsFor([{ point: at, tangent: unit(a) }], p, zoom).slits;
        const [other] = slitsFor([{ point: at, tangent: unit(a + Math.PI) }], p, zoom).slits;
        const same = (u: Vec2, v: Vec2) => Vec2Ops.dist(u, v) < 1e-9;
        return (
          (same(one![0], other![0]) && same(one![1], other![1])) ||
          (same(one![0], other![1]) && same(one![1], other![0]))
        );
      }),
    );
  });

  it('is drawn true in the detail band — the tooth’s length and the blade’s thickness', () => {
    fc.assert(
      fc.property(angle, pitch, fc.double({ min: DETAIL, max: 60, noNaN: true }), (a, p, zoom) => {
        const drawn = slitsFor([{ point: { x: 0, y: 0 }, tangent: unit(a) }], p, zoom);
        const trueLength = NOMINAL_IRON.toothPerPitch * p;
        return (
          Math.abs(lengthOf(drawn.slits[0]!) - trueLength) < 1e-9 &&
          drawn.widthPx ===
            Math.max(ROLE_STYLES['stitch-holes'].widthPx, NOMINAL_IRON.bladeMm * zoom)
        );
      }),
    );
  });

  it('floors only its size in the working band, never its slant — at 3 px', () => {
    // A size is a measurement and may be floored; a slant is the code (§2.4).
    fc.assert(
      fc.property(
        angle,
        pitch,
        fc.double({ min: OVERVIEW, max: DETAIL, maxExcluded: true, noNaN: true }),
        (a, p, zoom) => {
          const drawn = slitsFor([{ point: { x: 0, y: 0 }, tangent: unit(a) }], p, zoom);
          const expected = Math.max(NOMINAL_IRON.toothPerPitch * p, CANVAS.slit.minLengthPx / zoom);
          return (
            Math.abs(lengthOf(drawn.slits[0]!) - expected) < 1e-9 &&
            drawn.widthPx === ROLE_STYLES['stitch-holes'].widthPx
          );
        },
      ),
    );
  });

  it('drawn true, spans less than half the pitch along the line, so neighbours never meet', () => {
    fc.assert(
      fc.property(angle, pitch, (a, p) => {
        const t = unit(a);
        const [slit] = slitsFor([{ point: { x: 0, y: 0 }, tangent: t }], p, DETAIL).slits;
        const along = Math.abs(Vec2Ops.dot(Vec2Ops.sub(slit![1], slit![0]), t));
        return along < p / 2;
      }),
    );
  });

  it('draws one slit per hole, and a hole with no direction still gets one', () => {
    const drawn = slitsFor(
      [
        { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } },
        { point: { x: 4, y: 0 }, tangent: { x: 0, y: 0 } },
      ],
      3.85,
      4,
    );
    expect(drawn.slits).toHaveLength(2);
    expect(drawn.slits.every((s) => Number.isFinite(s[0].x) && lengthOf(s) > 0)).toBe(true);
  });
});

describe('foldTicksAlong — where a fold says which way it folds', () => {
  const lineThrough = (a: Vec2, b: Vec2) => PathOps.polyline([a, b], false);

  it('puts every tick on the line', () => {
    fc.assert(
      fc.property(point, point, fc.double({ min: 0.2, max: 40, noNaN: true }), (a, b, zoom) => {
        const ticks = foldTicksAlong(lineThrough(a, b), zoom);
        return ticks.every((p) => Vec2Ops.distToLine(p, a, b) < 1e-6);
      }),
    );
  });

  it('is the same set of ticks whichever way the fold was drawn', () => {
    fc.assert(
      fc.property(point, point, fc.double({ min: 0.2, max: 40, noNaN: true }), (a, b, zoom) => {
        const forward = foldTicksAlong(lineThrough(a, b), zoom);
        const backward = foldTicksAlong(lineThrough(b, a), zoom);
        return (
          forward.length === backward.length &&
          forward.every((p) => backward.some((q) => Vec2Ops.dist(p, q) < 1e-6))
        );
      }),
    );
  });

  it('gives a fold at least one tick, and none to a fold too short on screen to carry one', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 400, noNaN: true }),
        fc.double({ min: 0.2, max: 40, noNaN: true }),
        (lengthMm, zoom) => {
          const ticks = foldTicksAlong(lineThrough({ x: 0, y: 0 }, { x: lengthMm, y: 0 }), zoom);
          return lengthMm * zoom < CANVAS.foldTick.minLinePx
            ? ticks.length === 0
            : ticks.length >= 1;
        },
      ),
    );
  });

  it('spaces them about a tick-spacing apart on screen', () => {
    // 100 mm at 4 px/mm is 400 px: four stretches of 100 px, a tick in each.
    const ticks = foldTicksAlong(lineThrough({ x: 0, y: 0 }, { x: 100, y: 0 }), 4);
    expect(ticks.map((p) => p.x)).toEqual([12.5, 37.5, 62.5, 87.5]);
  });
});

describe('foldTickShape — V for a valley, Λ for a mountain', () => {
  // Upright on screen, where Y points down: a valley's apex is below its arms.
  it('draws a valley as a V and a mountain as a Λ, centred where it is put', () => {
    const at = { x: 100, y: 50 };
    const [la, apex, ra] = foldTickShape(at, 'valley');
    expect(apex.y).toBeGreaterThan(la.y);
    expect(apex.y).toBeGreaterThan(ra.y);
    const [lm, peak, rm] = foldTickShape(at, 'mountain');
    expect(peak.y).toBeLessThan(lm.y);
    expect(peak.y).toBeLessThan(rm.y);

    for (const shape of [foldTickShape(at, 'valley'), foldTickShape(at, 'mountain')]) {
      expect(shape[1].x).toBe(at.x);
      expect(shape[2].x - shape[0].x).toBe(CANVAS.foldTick.widthPx);
      // Centred vertically on the line, so it straddles it.
      expect((shape[0].y + shape[1].y) / 2).toBe(at.y);
    }
  });
});

describe('linkTickOn — where a derived line wears its link', () => {
  it('sits in the middle of the longest run, turned to it — never on a corner', () => {
    // Halfway round a closed rectangle is its opposite corner, where the line
    // turns and a tick has no direction to follow. The longest side is where
    // the eye finds the line.
    const tick = linkTickOn(Shapes.rect({ x: 0, y: 0 }, 100, 60));
    expect(tick).not.toBeNull();
    expect(tick!.at.x).toBeCloseTo(50, 9);
    expect([0, 60]).toContain(Math.round(tick!.at.y));
    expect(Math.abs(tick!.tangent.x)).toBeCloseTo(1, 9);
  });

  it('lies on the path, whatever its shape', () => {
    fc.assert(
      fc.property(
        fc.array(point, { minLength: 2, maxLength: 6 }),
        fc.boolean(),
        (points, closed) => {
          const distinct = points.filter(
            (p, i) => i === 0 || Vec2Ops.dist(p, points[i - 1]!) > 1e-3,
          );
          fc.pre(distinct.length >= 2 && (!closed || distinct.length >= 3));
          const path = PathOps.polyline(distinct, closed);
          const tick = linkTickOn(path)!;
          const onSomeSegment = path.segments.some(
            (s) => s.kind === 'line' && Vec2Ops.distToLine(tick.at, s.a, s.b) < 1e-6,
          );
          return onSomeSegment && Math.abs(Vec2Ops.len(tick.tangent) - 1) < 1e-9;
        },
      ),
    );
  });

  it('has nowhere to go on an empty path', () => {
    expect(linkTickOn({ closed: false, segments: [] })).toBeNull();
  });

  it('is two interlocked rings along the line', () => {
    const [a, b] = linkTickShape({ x: 10, y: 10 }, { x: 1, y: 0 });
    // Interlocked: closer than two radii, so they overlap, but not concentric.
    const apart = Vec2Ops.dist(a.centre, b.centre);
    expect(apart).toBeGreaterThan(0);
    expect(apart).toBeLessThan(a.radius + b.radius);
    // Along the line: the midpoint of the pair is where it was put.
    expect(Vec2Ops.midpoint(a.centre, b.centre)).toEqual({ x: 10, y: 10 });
    expect(a.centre.y).toBe(b.centre.y);
  });
});

describe('hatchLines — the inward hatch of a cut-out', () => {
  const bounds = fc
    .tuple(
      point,
      fc.double({ min: 0.5, max: 200, noNaN: true }),
      fc.double({ min: 0.5, max: 200, noNaN: true }),
    )
    .map(([origin, w, h]) => ({
      minX: origin.x,
      minY: origin.y,
      maxX: origin.x + w,
      maxY: origin.y + h,
    }));

  it('runs every line at 45°', () => {
    fc.assert(
      fc.property(bounds, fc.double({ min: 0.2, max: 10, noNaN: true }), (box, spacing) =>
        hatchLines(box, spacing).every(([a, b]) => Math.abs(b.x - a.x - (b.y - a.y)) < 1e-6),
      ),
    );
  });

  it('covers the box: every point in it is within half a spacing of a line', () => {
    fc.assert(
      fc.property(
        bounds,
        fc.double({ min: 0.2, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (box, spacing, u, v) => {
          const p = {
            x: box.minX + u * (box.maxX - box.minX),
            y: box.minY + v * (box.maxY - box.minY),
          };
          return hatchLines(box, spacing).some(
            ([a, b]) =>
              Vec2Ops.distToLine(p, a, b) <= spacing / 2 + 1e-6 &&
              // …and the line actually reaches it, not only its extension.
              Vec2Ops.dist(Vec2Ops.closestPointOnSegment(p, a, b), p) <= spacing / 2 + 1e-6,
          );
        },
      ),
    );
  });

  it('is anchored to the world, so panning does not make it crawl', () => {
    const a = hatchLines({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 2);
    const b = hatchLines({ minX: 1, minY: 0, maxX: 11, maxY: 10 }, 2);
    // Each line is x − y = a multiple of the spacing's diagonal, in both.
    const offsets = (lines: typeof a) =>
      lines.map(([p]) => (p.x - p.y) / (2 * Math.SQRT2)).map((k) => Math.abs(k - Math.round(k)));
    expect(offsets(a).every((d) => d < 1e-9)).toBe(true);
    expect(offsets(b).every((d) => d < 1e-9)).toBe(true);
  });
});
