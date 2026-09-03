import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbRigidTransform, arbVec2 } from '../test/arbitraries.js';
import { fromRotation, fromTranslation } from './mat2x3.js';
import {
  area,
  centre,
  containsPoint,
  containsRect,
  corners,
  equals as rectEquals,
  expand,
  fromCorners,
  fromOriginSize,
  fromPoints,
  height,
  intersection,
  intersects,
  isEmpty,
  transform,
  translate,
  union,
  unionAll,
  width,
} from './rect.js';
import { vec } from './vec2.js';

const closeTo = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe('construction', () => {
  it('normalises corners given in any order', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (a, b) => {
        const r = fromCorners(a, b);
        return r.minX <= r.maxX && r.minY <= r.maxY;
      }),
    );
  });

  it('gives the same rect for either corner order', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (a, b) => rectEquals(fromCorners(a, b), fromCorners(b, a))),
    );
  });

  it('fromOriginSize handles a negative size', () => {
    const r = fromOriginSize(vec(10, 10), -4, -6);
    expect(r).toEqual({ minX: 6, minY: 4, maxX: 10, maxY: 10 });
  });

  it('fromPoints returns null for an empty input', () => {
    // There is no bounding box of nothing, and returning a zero rect at the
    // origin would silently drag "fit to content" toward (0,0).
    expect(fromPoints([])).toBeNull();
  });

  it('fromPoints contains every input point', () => {
    fc.assert(
      fc.property(fc.array(arbVec2, { minLength: 1, maxLength: 40 }), (points) => {
        const r = fromPoints(points);
        return r !== null && points.every((p) => containsPoint(r, p));
      }),
    );
  });

  it('fromPoints is tight — some point touches each side', () => {
    // Tightness is the half that catches a bounding box built from the wrong
    // set of candidates.
    fc.assert(
      fc.property(fc.array(arbVec2, { minLength: 1, maxLength: 40 }), (points) => {
        const r = fromPoints(points);
        if (r === null) return false;
        return (
          points.some((p) => closeTo(p.x, r.minX)) &&
          points.some((p) => closeTo(p.x, r.maxX)) &&
          points.some((p) => closeTo(p.y, r.minY)) &&
          points.some((p) => closeTo(p.y, r.maxY))
        );
      }),
    );
  });
});

describe('measurements', () => {
  it('width, height and area agree', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (a, b) => {
        const r = fromCorners(a, b);
        return closeTo(area(r), width(r) * height(r), 1e-6) && width(r) >= 0 && height(r) >= 0;
      }),
    );
  });

  it('centre is inside the rect', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (a, b) =>
        containsPoint(fromCorners(a, b), centre(fromCorners(a, b))),
      ),
    );
  });

  it('corners run counter-clockwise starting bottom-left, with Y up', () => {
    const r = fromCorners(vec(0, 0), vec(10, 5));
    expect(corners(r)).toEqual([vec(0, 0), vec(10, 0), vec(10, 5), vec(0, 5)]);
  });

  it('isEmpty for a degenerate rect', () => {
    expect(isEmpty(fromCorners(vec(1, 1), vec(1, 5)))).toBe(true);
    expect(isEmpty(fromCorners(vec(1, 1), vec(5, 1)))).toBe(true);
    expect(isEmpty(fromCorners(vec(1, 1), vec(5, 5)))).toBe(false);
  });
});

describe('containment', () => {
  it('contains its own corners', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (a, b) => {
        const r = fromCorners(a, b);
        return corners(r).every((c) => containsPoint(r, c));
      }),
    );
  });

  it('a rect contains itself', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (a, b) => containsRect(fromCorners(a, b), fromCorners(a, b))),
    );
  });

  it('expanding produces a container', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, fc.double({ min: 0, max: 100, noNaN: true }), (a, b, m) => {
        const r = fromCorners(a, b);
        return containsRect(expand(r, m), r);
      }),
    );
  });

  it('rejects a point outside', () => {
    const r = fromCorners(vec(0, 0), vec(10, 10));
    expect(containsPoint(r, vec(-1, 5))).toBe(false);
    expect(containsPoint(r, vec(5, 11))).toBe(false);
  });
});

