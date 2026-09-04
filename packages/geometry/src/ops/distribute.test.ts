import { EPS_LENGTH } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbClosedPath, arbOpenPath, arbPitch } from '../../test/arbitraries.js';
import {
  isPointOnPath,
  length as pathLength,
  measure,
  polyline,
  type Path,
} from '../path/index.js';
import { dist, vec } from '../vec2.js';

import { distributeAlongPath } from './distribute.js';

/** Distribution is property-heavy; docs/testing.md §3.3 asks for 1000 runs. */
const RUNS = { numRuns: 1000 };

/**
 * Keeps one property run to a sane number of points.
 *
 * The generators are independent, so nothing stops a 10 m path pairing with a
 * 0.1 mm pitch — a hundred thousand points, generated and compared a thousand
 * times over. That combination is not wrong, it is just not what these
 * properties are about, and under coverage instrumentation it took the
 * determinism property past the 30 s test timeout in CI while passing locally.
 *
 * The bound is on the test's work, not on the function's domain: the example
 * test below exercises a six-figure hole count once, where it costs one run
 * instead of a thousand.
 */
const withinWorkBudget = (path: Path, pitchMm: number): boolean =>
  pathLength(path) / pitchMm <= 2000;

/** A horizontal run of the given length, starting at the origin. */
const straight = (lengthMm: number): Path => polyline([vec(0, 0), vec(lengthMm, 0)]);

/** A square whose perimeter is 4 × side. */
const square = (side: number): Path =>
  polyline([vec(0, 0), vec(side, 0), vec(side, side), vec(0, side)], true);

/** The gaps between consecutive points, in order. */
const spacings = (points: readonly { distance: number }[]): number[] =>
  points.slice(1).map((p, i) => p.distance - (points[i]?.distance ?? 0));

