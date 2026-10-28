import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbCoord } from '../test/arbitraries.js';
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

  it('regression: finds only the tangent touch on a cubic whose t³ term is rounding noise (Q38)', () => {
    // The bottom cubic of Q38's circle, centre (0, −2000), against the ray
    // level with its lowest point. It is symmetric about t = 0.5, so its t³
    // coefficient is zero but for 1.4e-12 of noise from coordinates near 2100
    // — just past EPS_COEFFICIENT. Cardano, working about a shift near 1.3e13,
    // answered t = 0.75, where the curve is steep and nowhere near the ray.
    const roots = rootsInUnitInterval(
      solveCubic(
        -1.3642420526593924e-12,
        51.66734706712032,
        -51.66734706711895,
        12.916836766779397,
      ),
    );
    expect(roots.length).toBeGreaterThan(0);
    for (const t of roots) expect(Math.abs(t - 0.5)).toBeLessThan(1e-6);
  });

  it('regression: finds two roots close together beside a far one (Q38)', () => {
    // (t + 0.01)·t·(t − 25976.48): fast-check's counterexample to the property
    // below. Beside the far root the near two are 4e-7 of the scale apart, so
    // the discriminant read as a repeated root and both were lost.
    const far = 25976.48166196564;
    const roots = solveCubic(1, -(far - 0.01), -0.01 * far, 0);
    expect(roots).toHaveLength(3);
    expect(roots[0]).toBeCloseTo(-0.01, 12);
    expect(roots[1]).toBeCloseTo(0, 12);
    expect(roots[2]).toBeCloseTo(far, 6);
  });

  it('regression: finds a root at zero beside a complex pair larger than it', () => {
    // t·(t² − 2·re·t + re² + im²). Cardano puts the real root a rounding off
    // zero, where d = 0 made it look like the largest root to divide out —
    // from the wrong end, which threw the complex pair into real garbage.
    const [re, im] = [-17.977483840786544, 5.901254438645678];
    const roots = solveCubic(1, -2 * re, re * re + im * im, 0);
    expect(roots).toHaveLength(1);
    expect(Math.abs(roots[0] ?? NaN)).toBeLessThan(1e-12);
  });

  it('recovers the roots of k·(t − r1)(t − r2)(t − r3) at any scale, one root as far out as you like', () => {
    // A root out near −b/a is what makes a tiny t³ term hard: Cardano works
    // about that shift. The far root may be dropped; the near ones may not.
    const far = fc
      .tuple(fc.double({ min: 0, max: 14, noNaN: true }), fc.boolean())
      .map(([exponent, negative]) => (negative ? -1 : 1) * 10 ** exponent);
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 2, noNaN: true }),
        fc.double({ min: -1, max: 2, noNaN: true }),
        far,
        scale,
        (r1, r2, r3, k) => {
          const truth = [r1, r2, r3];
          // Well-separated only: a near-double root is ill-conditioned.
          if (truth.some((x, i) => truth.some((y, j) => i < j && Math.abs(x - y) < 0.01))) {
            return true;
          }
          const found = solveCubic(
            k,
            -k * (r1 + r2 + r3),
            k * (r1 * r2 + r1 * r3 + r2 * r3),
            -k * r1 * r2 * r3,
          );
          return agreesOnTheUnitInterval(found, truth);
        },
      ),
    );
  });

  it('recovers the roots of a quadratic drawn as a cubic far from the origin, whose t³ term is only rounding', () => {
    // The shape of Q38: control values placed at ±2000 mm and measured from a
    // ray there, as containsPoint does, so the t³ coefficient that is zero on
    // paper carries a few ulps of the coordinates.
    fc.assert(
      fc.property(
        fc.double({ min: -0.5, max: 1.5, noNaN: true }),
        fc.double({ min: -0.5, max: 1.5, noNaN: true }),
        scale,
        arbCoord,
        (r1, r2, k, offset) => {
          if (Math.abs(r1 - r2) < 0.01) return true;
          // k·(t − r1)(t − r2) as a Bézier's control values, degree-elevated.
          const [b, c, d] = [k, -k * (r1 + r2), k * r1 * r2];
          const ys = [d, d + c / 3, d + (2 * c) / 3 + b / 3, d + c + b];
          // A t³ term of noise has a root of its own, beyond 1e9 and genuine.
          const found = solveCubic(...coefficientsAgainstRay(ys, offset)).filter(
            (t) => Math.abs(t) < 1e6,
          );
          return agreesOnTheUnitInterval(found, [r1, r2]);
        },
      ),
    );
  });

  it('never reads the tangent touch of a near-symmetric curve far from the origin as a crossing elsewhere', () => {
    // A cubic symmetric about t = 0.5 is a quadratic on paper, touched at
    // t = 0.5 by the ray level with its extreme. Q38's was symmetric but for
    // a few ulps between its inner control points, and its end ones may differ
    // as much. That may split the touch into two roots close by, or remove it
    // — but a root anywhere else in [0, 1] is a crossing that is not there.
    const ulps = fc.integer({ min: -4, max: 4 });
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        arbCoord,
        ulps,
        ulps,
        (end, inner, offset, innerUlps, endUlps) => {
          if (Math.abs(end - inner) < 0.01) return true;
          const ulp = Number.EPSILON * Math.max(1, Math.abs(offset));
          const extreme = (end + 3 * inner) / 4;
          const ys = [end, inner, inner + innerUlps * ulp, end + endUlps * ulp].map(
            (y) => y - extreme,
          );
          const found = rootsInUnitInterval(solveCubic(...coefficientsAgainstRay(ys, offset)));
          return found.every((t) => Math.abs(t - 0.5) < 1e-4);
        },
      ),
    );
  });
});

/** ±10⁻² to ±10³: a curve 0.1 mm across up to one a couple of metres across. */
const scale = fc
  .tuple(fc.double({ min: -2, max: 3, noNaN: true }), fc.boolean())
  .map(([exponent, negative]) => (negative ? -1 : 1) * 10 ** exponent);

/**
 * The cubic `y(t) − ray` for a Bézier whose control values are `ys` above the
 * ray, with both moved `offset` from the origin first — so the coefficients
 * carry that coordinate's rounding, exactly as `containsPoint` forms them.
 */
function coefficientsAgainstRay(
  ys: readonly number[],
  offset: number,
): [number, number, number, number] {
  const [y0, y1, y2, y3] = ys.map((y) => y + offset - offset) as [number, number, number, number];
  return [-y0 + 3 * y1 - 3 * y2 + y3, 3 * y0 - 6 * y1 + 3 * y2, -3 * y0 + 3 * y1, y0];
}

/**
 * Every root found is one of `truth`, and every one of `truth` in [0, 1] is
 * found — the two halves a curve's crossings depend on.
 */
function agreesOnTheUnitInterval(found: readonly number[], truth: readonly number[]): boolean {
  const near = (x: number, y: number): boolean =>
    Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
  return (
    found.every((t) => truth.some((r) => near(t, r))) &&
    truth.every((r) => r < 0 || r > 1 || found.some((t) => near(t, r)))
  );
}

describe('rootsInUnitInterval', () => {
  it('keeps only the open interval', () => {
    expect(rootsInUnitInterval([-0.1, 0, 0.5, 1, 1.2])).toEqual([0.5]);
  });
});
