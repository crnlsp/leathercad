/**
 * @leathercad/core — the bottom layer.
 *
 * Tolerances, quantisation, guards, ids, Result, and how a number is written.
 * Imports nothing.
 * Everything else in the workspace is built on top of it.
 */

/**
 * Millimetres are the source of truth throughout LeatherCAD.
 *
 * A documentation alias, not a branded type: TypeScript arithmetic drops a
 * brand on every add and multiply, which would mean thousands of re-casts in
 * the geometry engine for a mistake the layering already prevents —
 * packages/geometry cannot reference pixels at all. See CLAUDE.md invariant 1.
 */
export type Mm = number;

/** Radians. Angles are counter-clockwise from +X, and Y points up. */
export type Radians = number;

export {
  EPS_ANGLE,
  EPS_AREA,
  EPS_COEFFICIENT,
  EPS_LENGTH,
  EPS_NEWTON_SLOPE,
  EPS_PARAM,
  EPS_POINT,
  EPS_RATIO,
  EPS_REL_CUBIC_DISCRIMINANT,
  EPS_REL_QUADRATIC_DISCRIMINANT,
  EPS_REL_ROOT,
  approxCmp,
  approxEq,
  approxGte,
  approxLte,
  approxZero,
} from './epsilon.js';

export { QUANTUM_MM, quantise, quantiseAtLeast, quantiseAtMost } from './quantise.js';

export {
  MINUS,
  formatAngle,
  formatEditable,
  formatMm,
  formatNumber,
  parseNumber,
} from './format.js';

export { MM_PER_INCH, parseLength, type LengthError } from './length.js';

export { assertFinite, invariant } from './guard.js';

export { CROCKFORD_ALPHABET, createIdFactory, type IdSource, type Ulid } from './id.js';

export { err, isErr, isOk, ok, unwrap, type Err, type Ok, type Result } from './result.js';