describe('distributeAlongPath', () => {
  describe('exact-pitch', () => {
    it('steps by exactly the pitch and leaves the remainder at the end', () => {
      const { points, actualPitch } = distributeAlongPath(measure(straight(100)), {
        mode: 'exact-pitch',
        pitchMm: 30,
        closed: false,
      });

      expect(points.map((p) => p.distance)).toEqual([0, 30, 60, 90]);
      expect(actualPitch).toBe(30);
    });

    it('includes a final point that lands exactly on the end', () => {
      const { points } = distributeAlongPath(measure(straight(100)), {
        mode: 'exact-pitch',
        pitchMm: 25,
        closed: false,
      });

      expect(points).toHaveLength(5);
      expect(points.at(-1)?.distance).toBeCloseTo(100, 9);
    });

    it('honours start and end offsets', () => {
      const { points } = distributeAlongPath(measure(straight(100)), {
        mode: 'exact-pitch',
        pitchMm: 20,
        startOffsetMm: 10,
        endOffsetMm: 10,
        closed: false,
      });

      // The usable run is 10..90, which 20 mm divides exactly: five points,
      // the last landing on the far end of the run rather than the path.
      expect(points.map((p) => p.distance)).toEqual([10, 30, 50, 70, 90]);
    });
  });

  describe('fit-whole', () => {
    it('divides the run into whole intervals and reports the achieved pitch', () => {
      const { points, actualPitch } = distributeAlongPath(measure(straight(100)), {
        mode: 'fit-whole',
        pitchMm: 30,
        closed: false,
      });

      // round(100 / 30) = 3 intervals, so four points and a 33.33 mm pitch.
      expect(points).toHaveLength(4);
      expect(actualPitch).toBeCloseTo(100 / 3, 9);
      expect(points.at(-1)?.distance).toBeCloseTo(100, 9);
    });

    it('on a closed path, the last point does not land on the first', () => {
      const perimeter = 400;
      const { points, actualPitch } = distributeAlongPath(measure(square(100)), {
        mode: 'fit-whole',
        pitchMm: 30,
        closed: true,
      });

      // round(400 / 30) = 13 intervals, and a closed run gets 13 points, not 14.
      expect(points).toHaveLength(13);
      expect(actualPitch).toBeCloseTo(perimeter / 13, 9);
      expect(dist(points[0]!.point, points.at(-1)!.point)).toBeGreaterThan(1);
    });

    it('places a point at each end of an open run', () => {
      const { points } = distributeAlongPath(measure(straight(77)), {
        mode: 'fit-whole',
        pitchMm: 3.85,
        closed: false,
      });

      expect(points[0]?.distance).toBe(0);
      expect(points.at(-1)?.distance).toBeCloseTo(77, 9);
    });
  });

  describe('degenerate input', () => {
    it('rejects a non-finite pitch', () => {
      expect(() =>
        distributeAlongPath(measure(straight(100)), {
          mode: 'fit-whole',
          pitchMm: Number.NaN,
          closed: false,
        }),
      ).toThrow(RangeError);
    });

    it('rejects a pitch of zero or less', () => {
      expect(() =>
        distributeAlongPath(measure(straight(100)), {
          mode: 'fit-whole',
          pitchMm: 0,
          closed: false,
        }),
      ).toThrow(RangeError);
    });

    it('returns no points when the offsets consume the whole run', () => {
      const { points } = distributeAlongPath(measure(straight(100)), {
        mode: 'fit-whole',
        pitchMm: 5,
        startOffsetMm: 60,
        endOffsetMm: 60,
        closed: false,
      });

      expect(points).toEqual([]);
    });

    it('returns no points for a zero-length path', () => {
      const { points } = distributeAlongPath(measure(polyline([vec(0, 0), vec(0, 0)])), {
        mode: 'exact-pitch',
        pitchMm: 3.85,
        closed: false,
      });

      expect(points).toEqual([]);
    });

    it('fits a single interval when the run is shorter than one pitch', () => {
      const { points, actualPitch } = distributeAlongPath(measure(straight(2)), {
        mode: 'fit-whole',
        pitchMm: 10,
        closed: false,
      });

      expect(points).toHaveLength(2);
      expect(actualPitch).toBeCloseTo(2, 9);
    });

    it('places a single point when the pitch is longer than the run', () => {
      const { points } = distributeAlongPath(measure(straight(2)), {
        mode: 'exact-pitch',
        pitchMm: 10,
        closed: false,
      });

      // exact-pitch cannot reach a second point, and does not invent one.
      expect(points.map((p) => p.distance)).toEqual([0]);
    });

    it('breaks a fit-whole rounding tie upward', () => {
      // 25 / 10 is exactly 2.5. Math.round takes ties up, so three intervals
      // and a pitch below nominal rather than two and a pitch above it.
      // Deterministic either way; pinned here so it cannot drift silently.
      const { points, actualPitch } = distributeAlongPath(measure(straight(25)), {
        mode: 'fit-whole',
        pitchMm: 10,
        closed: false,
      });

      expect(points).toHaveLength(4);
      expect(actualPitch).toBeCloseTo(25 / 3, 9);
    });

    it('regression: a run just under half a pitch still gets both ends', () => {
      // fast-check shrank to this while proving the half-interval property:
      // 3.85 / 7.700000015400001 is 0.4999999990, which rounds to zero
      // intervals. The Math.max(1, ...) clamp is what stops that becoming a
      // division by zero, and this is the exact case that found it.
      const { points, actualPitch } = distributeAlongPath(measure(straight(3.85)), {
        mode: 'fit-whole',
        pitchMm: 7.700000015400001,
        closed: false,
      });

      expect(points.map((p) => p.distance)).toEqual([0, 3.85]);
      expect(actualPitch).toBe(3.85);
    });

    it('rejects an end offset on a closed path, which has no end', () => {
      expect(() =>
        distributeAlongPath(measure(square(100)), {
          mode: 'fit-whole',
          pitchMm: 4,
          endOffsetMm: 5,
          closed: true,
        }),
      ).toThrow();
    });
  });

  it('handles a six-figure hole count', () => {
    // A 10 m run at a 0.1 mm pitch: absurd for leatherwork, but the property
    // generators can reach here and the arithmetic must not degrade. Run once,
    // deliberately, rather than a thousand times inside a property.
    const { points, actualPitch } = distributeAlongPath(measure(straight(10_000)), {
      mode: 'fit-whole',
      pitchMm: 0.1,
      closed: false,
    });

    expect(points).toHaveLength(100_001);
    expect(actualPitch).toBeCloseTo(0.1, 12);
    // The last point lands on the end exactly, which repeated addition of
    // 0.1 across a hundred thousand steps would not manage.
    expect(points.at(-1)?.distance).toBeCloseTo(10_000, 9);
  });

  describe('properties', () => {
    it('every point lies on the source path', () => {
      fc.assert(
        fc.property(arbOpenPath, arbPitch, (path, pitchMm) => {
          fc.pre(withinWorkBudget(path, pitchMm));
          const { points } = distributeAlongPath(measure(path), {
            mode: 'fit-whole',
            pitchMm,
            closed: false,
          });

          for (const p of points) {
            expect(isPointOnPath(path, p.point, 1e-6)).toBe(true);
          }
        }),
        RUNS,
      );
    });

    it('under fit-whole, every spacing equals the achieved pitch', () => {
      fc.assert(
        fc.property(arbOpenPath, arbPitch, (path, pitchMm) => {
          fc.pre(withinWorkBudget(path, pitchMm));
          const { points, actualPitch } = distributeAlongPath(measure(path), {
            mode: 'fit-whole',
            pitchMm,
            closed: false,
          });

          for (const gap of spacings(points)) {
            expect(Math.abs(gap - actualPitch)).toBeLessThanOrEqual(EPS_LENGTH);
          }
        }),
        RUNS,
      );
    });

    it('under fit-whole, the spacings sum to the usable length', () => {
      fc.assert(
        fc.property(arbOpenPath, arbPitch, (path, pitchMm) => {
          fc.pre(withinWorkBudget(path, pitchMm));
          const m = measure(path);
          const { points } = distributeAlongPath(m, {
            mode: 'fit-whole',
            pitchMm,
            closed: false,
          });

          const sum = spacings(points).reduce((a, b) => a + b, 0);
          expect(sum).toBeCloseTo(m.totalLength(), 6);
        }),
        RUNS,
      );
    });

    it('under fit-whole on a closed path, point count equals interval count', () => {
      fc.assert(
        fc.property(arbClosedPath, arbPitch, (path, pitchMm) => {
          fc.pre(withinWorkBudget(path, pitchMm));
          const m = measure(path);
          const { points, actualPitch } = distributeAlongPath(m, {
            mode: 'fit-whole',
            pitchMm,
            closed: true,
          });

          // n intervals of actualPitch close the loop exactly, and there are
          // n points — the last never lands on the first.
          expect(points.length * actualPitch).toBeCloseTo(m.totalLength(), 6);
        }),
        RUNS,
      );
    });

    it('the achieved pitch is within half an interval of the nominal one', () => {
      fc.assert(
        fc.property(arbOpenPath, arbPitch, (path, pitchMm) => {
          fc.pre(withinWorkBudget(path, pitchMm));
          const m = measure(path);
          const { actualPitch } = distributeAlongPath(m, {
            mode: 'fit-whole',
            pitchMm,
            closed: false,
          });

          const usable = m.totalLength();

          // Below half a pitch the interval count rounds to zero and the
          // Math.max(1, ...) clamp takes over, deliberately: a short run gets
          // a point at each end rather than none. The clamp is a wider
          // deviation than half an interval, and the example test above pins
          // that behaviour down. The property covers everything past it.
          fc.pre(usable >= pitchMm / 2);

          // The interval count is the nominal count rounded, so the two
          // counts differ by at most a half.
          expect(Math.abs(usable / actualPitch - usable / pitchMm)).toBeLessThanOrEqual(0.5 + 1e-9);
        }),
        RUNS,
      );
    });

    it('point count never increases as the pitch grows', () => {
      fc.assert(
        fc.property(arbOpenPath, arbPitch, arbPitch, (path, a, b) => {
          fc.pre(withinWorkBudget(path, Math.min(a, b)));
          const m = measure(path);
          const [small, large] = a <= b ? [a, b] : [b, a];
          const count = (pitchMm: number): number =>
            distributeAlongPath(m, { mode: 'exact-pitch', pitchMm, closed: false }).points.length;

          expect(count(large)).toBeLessThanOrEqual(count(small));
        }),
        RUNS,
      );
    });

    it('is deterministic', () => {
      fc.assert(
        fc.property(arbOpenPath, arbPitch, (path, pitchMm) => {
          fc.pre(withinWorkBudget(path, pitchMm));
          const m = measure(path);
          const opts = { mode: 'fit-whole', pitchMm, closed: false } as const;

          expect(distributeAlongPath(m, opts)).toEqual(distributeAlongPath(m, opts));
        }),
        RUNS,
      );
    });
  });
});
