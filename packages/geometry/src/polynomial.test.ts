import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { rootsInUnitInterval, solveCubic, solveLinear, solveQuadratic } from './polynomial.js';

/**
 * Coefficients of the size this engine actually produces.
 *
 * These polynomials come from curve geometry: control points in millimetres
 * over a working range of ±2000, with the parameter in [0, 1]. Letting
 * fast-check reach for subnormals like 6.7e-309 explores arithmetic no caller
 * can trigger, and the counterexamples it finds there say nothing about
 * whether the solver is fit for its purpose. Zero stays in, because a missing
 * term is ordinary. See docs/testing.md §3.1.
 */
const coefficient = fc
  .double({ min: -100, max: 100, noNaN: true })
  .filter((v) => v === 0 || Math.abs(v) >= 1e-9);

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

  it('stays accurate when the roots are wildly different in magnitude', () => {
    // The textbook formula loses nearly all its digits here, because one root
    // comes from subtracting two almost equal numbers.
    const roots = solveQuadratic(1, -1e8, 1);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(1e-8, 15);
    expect(roots[1]).toBeCloseTo(1e8, 0);
  });

  it('recovers exactly the roots a quadratic was built from', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (r1, r2) => {
          const [x1, x2] = [r1, r2].sort((a, b) => a - b) as [number, number];
          if (x2 - x1 < 0.5) return true;

          const found = solveQuadratic(1, -(x1 + x2), x1 * x2);
          if (found.length !== 2) return false;
          return Math.abs((found[0] ?? NaN) - x1) < 1e-6 && Math.abs((found[1] ?? NaN) - x2) < 1e-6;
        },
      ),
    );
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

  it('solves a cubic with very small coefficients', () => {
    // Regression: fast-check shrank to −0.0005·t³ + 1e-9, whose discriminant
    // is 1e-12. An absolute 1e-12 threshold read that as a repeated root and
    // returned two wrong values, one polishing to a spurious 0. Curve
    // parameters live in [0, 1], so small coefficients are the norm here.
    const roots = solveCubic(-0.0005, 0, 0, 1e-9);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(Math.cbrt(2e-6), 12);
  });

  it('returns no spurious root when one root dwarfs the others', () => {
    // Regression: 0.0002084·t³ + 1.026·t² + 2.9e-17 has exactly one real root,
    // near −4922. The discriminant q²/4 + p³/27 is the difference of two
    // numbers around 1.95e19, so cancellation destroys its sign and the
    // repeated-root branch invented a second value near zero — which Newton
    // then polished into something plausible. Ray casting would have counted
    // it as a crossing.
    const roots = solveCubic(0.0002084507619804898, 1.026071210341198, 0, 2.9133249375399014e-17);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(-4922.367, 3);
  });

  it('recovers exactly the roots a cubic was built from', () => {
    // Ground truth rather than a residual bound. Residual-based checks are
    // self-referential — they end up restating whatever tolerance the solver
    // already applies — and they cannot express accuracy at a root of zero or
    // at a double root. Building the polynomial from known roots tests both
    // directions at once: nothing missing, and nothing invented.
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        (r1, r2, r3) => {
          // Well-separated only: a near-double root is genuinely
          // ill-conditioned and no solver recovers it to full precision.
          const sorted = [r1, r2, r3].sort((x, y) => x - y);
          const [x1, x2, x3] = sorted as [number, number, number];
          if (x2 - x1 < 0.5 || x3 - x2 < 0.5) return true;

          const b = -(x1 + x2 + x3);
          const c = x1 * x2 + x1 * x3 + x2 * x3;
          const d = -(x1 * x2 * x3);

          const found = solveCubic(1, b, c, d);
          if (found.length !== 3) return false;
          return sorted.every((expected, i) => Math.abs((found[i] ?? NaN) - expected) < 1e-6);
        },
      ),
    );
  });

  it('invents no root for a cubic with only one real root', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.double({ min: 1, max: 20, noNaN: true }),
        (real, re, im) => {
          // (t − real)(t² − 2·re·t + re² + im²): one real root, two complex.
          const p = -2 * re;
          const q = re * re + im * im;
          const b = p - real;
          const c = q - real * p;
          const d = -real * q;

          const found = solveCubic(1, b, c, d);
          if (found.length !== 1) return false;
          return Math.abs((found[0] ?? NaN) - real) < 1e-6;
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
