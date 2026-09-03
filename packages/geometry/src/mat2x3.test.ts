import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbAngle, arbRigidTransform, arbScaleFactor, arbVec2 } from '../test/arbitraries.js';
import {
  IDENTITY,
  apply,
  applyDirection,
  compose,
  composeAll,
  determinant,
  equals as matEquals,
  fromMirror,
  fromRotation,
  fromRotationAround,
  fromScale,
  fromTranslation,
  invert,
  isIdentity,
  isMirrored,
  isSimilarity,
  mirrorPoint,
  uniformScaleOf,
} from './mat2x3.js';
import { dist, equals as vecEquals, vec } from './vec2.js';

const closeTo = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe('apply', () => {
  it('identity leaves a point unchanged', () => {
    fc.assert(fc.property(arbVec2, (p) => vecEquals(apply(IDENTITY, p), p)));
  });

  it('translation moves by the offset', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (p, offset) =>
        vecEquals(
          apply(fromTranslation(offset), p),
          { x: p.x + offset.x, y: p.y + offset.y },
          1e-9,
        ),
      ),
    );
  });

  it('applyDirection ignores translation', () => {
    // Applying the full transform to a tangent shifts it by the translation —
    // a bug that only appears once something is moved away from the origin.
    fc.assert(
      fc.property(arbVec2, arbVec2, (v, offset) =>
        vecEquals(applyDirection(fromTranslation(offset), v), v, 1e-9),
      ),
    );
  });
});

describe('compose', () => {
  it('applies the first transform, then the second', () => {
    // Argument order is chronological. The matrix product runs the other way,
    // and getting it backwards mirrors output in ways that look plausible.
    fc.assert(
      fc.property(arbVec2, arbRigidTransform, arbRigidTransform, (p, first, second) =>
        vecEquals(apply(compose(first, second), p), apply(second, apply(first, p)), 1e-6),
      ),
    );
  });

  it('is associative', () => {
    fc.assert(
      fc.property(arbRigidTransform, arbRigidTransform, arbRigidTransform, (m1, m2, m3) =>
        matEquals(compose(compose(m1, m2), m3), compose(m1, compose(m2, m3)), 1e-9),
      ),
    );
  });

  it('identity is a left and right unit', () => {
    fc.assert(
      fc.property(arbRigidTransform, (m) => {
        return matEquals(compose(m, IDENTITY), m) && matEquals(compose(IDENTITY, m), m);
      }),
    );
  });

  it('composeAll matches repeated compose', () => {
    fc.assert(
      fc.property(arbRigidTransform, arbRigidTransform, (m1, m2) =>
        matEquals(composeAll(m1, m2), compose(m1, m2)),
      ),
    );
  });

  it('composeAll of nothing is the identity', () => {
    expect(isIdentity(composeAll())).toBe(true);
  });
});

describe('invert', () => {
  it('round-trips a point through any invertible transform', () => {
    fc.assert(
      fc.property(arbVec2, arbRigidTransform, (p, m) =>
        vecEquals(apply(invert(m), apply(m, p)), p, 1e-6),
      ),
    );
  });

  it('round-trips through a scaled transform', () => {
    fc.assert(
      fc.property(arbVec2, arbScaleFactor, arbScaleFactor, (p, sx, sy) => {
        const m = fromScale(sx, sy);
        return vecEquals(apply(invert(m), apply(m, p)), p, 1e-6);
      }),
    );
  });

  it('composing a transform with its inverse gives the identity', () => {
    fc.assert(fc.property(arbRigidTransform, (m) => isIdentity(compose(m, invert(m)), 1e-9)));
  });

  it('throws on a singular matrix rather than producing Infinity', () => {
    expect(() => invert(fromScale(0, 1))).toThrow(RangeError);
    expect(() => invert({ a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 })).toThrow(RangeError);
  });
});