describe('union and intersection', () => {
  it('union contains both inputs', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, arbVec2, (a, b, c, d) => {
        const r1 = fromCorners(a, b);
        const r2 = fromCorners(c, d);
        const u = union(r1, r2);
        return containsRect(u, r1) && containsRect(u, r2);
      }),
    );
  });

  it('union is commutative and idempotent', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, arbVec2, (a, b, c, d) => {
        const r1 = fromCorners(a, b);
        const r2 = fromCorners(c, d);
        return rectEquals(union(r1, r2), union(r2, r1)) && rectEquals(union(r1, r1), r1);
      }),
    );
  });

  it('unionAll returns null for an empty input', () => {
    expect(unionAll([])).toBeNull();
  });

  it('intersection is contained in both inputs when it exists', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, arbVec2, (a, b, c, d) => {
        const r1 = fromCorners(a, b);
        const r2 = fromCorners(c, d);
        const i = intersection(r1, r2);
        if (i === null) return true;
        return containsRect(r1, i) && containsRect(r2, i);
      }),
    );
  });

  it('intersection exists exactly when the rects intersect', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, arbVec2, (a, b, c, d) => {
        const r1 = fromCorners(a, b);
        const r2 = fromCorners(c, d);
        return (intersection(r1, r2) !== null) === intersects(r1, r2);
      }),
    );
  });

  it('agrees with intersects for rects separated by a subnormal', () => {
    // Regression: fast-check shrank to two degenerate rects 5e-324 apart — the
    // smallest representable double. intersects() said yes (tolerant),
    // intersection() said no (exact). Two functions answering the same
    // question differently is the worst kind of inconsistency to debug.
    const r1 = fromCorners(vec(0, 0), vec(0, 0));
    const r2 = fromCorners(vec(-5e-324, 0), vec(-5e-324, 0));

    expect(intersects(r1, r2)).toBe(true);
    expect(intersection(r1, r2)).not.toBeNull();
  });

  it('collapses rather than inverting when edges touch within tolerance', () => {
    const i = intersection(fromCorners(vec(0, 0), vec(1, 1)), fromCorners(vec(1, 0), vec(2, 1)));
    expect(i).not.toBeNull();
    // The minX <= maxX invariant must survive the boundary case.
    expect(i!.minX).toBeLessThanOrEqual(i!.maxX);
    expect(i!.minY).toBeLessThanOrEqual(i!.maxY);
  });

  it('returns null for disjoint rects', () => {
    const r1 = fromCorners(vec(0, 0), vec(1, 1));
    const r2 = fromCorners(vec(5, 5), vec(6, 6));
    expect(intersection(r1, r2)).toBeNull();
    expect(intersects(r1, r2)).toBe(false);
  });

  it('counts touching edges as intersecting', () => {
    const r1 = fromCorners(vec(0, 0), vec(1, 1));
    const r2 = fromCorners(vec(1, 0), vec(2, 1));
    expect(intersects(r1, r2)).toBe(true);
  });
});

describe('transform', () => {
  it('translation preserves size', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, (a, b, offset) => {
        const r = fromCorners(a, b);
        const moved = transform(r, fromTranslation(offset));
        return closeTo(width(moved), width(r), 1e-6) && closeTo(height(moved), height(r), 1e-6);
      }),
    );
  });

  it('agrees with translate for a pure translation', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, (a, b, offset) =>
        rectEquals(
          transform(fromCorners(a, b), fromTranslation(offset)),
          translate(fromCorners(a, b), offset),
          1e-6,
        ),
      ),
    );
  });

  it('a quarter-turn swaps width and height', () => {
    const r = fromCorners(vec(0, 0), vec(10, 4));
    const rotated = transform(r, fromRotation(Math.PI / 2));
    expect(closeTo(width(rotated), 4, 1e-9)).toBe(true);
    expect(closeTo(height(rotated), 10, 1e-9)).toBe(true);
  });

  it('never shrinks under a rigid transform', () => {
    // The bounds of a rotated box, not the rotated bounds — larger is correct
    // and unavoidable for an axis-aligned representation.
    fc.assert(
      fc.property(arbVec2, arbVec2, arbRigidTransform, (a, b, m) => {
        const r = fromCorners(a, b);
        const t = transform(r, m);
        const diagonal = Math.hypot(width(r), height(r));
        return width(t) <= diagonal + 1e-6 && height(t) <= diagonal + 1e-6;
      }),
    );
  });
});
