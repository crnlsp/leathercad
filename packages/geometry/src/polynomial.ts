/**
 * Real roots of low-degree polynomials.
 *
 * Used wherever a curve has to be intersected with something: ray casting for
 * point-in-path, axis crossings for exact bounds, and segment intersection.
 *
 * Every solver returns roots in ascending order and polishes each one with
 * Newton iterations, because the closed forms lose precision badly near
 * repeated roots — exactly the configurations that tangency produces.
 */

const COEFFICIENT_EPS = 1e-12;

/** Roots of `a·t + b`. */
export function solveLinear(a: number, b: number): number[] {
  if (Math.abs(a) < COEFFICIENT_EPS) return [];
  return [-b / a];
}

/** Roots of `a·t² + b·t + c`, ascending. */
export function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < COEFFICIENT_EPS) return solveLinear(b, c);

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];

  // A tangency almost never produces a discriminant of exactly zero, and the
  // two roots derived from a near-zero one are numerically worthless — they
  // differ only in digits the subtraction already destroyed. Treating a
  // relatively tiny discriminant as a genuine double root is both more honest
  // and more stable, and tangency is exactly what curve intersection produces.
  const magnitude = Math.max(Math.abs(b * b), Math.abs(4 * a * c));
  if (discriminant <= magnitude * 1e-14) return [-b / (2 * a)];

  // The textbook form loses most of its digits when b² ≫ 4ac, because one
  // root comes from subtracting two nearly equal numbers. Computing the
  // larger-magnitude root first and deriving the other from the product
  // avoids that entirely.
  const root = Math.sqrt(discriminant);
  const q = b >= 0 ? -0.5 * (b + root) : -0.5 * (b - root);
  const roots = [q / a, c / q];
  return roots.sort((x, y) => x - y);
}

/**
 * Real roots of `a·t³ + b·t² + c·t + d`, ascending.
 *
 * Depresses to `t³ + p·t + q` and branches on the discriminant: one real root
 * when positive, three when negative (via the trigonometric form, which avoids
 * the complex arithmetic Cardano's formula would otherwise need), and a
 * repeated root when it vanishes.
 */
export function solveCubic(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < COEFFICIENT_EPS) return solveQuadratic(b, c, d);

  const bn = b / a;
  const cn = c / a;
  const dn = d / a;

  const shift = -bn / 3;
  const p = cn - (bn * bn) / 3;
  const q = (2 * bn * bn * bn) / 27 - (bn * cn) / 3 + dn;

  const roots: number[] = [];

  if (Math.abs(p) < COEFFICIENT_EPS && Math.abs(q) < COEFFICIENT_EPS) {
    roots.push(shift);
  } else {
    const discriminant = (q * q) / 4 + (p * p * p) / 27;

    if (discriminant > COEFFICIENT_EPS) {
      const root = Math.sqrt(discriminant);
      roots.push(Math.cbrt(-q / 2 + root) + Math.cbrt(-q / 2 - root) + shift);
    } else if (discriminant < -COEFFICIENT_EPS) {
      // Three distinct real roots. p is necessarily negative here.
      const magnitude = 2 * Math.sqrt(-p / 3);
      const argument = Math.acos(clamp((3 * q) / (p * magnitude), -1, 1)) / 3;
      const third = (2 * Math.PI) / 3;
      roots.push(
        magnitude * Math.cos(argument) + shift,
        magnitude * Math.cos(argument - third) + shift,
        magnitude * Math.cos(argument - 2 * third) + shift,
      );
    } else {
      // Repeated root: a double and a single.
      const single = Math.cbrt(-q / 2);
      roots.push(2 * single + shift, -single + shift);
    }
  }

  const polished = roots.map((t) => polishCubicRoot(a, b, c, d, t));
  return dedupe(polished.sort((x, y) => x - y));
}

/**
 * Two Newton steps against the original coefficients.
 *
 * The depressed-cubic route accumulates error through the cube roots and the
 * arccosine; polishing recovers it cheaply. Skipped where the derivative is
 * flat, since Newton diverges there and the unpolished root is the better
 * answer.
 */
function polishCubicRoot(a: number, b: number, c: number, d: number, t: number): number {
  let root = t;
  for (let i = 0; i < 2; i++) {
    const value = ((a * root + b) * root + c) * root + d;
    const slope = (3 * a * root + 2 * b) * root + c;
    if (Math.abs(slope) < 1e-14) break;
    const step = value / slope;
    if (!Number.isFinite(step)) break;
    root -= step;
  }
  return root;
}

function dedupe(sorted: number[]): number[] {
  const result: number[] = [];
  for (const value of sorted) {
    const last = result[result.length - 1];
    if (last === undefined || Math.abs(value - last) > 1e-9) result.push(value);
  }
  return result;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Keeps only roots inside the open interval (0, 1). */
export function rootsInUnitInterval(roots: readonly number[]): number[] {
  return roots.filter((t) => t > 0 && t < 1);
}
