import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { rootsInUnitInterval, solveCubic, solveLinear, solveQuadratic } from './polynomial.js';

const evalQuadratic = (a: number, b: number, c: number, t: number): number => (a * t + b) * t + c;
const evalCubic = (a: number, b: number, c: number, d: number, t: number): number =>
  ((a * t + b) * t + c) * t + d;

const coefficient = fc.double({ min: -100, max: 100, noNaN: true });

describe('solveLinear', () => {
  it('solves a simple root', () => {
    expect(solveLinear(2, -4)).toEqual([2]);
  });

  it('returns nothing for a constant', () => {
    expect(solveLinear(0, 5)).toEqual([]);
  });
});

describe('solveQuadratic', () => {
  it('finds known roots', () => {
    expect(solveQuadratic(1, -3, 2)).toEqual([1, 2]);
  });

  it('returns nothing when the discriminant is negative', () => {
    expect(solveQuadratic(1, 0, 1)).toEqual([]);
  });

  it('returns a single root at a tangency', () => {
    expect(solveQuadratic(1, -2, 1)).toEqual([1]);
  });

  it('every returned root satisfies the equation', () => {
    fc.assert(
      fc.property(coefficient, coefficient, coefficient, (a, b, c) =>
        solveQuadratic(a, b, c).every(
          (t) =>
            Math.abs(evalQuadratic(a, b, c, t)) <
            1e-6 * (1 + Math.abs(a) + Math.abs(b) + Math.abs(c)),
        ),
      ),
    );
  });

  it('stays accurate when the roots are wildly different in magnitude', () => {
    // The textbook formula loses nearly all its digits here, because one root
    // comes from subtracting two almost equal numbers.
    const roots = solveQuadratic(1, -1e8, 1);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(1e-8, 15);
    expect(roots[1]).toBeCloseTo(1e8, 0);
  });

  it('returns roots in ascending order', () => {
    fc.assert(
      fc.property(coefficient, coefficient, coefficient, (a, b, c) => {
        const roots = solveQuadratic(a, b, c);
        return roots.every((t, i) => i === 0 || t >= (roots[i - 1] ?? t));
      }),
    );
  });
});

describe('solveCubic', () => {
  it('finds three known roots', () => {
    // (t-1)(t-2)(t-3) = t³ - 6t² + 11t - 6
    const roots = solveCubic(1, -6, 11, -6);
    expect(roots).toHaveLength(3);
    expect(roots[0]).toBeCloseTo(1, 9);
    expect(roots[1]).toBeCloseTo(2, 9);
    expect(roots[2]).toBeCloseTo(3, 9);
  });

  it('finds a single real root when the other two are complex', () => {
    // t³ + t + 1 has one real root near -0.6823
    const roots = solveCubic(1, 0, 1, 1);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(-0.6823278, 6);
  });

  it('handles a triple root', () => {
    // (t-2)³
    const roots = solveCubic(1, -6, 12, -8);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(2, 6);
  });

  it('handles a double root plus a single', () => {
    // (t-1)²(t+2) = t³ - 3t + 2
    const roots = solveCubic(1, 0, -3, 2);
    expect(roots.map((r) => Math.round(r * 1e6) / 1e6).sort((a, b) => a - b)).toEqual([-2, 1]);
  });

  it('degrades to the quadratic solver when the cubic term vanishes', () => {
    expect(solveCubic(0, 1, -3, 2)).toEqual([1, 2]);
  });

  it('every returned root satisfies the equation', () => {
    fc.assert(
      fc.property(coefficient, coefficient, coefficient, coefficient, (a, b, c, d) => {
        const scale = 1 + Math.abs(a) + Math.abs(b) + Math.abs(c) + Math.abs(d);
        return solveCubic(a, b, c, d).every(
          (t) => Math.abs(evalCubic(a, b, c, d, t)) < 1e-6 * scale * Math.max(1, Math.abs(t) ** 3),
        );
      }),
    );
  });

  it('finds every root of a cubic built from known roots', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        (r1, r2, r3) => {
          // Well-separated roots only: a near-double root is genuinely
          // ill-conditioned and no solver recovers it to full precision.
          const sorted = [r1, r2, r3].sort((x, y) => x - y);
          const [x1, x2, x3] = sorted as [number, number, number];
          if (x2 - x1 < 0.5 || x3 - x2 < 0.5) return true;

          const b = -(x1 + x2 + x3);
          const c = x1 * x2 + x1 * x3 + x2 * x3;
          const d = -(x1 * x2 * x3);

          const found = solveCubic(1, b, c, d);
          return sorted.every((expected) => found.some((t) => Math.abs(t - expected) < 1e-6));
        },
      ),
    );
  });

  it('returns roots in ascending order without duplicates', () => {
    fc.assert(
      fc.property(coefficient, coefficient, coefficient, coefficient, (a, b, c, d) => {
        const roots = solveCubic(a, b, c, d);
        return roots.every((t, i) => i === 0 || t > (roots[i - 1] ?? t));
      }),
    );
  });
});

describe('rootsInUnitInterval', () => {
  it('keeps only the open interval', () => {
    expect(rootsInUnitInterval([-0.1, 0, 0.5, 1, 1.2])).toEqual([0.5]);
  });
});
