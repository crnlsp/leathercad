/**
 * @leathercad/core — the bottom layer.
 *
 * Tolerances, quantisation, guards, ids and Result. Imports nothing.
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
  EPS_LENGTH,
  EPS_PARAM,
  EPS_POINT,
  approxCmp,
  approxEq,
  approxGte,
  approxLte,
  approxZero,
} from './epsilon.js';

export { QUANTUM_MM, quantise } from './quantise.js';

export { assertFinite, invariant } from './guard.js';

export { CROCKFORD_ALPHABET, createIdFactory, type IdSource, type Ulid } from './id.js';

export {
  err,
  isErr,
  isOk,
  mapOk,
  ok,
  unwrap,
  unwrapOr,
  type Err,
  type Ok,
  type Result,
} from './result.js';
