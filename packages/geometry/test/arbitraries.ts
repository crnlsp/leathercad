import fc from 'fast-check';

import type { Mat2x3 } from '../src/mat2x3.js';
import type { ArcSegment, CubicSegment, LineSegment, Segment } from '../src/segment/types.js';
import type { Vec2 } from '../src/vec2.js';

/**
 * Shared fast-check generators.
 *
 * Uniform random doubles almost never produce the coincident points, right
 * angles and round numbers that real user input is full of — and those are
 * exactly where epsilon bugs live. Several of these deliberately mix uniform
 * values with a pool of interesting ones. See docs/testing.md §3.1.
 */

/** Values a leatherworker could plausibly type: 0.1 mm to 2000 mm, both signs. */
export const arbCoord: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: -2000, max: 2000, noNaN: true }) },
  // Round numbers and exact zeros, which is what people actually draw with.
  { weight: 2, arbitrary: fc.integer({ min: -500, max: 500 }).map((n) => n) },
  { weight: 1, arbitrary: fc.constantFrom(0, -0, 1, -1, 0.1, -0.1, 100, 105, 3.85, 2000, -2000) },
);

/** Away from zero, for divisors and radii. */
export const arbNonZeroCoord: fc.Arbitrary<number> = arbCoord.filter((v) => Math.abs(v) > 1e-3);

export const arbVec2: fc.Arbitrary<Vec2> = fc.record({ x: arbCoord, y: arbCoord });

export const arbNonZeroVec2: fc.Arbitrary<Vec2> = arbVec2.filter(
  (v) => Math.hypot(v.x, v.y) > 1e-3,
);

export const arbAngle: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: -Math.PI * 2, max: Math.PI * 2, noNaN: true }) },
  // Right angles and half turns break naive implementations first.
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      0,
      Math.PI / 6,
      Math.PI / 4,
      Math.PI / 3,
      Math.PI / 2,
      Math.PI,
      -Math.PI / 2,
      -Math.PI,
      Math.PI * 2,
    ),
  },
);

/** t along a segment. Includes the endpoints, which is where splits go wrong. */
export const arbParam: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(0, 1, 0.5) },
);

/** A scale factor that keeps a matrix comfortably invertible. */
export const arbScaleFactor: fc.Arbitrary<number> = fc
  .double({ min: -10, max: 10, noNaN: true })
  .filter((s) => Math.abs(s) > 0.01);

/**
 * Rotation, translation and mirroring only — no scaling. These preserve
 * distances, which is what makes them useful as a property-test input:
 * lengths and areas must survive them unchanged.
 */
export const arbRigidTransform: fc.Arbitrary<Mat2x3> = fc
  .tuple(arbAngle, arbVec2, fc.boolean())
  .map(([angle, offset, mirrored]) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const m = mirrored ? -1 : 1;
    return { a: cos, b: sin, c: -sin * m, d: cos * m, e: offset.x, f: offset.y };
  });

/** A radius that is positive and not vanishingly small. */
export const arbRadius: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: 0.1, max: 500, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(0.1, 1, 3.85, 8, 100, 500) },
);

/** Includes the full turn and both half turns, where naive arc code breaks. */
export const arbSweep: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: -Math.PI * 2, max: Math.PI * 2, noNaN: true }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      Math.PI * 2,
      -Math.PI * 2,
      Math.PI,
      -Math.PI,
      Math.PI / 2,
      -Math.PI / 2,
    ),
  },
);

export const arbLineSegment: fc.Arbitrary<LineSegment> = fc
  .tuple(arbVec2, arbVec2)
  .map(([a, b]) => ({ kind: 'line' as const, a, b }));

export const arbArcSegment: fc.Arbitrary<ArcSegment> = fc
  .tuple(arbVec2, arbRadius, arbAngle, arbSweep)
  .map(([centre, radius, startAngle, sweepAngle]) => ({
    kind: 'arc' as const,
    centre,
    radius,
    startAngle,
    sweepAngle,
  }));

export const arbCubicSegment: fc.Arbitrary<CubicSegment> = fc
  .tuple(arbVec2, arbVec2, arbVec2, arbVec2)
  .map(([p0, p1, p2, p3]) => ({ kind: 'cubic' as const, p0, p1, p2, p3 }));

export const arbSegment: fc.Arbitrary<Segment> = fc.oneof(
  arbLineSegment,
  arbArcSegment,
  arbCubicSegment,
);

/** Segments with real extent, for properties that a degenerate one cannot satisfy. */
export const arbNonDegenerateSegment: fc.Arbitrary<Segment> = fc.oneof(
  arbLineSegment.filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 0.01),
  arbArcSegment.filter((s) => Math.abs(s.sweepAngle) * s.radius > 0.01),
  arbCubicSegment.filter((s) => Math.hypot(s.p3.x - s.p0.x, s.p3.y - s.p0.y) > 0.01),
);
