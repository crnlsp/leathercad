import { isErr, isOk, unwrap } from '@leathercad/core';
import { MatOps, PathOps, uniformRadii, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ParametricShape } from './feature.js';
import { transformShape } from './transformShape.js';

const rect = (origin: Vec2 = { x: 0, y: 0 }, rotation = 0): ParametricShape => ({
  type: 'rect',
  origin,
  width: 100,
  height: 50,
  radii: uniformRadii(5),
  rotation,
});

const circle = (centre: Vec2 = { x: 10, y: 10 }, radius = 20): ParametricShape => ({
  type: 'circle',
  centre,
  radius,
});

const arc = (sweep = Math.PI / 2): ParametricShape => ({
  type: 'arc',
  centre: { x: 10, y: 10 },
  radius: 20,
  startAngle: 0,
  sweepAngle: sweep,
});

describe('translation', () => {
  it('moves the locating parameter and touches nothing else', () => {
    const m = MatOps.fromTranslation({ x: 3, y: -4 });

    expect(unwrap(transformShape(rect({ x: 1, y: 1 }), m))).toEqual(rect({ x: 4, y: -3 }));
    expect(unwrap(transformShape(circle({ x: 0, y: 0 }), m))).toEqual(circle({ x: 3, y: -4 }));

    const moved = unwrap(transformShape(arc(), m));
    expect(moved.type).toBe('arc');
    if (moved.type !== 'arc') return;
    expect(moved.centre).toEqual({ x: 13, y: 6 });
    expect(moved.radius).toBe(20);
    expect(moved.startAngle).toBeCloseTo(0, 12);
    expect(moved.sweepAngle).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('rotation', () => {
  it('turns a rectangle through its rotation parameter', () => {
    const turned = unwrap(transformShape(rect(), MatOps.fromRotation(Math.PI / 4)));

    expect(turned.type).toBe('rect');
    if (turned.type !== 'rect') return;
    expect(turned.rotation).toBeCloseTo(Math.PI / 4, 12);
    // The rectangle is still 100 x 50: a rotation resizes nothing.
    expect(turned.width).toBe(100);
    expect(turned.height).toBe(50);
  });

  it('accumulates on a rectangle already turned', () => {
    const turned = unwrap(transformShape(rect({ x: 0, y: 0 }, 0.5), MatOps.fromRotation(0.25)));

    expect(turned.type === 'rect' && turned.rotation).toBeCloseTo(0.75, 12);
  });

  it('only moves a circle, which has no orientation to change', () => {
    const turned = unwrap(
      transformShape(circle({ x: 10, y: 0 }, 20), MatOps.fromRotation(Math.PI)),
    );

    expect(turned.type).toBe('circle');
    if (turned.type !== 'circle') return;
    expect(turned.centre.x).toBeCloseTo(-10, 12);
    expect(turned.centre.y).toBeCloseTo(0, 12);
    expect(turned.radius).toBe(20);
  });

  it('advances an arc’s start angle and leaves its sweep alone', () => {
    const turned = unwrap(transformShape(arc(), MatOps.fromRotation(Math.PI / 2)));

    expect(turned.type).toBe('arc');
    if (turned.type !== 'arc') return;
    expect(turned.startAngle).toBeCloseTo(Math.PI / 2, 9);
    expect(turned.sweepAngle).toBeCloseTo(Math.PI / 2, 9);
    expect(turned.radius).toBeCloseTo(20, 9);
  });
});

describe('uniform scale', () => {
  it('scales a circle’s radius', () => {
    const bigger = unwrap(transformShape(circle({ x: 0, y: 0 }, 20), MatOps.fromScale(3, 3)));

    expect(bigger.type === 'circle' && bigger.radius).toBeCloseTo(60, 12);
  });

  it('scales an arc’s radius and leaves both angles alone', () => {
    const bigger = unwrap(transformShape(arc(), MatOps.fromScale(2, 2)));

    expect(bigger.type).toBe('arc');
    if (bigger.type !== 'arc') return;
    expect(bigger.radius).toBeCloseTo(40, 9);
    expect(bigger.startAngle).toBeCloseTo(0, 9);
    expect(bigger.sweepAngle).toBeCloseTo(Math.PI / 2, 9);
  });

  it('scales a rectangle’s size and its corner radii together', () => {
    const bigger = unwrap(transformShape(rect(), MatOps.fromScale(2, 2)));

    expect(bigger.type).toBe('rect');
    if (bigger.type !== 'rect') return;
    expect(bigger.width).toBeCloseTo(200, 12);
    expect(bigger.height).toBeCloseTo(100, 12);
    expect(bigger.radii.topLeft).toBeCloseTo(10, 12);
  });
});

describe('mirror', () => {
  it('negates an arc’s sweep — it bends the other way now', () => {
    const flipped = unwrap(transformShape(arc(Math.PI / 2), MatOps.fromMirror({ x: 0, y: 0 }, 0)));

    expect(flipped.type).toBe('arc');
    if (flipped.type !== 'arc') return;
    expect(flipped.sweepAngle).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('keeps a mirrored arc’s radius', () => {
    const flipped = unwrap(transformShape(arc(), MatOps.fromMirror({ x: 0, y: 0 }, Math.PI / 3)));

    expect(flipped.type === 'arc' && flipped.radius).toBeCloseTo(20, 9);
  });
});

describe('non-uniform scale', () => {
  const squash = MatOps.fromScale(2, 1);

  it('stretches a rectangle through its parameters, keeping the corners circular', () => {
    const wide = unwrap(transformShape(rect(), squash));

    expect(wide.type).toBe('rect');
    if (wide.type !== 'rect') return;
    expect(wide.width).toBeCloseTo(200, 12);
    expect(wide.height).toBeCloseTo(50, 12);
    // Nobody wants their 5 mm corners to become ellipses because they widened
    // the panel. geometry.md 4.2 rule 1.
    expect(wide.radii.topLeft).toBe(5);
  });

  it('refuses a circle rather than quietly making an ellipse', () => {
    const result = transformShape(circle(), squash);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toEqual({ code: 'WOULD_BECOME_ELLIPSE', facts: { shape: 'circle' } });
  });

  it('refuses an arc, and leaves the record untouched', () => {
    const before = arc();
    const result = transformShape(before, squash);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toEqual({ code: 'WOULD_BECOME_ELLIPSE', facts: { shape: 'arc' } });
    // Nothing was rebuilt or rounded.
    expect(before).toEqual(arc());
  });

  it('refuses a rotated rectangle, whose stretch is no longer axis-aligned', () => {
    // Stretching along X a rectangle that sits at 30 degrees shears it: the
    // corners stop being right angles, which no rect record can describe.
    const result = transformShape(rect({ x: 0, y: 0 }, Math.PI / 6), squash);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toEqual({ code: 'WOULD_SHEAR', facts: {} });
  });
});

describe('degenerate transforms', () => {
  it('refuses a zero scale for every shape, as the same problem', () => {
    const flat = MatOps.fromScale(1, 0);
    const flattens = { ok: false, error: { code: 'TRANSFORM_FLATTENS', facts: {} } };

    // Checked before the shape is looked at: a singular matrix is wrong for
    // everything, so it must not come back as "would become an ellipse".
    expect(transformShape(rect(), flat)).toEqual(flattens);
    expect(transformShape(circle(), flat)).toEqual(flattens);
    expect(transformShape(arc(), flat)).toEqual(flattens);
  });
});

describe('round trip', () => {
  it('recovers the original parameters under any similarity and its inverse', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (dx, dy, angle, scale) => {
          const m = MatOps.composeAll(
            MatOps.fromScale(scale, scale),
            MatOps.fromRotation(angle),
            MatOps.fromTranslation({ x: dx, y: dy }),
          );

          const there = transformShape(arc(), m);
          expect(isOk(there)).toBe(true);
          if (!isOk(there)) return;

          const back = transformShape(there.value, MatOps.invert(m));
          expect(isOk(back)).toBe(true);
          if (!isOk(back) || back.value.type !== 'arc') return;

          expect(back.value.centre.x).toBeCloseTo(10, 6);
          expect(back.value.centre.y).toBeCloseTo(10, 6);
          expect(back.value.radius).toBeCloseTo(20, 6);
          expect(back.value.sweepAngle).toBeCloseTo(Math.PI / 2, 6);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('the evaluated geometry agrees with the parameters', () => {
  it('rotates a rectangle without turning its corners into ellipses', () => {
    // A rotation is a similarity, so PathOps.transform keeps the corner arcs as
    // arcs. If it ever converts them to cubics, this length drifts.
    const straight = unwrap(transformShape(rect(), MatOps.IDENTITY));
    const turned = unwrap(transformShape(rect(), MatOps.fromRotation(0.7)));

    expect(straight.type).toBe('rect');
    expect(turned.type).toBe('rect');
    if (straight.type !== 'rect' || turned.type !== 'rect') return;
    expect(turned.width).toBe(straight.width);
    expect(turned.height).toBe(straight.height);
    expect(turned.radii).toEqual(straight.radii);
  });
});

describe('paths are not this function’s business', () => {
  it('leaves drawn geometry to PathOps.transform, which converts arcs to cubics', () => {
    // Rule 2, unchanged: a drawn path has no parameters to protect, so a
    // non-uniform scale flattens its arcs rather than refusing.
    const drawn = PathOps.transform(
      PathOps.open([
        { kind: 'arc', centre: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweepAngle: 1 },
      ]),
      MatOps.fromScale(2, 1),
    );

    expect(drawn.segments.every((s) => s.kind === 'cubic')).toBe(true);
  });
});