describe('rotation', () => {
  it('rotates counter-clockwise for a positive angle', () => {
    const r = apply(fromRotation(Math.PI / 2), vec(1, 0));
    expect(closeTo(r.x, 0)).toBe(true);
    expect(closeTo(r.y, 1)).toBe(true);
  });

  it('preserves distance between points', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbAngle, (p, q, t) => {
        const m = fromRotation(t);
        return closeTo(dist(apply(m, p), apply(m, q)), dist(p, q), 1e-6);
      }),
    );
  });

  it('fromRotationAround leaves the centre fixed', () => {
    fc.assert(
      fc.property(arbVec2, arbAngle, (c, t) =>
        vecEquals(apply(fromRotationAround(c, t), c), c, 1e-6),
      ),
    );
  });

  it('has determinant 1 and is not mirrored', () => {
    fc.assert(
      fc.property(arbAngle, (t) => {
        const m = fromRotation(t);
        return closeTo(determinant(m), 1, 1e-9) && !isMirrored(m);
      }),
    );
  });
});

describe('mirror', () => {
  it('is its own inverse', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbAngle, (p, origin, t) => {
        const m = fromMirror(origin, t);
        return vecEquals(apply(m, apply(m, p)), p, 1e-6);
      }),
    );
  });

  it('leaves points on the mirror line fixed', () => {
    fc.assert(
      fc.property(
        arbVec2,
        arbAngle,
        fc.double({ min: -100, max: 100, noNaN: true }),
        (origin, t, d) => {
          const onLine = { x: origin.x + Math.cos(t) * d, y: origin.y + Math.sin(t) * d };
          return vecEquals(apply(fromMirror(origin, t), onLine), onLine, 1e-6);
        },
      ),
    );
  });

  it('mirrors across the X axis as expected', () => {
    expect(vecEquals(apply(fromMirror(vec(0, 0), 0), vec(3, 5)), vec(3, -5), 1e-9)).toBe(true);
  });

  it('mirrors across the Y axis as expected', () => {
    expect(vecEquals(apply(fromMirror(vec(0, 0), Math.PI / 2), vec(3, 5)), vec(-3, 5), 1e-9)).toBe(
      true,
    );
  });

  it('flips handedness', () => {
    fc.assert(fc.property(arbVec2, arbAngle, (o, t) => isMirrored(fromMirror(o, t))));
  });

  it('mirrorPoint agrees with the matrix form', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbAngle, (p, o, t) =>
        vecEquals(mirrorPoint(p, o, t), apply(fromMirror(o, t), p), 1e-6),
      ),
    );
  });

  it('preserves distance', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, arbAngle, (p, q, o, t) => {
        const m = fromMirror(o, t);
        return closeTo(dist(apply(m, p), apply(m, q)), dist(p, q), 1e-6);
      }),
    );
  });
});

describe('isSimilarity', () => {
  it('accepts rotations, translations, mirrors and uniform scales', () => {
    fc.assert(fc.property(arbRigidTransform, (m) => isSimilarity(m)));
    fc.assert(
      fc.property(arbScaleFactor, arbAngle, (s, t) =>
        isSimilarity(compose(fromScale(s, s), fromRotation(t))),
      ),
    );
  });

  it('rejects a non-uniform scale', () => {
    // The test that decides whether an arc survives a transform as an arc.
    // A non-uniform scale makes it an ellipse, which Segment cannot represent.
    expect(isSimilarity(fromScale(2, 3))).toBe(false);
    expect(isSimilarity(fromScale(1, -2))).toBe(false);
  });

  it('rejects a shear', () => {
    expect(isSimilarity({ a: 1, b: 0, c: 0.5, d: 1, e: 0, f: 0 })).toBe(false);
  });

  it('accepts the identity and pure translation', () => {
    expect(isSimilarity(IDENTITY)).toBe(true);
    expect(isSimilarity(fromTranslation(vec(10, -4)))).toBe(true);
  });
});

describe('uniformScaleOf', () => {
  it('is 1 for a rigid transform', () => {
    fc.assert(fc.property(arbRigidTransform, (m) => closeTo(uniformScaleOf(m), 1, 1e-9)));
  });

  it('recovers the factor from a uniform scale', () => {
    fc.assert(
      fc.property(arbScaleFactor, (s) =>
        closeTo(uniformScaleOf(fromScale(s, s)), Math.abs(s), 1e-6),
      ),
    );
  });
});
