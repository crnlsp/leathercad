import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MatOps, PathOps, polyline, Shapes, type Path } from '@leathercad/geometry';
import { assignRoles, LIKELY_HOLE_MAX_DIAMETER_MM, type LayerName } from './roles.js';

const shape = (paths: Path[], layer?: LayerName) => ({
  paths,
  ...(layer === undefined ? {} : { layer }),
});
const square = (x: number, y: number, size: number): Path => Shapes.rect({ x, y }, size, size);
/** `count` equal circles from `from`, `pitch` apart along `angle`. */
const row = (count: number, from: { x: number; y: number }, pitch: number, d: number, angle = 0) =>
  Array.from({ length: count }, (_, i) =>
    Shapes.circle(
      { x: from.x + i * pitch * Math.cos(angle), y: from.y + i * pitch * Math.sin(angle) },
      d / 2,
    ),
  );
const counts = (pattern: ReturnType<typeof assignRoles>) =>
  pattern.pieces.map((p) => ({
    cutOuts: p.cutOuts.length,
    stitch: p.stitchLines.length,
    folds: p.foldLines.length,
    markings: p.markings.length,
  }));

describe('roles by shape (9.20b)', () => {
  it('a closed outline, a cut-out inside it, an open line and a row of small circles', () => {
    const pattern = assignRoles([
      shape([square(0, 0, 100)]),
      shape([square(40, 40, 20)]),
      shape([Shapes.line({ x: 50, y: 0 }, { x: 50, y: 100 })]),
      ...row(12, { x: 5, y: 5 }, 3.85, 1.2).map((c) => shape([c])),
    ]);
    expect(counts(pattern)).toEqual([{ cutOuts: 1, stitch: 0, folds: 0, markings: 1 }]);
    expect(pattern.likelyHoles).toEqual([{ count: 12, diameterMm: expect.closeTo(1.2, 9) }]);
    expect(pattern.leftOut).toEqual({});
    expect(PathOps.area(pattern.pieces[0]!.outline)).toBeCloseTo(10_000, 9);
  });

  it('nesting alternates: outline, cut-out, a piece in the window, its cut-out', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.boolean(), (depth, shuffled) => {
        const nest = Array.from({ length: depth }, (_, i) =>
          shape([square(i * 5, i * 5, 100 - i * 10)]),
        );
        const pattern = assignRoles(shuffled ? nest.reverse() : nest);
        expect(pattern.pieces).toHaveLength(Math.ceil(depth / 2));
        expect(pattern.pieces.reduce((n, p) => n + p.cutOuts.length, 0)).toBe(
          Math.floor(depth / 2),
        );
        for (const piece of pattern.pieces) expect(piece.cutOuts.length).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('holds under any order, translation, rotation and mirror: roles are physical, not scale-free', () => {
    const drawing = [
      [square(0, 0, 100)],
      [square(10, 10, 20), square(60, 10, 20)],
      [Shapes.line({ x: 50, y: 40 }, { x: 50, y: 90 })],
      [square(200, 0, 50)],
      [Shapes.line({ x: 300, y: 0 }, { x: 310, y: 0 })],
      row(5, { x: 10, y: 50 }, 4, 1),
    ];
    const reference = assignRoles(drawing.map((p) => shape(p)));
    fc.assert(
      fc.property(
        fc.shuffledSubarray(drawing, { minLength: drawing.length }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.boolean(),
        (order, shift, angle, mirror) => {
          const m = MatOps.compose(
            MatOps.compose(MatOps.fromScale(1, mirror ? -1 : 1), MatOps.fromRotation(angle)),
            MatOps.fromTranslation({ x: shift, y: -shift }),
          );
          const moved = assignRoles(
            order.map((paths) => shape(paths.map((p) => PathOps.transform(p, m)))),
          );
          const sorted = (pattern: ReturnType<typeof assignRoles>) =>
            counts(pattern)
              .map((c) => JSON.stringify(c))
              .sort();
          expect(sorted(moved)).toEqual(sorted(reference));
          expect(moved.leftOut).toEqual(reference.leftOut);
          expect(moved.likelyHoles.map((h) => h.count)).toEqual([5]);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('keeps pieces in the order their outlines were drawn', () => {
    const pattern = assignRoles([shape([square(0, 0, 10)]), shape([square(20, 0, 50)])]);
    expect(pattern.pieces.map((p) => PathOps.area(p.outline))).toEqual([100, 2500]);
  });

  it('two overlapping outlines stay two pieces: neither holds the other', () => {
    const pattern = assignRoles([shape([square(0, 0, 50)]), shape([square(25, 25, 50)])]);
    expect(counts(pattern)).toHaveLength(2);
  });

  it('a compound path splits by containment, as separate shapes do', () => {
    const pattern = assignRoles([shape([square(0, 0, 50), square(10, 10, 5)])]);
    expect(counts(pattern)).toEqual([{ cutOuts: 1, stitch: 0, folds: 0, markings: 0 }]);
  });

  it('a line outside every outline is left out, counted', () => {
    const pattern = assignRoles([
      shape([square(0, 0, 50)]),
      shape([Shapes.line({ x: 60, y: 0 }, { x: 70, y: 0 })]),
      shape([Shapes.line({ x: 80, y: 0 }, { x: 90, y: 0 })], 'fold'),
    ]);
    expect(pattern.leftOut).toEqual({ 'outside-piece': 2 });
    expect(counts(pattern)).toEqual([{ cutOuts: 0, stitch: 0, folds: 0, markings: 0 }]);
  });

  it('a fold line drawn edge to edge belongs to the piece it crosses', () => {
    const pattern = assignRoles([
      shape([square(0, 0, 50)]),
      shape([Shapes.line({ x: 25, y: 0 }, { x: 25, y: 50 })], 'fold'),
    ]);
    expect(counts(pattern)).toEqual([{ cutOuts: 0, stitch: 0, folds: 1, markings: 0 }]);
  });
});

describe('roles by layer name (9.20b)', () => {
  it('a layer named cut, stitch or fold overrides the shape rule', () => {
    fc.assert(
      fc.property(fc.constantFrom<LayerName>('stitch', 'fold'), fc.boolean(), (layer, closed) => {
        const drawn = closed ? square(10, 10, 20) : Shapes.line({ x: 10, y: 10 }, { x: 30, y: 30 });
        const pattern = assignRoles([shape([square(0, 0, 100)]), shape([drawn], layer)]);
        expect(counts(pattern)).toEqual([
          {
            cutOuts: 0,
            stitch: layer === 'stitch' ? 1 : 0,
            folds: layer === 'fold' ? 1 : 0,
            markings: 0,
          },
        ]);
      }),
    );
  });

  it('small circles on a cut layer are cut, not reported as holes', () => {
    const pattern = assignRoles([
      shape([square(0, 0, 100)], 'cut'),
      ...row(6, { x: 10, y: 10 }, 4, 1).map((c) => shape([c], 'cut')),
    ]);
    expect(counts(pattern)).toEqual([{ cutOuts: 6, stitch: 0, folds: 0, markings: 0 }]);
    expect(pattern.likelyHoles).toEqual([]);
  });

  it('an open path on a cut layer cuts nothing: left out, counted', () => {
    const pattern = assignRoles([
      shape([square(0, 0, 100)]),
      shape([Shapes.line({ x: 10, y: 10 }, { x: 20, y: 10 })], 'cut'),
    ]);
    expect(pattern.leftOut).toEqual({ 'open-on-cut-layer': 1 });
  });
});

describe('likely holes (9.20b)', () => {
  it('a row of three or more equal small circles is reported, in any direction and pitch', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 40 }),
        fc.double({ min: 0.5, max: LIKELY_HOLE_MAX_DIAMETER_MM, noNaN: true }),
        fc.double({ min: 2, max: 6.9, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (count, d, pitch, angle) => {
          fc.pre(pitch > d);
          const holes = row(count, { x: 0, y: 0 }, pitch, d, angle);
          const pattern = assignRoles([
            shape([square(-200, -200, 400)]),
            ...holes.map((c) => shape([c])),
          ]);
          expect(pattern.likelyHoles).toEqual([{ count, diameterMm: expect.closeTo(d, 9) }]);
          expect(pattern.pieces[0]?.cutOuts).toEqual([]);
        },
      ),
    );
  });

  it('two rows far apart are two rows', () => {
    const pattern = assignRoles([
      shape([square(-100, -100, 300)]),
      ...row(4, { x: 0, y: 0 }, 4, 1).map((c) => shape([c])),
      ...row(7, { x: 0, y: 50 }, 4, 1).map((c) => shape([c])),
    ]);
    expect(pattern.likelyHoles.map((h) => h.count).sort()).toEqual([4, 7]);
  });

  it('one or two small circles, or a row of large ones, stay cut-outs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 }), (count) => {
        const pattern = assignRoles([
          shape([square(0, 0, 100)]),
          ...row(count, { x: 10, y: 10 }, 4, 1).map((c) => shape([c])),
          ...row(5, { x: 10, y: 50 }, 8, LIKELY_HOLE_MAX_DIAMETER_MM + 1).map((c) => shape([c])),
        ]);
        expect(pattern.likelyHoles).toEqual([]);
        expect(pattern.pieces[0]?.cutOuts).toHaveLength(count + 5);
      }),
    );
  });

  it('circles of different sizes do not make one row', () => {
    const holes = [1, 1.5, 1, 1.5, 1].map((d, i) => Shapes.circle({ x: 10 + 3 * i, y: 10 }, d / 2));
    const pattern = assignRoles([shape([square(0, 0, 100)]), ...holes.map((c) => shape([c]))]);
    expect(pattern.likelyHoles).toEqual([{ count: 3, diameterMm: expect.closeTo(1, 9) }]);
    expect(pattern.pieces[0]?.cutOuts).toHaveLength(2);
  });
});

describe('the passes that sort shapes are bounded (9.20c, PERF-012)', () => {
  it('ten thousand shapes side by side are refused by the work they ask for, before any of it', () => {
    // Each is compared with every larger one: 50 million pairs, about four seconds unbounded.
    const many = Array.from({ length: 10_000 }, (_, i) =>
      shape([square((i % 100) * 10, Math.floor(i / 100) * 10, 5)]),
    );
    expect(() => assignRoles(many)).toThrow(
      expect.objectContaining({ name: 'ResourceLimitError', resource: 'svgShapeTests' }),
    );
  });

  it('forty traced pieces, each with its cut-outs, a row of holes and markings, sort within the bound', () => {
    // A traced outline: 500 straight segments round a 240 mm circle.
    const traced = (cx: number, cy: number): Path =>
      polyline(
        Array.from({ length: 500 }, (_, i) => ({
          x: cx + 120 * Math.cos((2 * Math.PI * i) / 500),
          y: cy + 120 * Math.sin((2 * Math.PI * i) / 500),
        })),
        true,
      );
    const shapes = Array.from({ length: 40 }, (_, p) => {
      const cx = (p % 8) * 300,
        cy = Math.floor(p / 8) * 300;
      return [
        shape([traced(cx, cy)]),
        ...Array.from({ length: 30 }, (_, k) =>
          shape([square(cx - 60 + (k % 6) * 20, cy - 50 + Math.floor(k / 6) * 20, 5)]),
        ),
        ...row(60, { x: cx - 90, y: cy + 90 }, 3, 1.2).map((c) => shape([c])),
        ...Array.from({ length: 10 }, (_, k) =>
          shape([Shapes.line({ x: cx, y: cy }, { x: cx + 10, y: cy + k })]),
        ),
      ];
    }).flat();
    const pattern = assignRoles(shapes);
    expect(pattern.pieces).toHaveLength(40);
    expect(pattern.likelyHoles).toHaveLength(40);
  });

  it('shapes inside an outline of very many segments are refused by the point tests they ask for, before any of them', () => {
    // 400 squares, each probed at 8 points against 200,000 segments: 640 million tests.
    const outline = polyline(
      Array.from({ length: 200_000 }, (_, i) => ({
        x: 1000 * Math.cos((2 * Math.PI * i) / 200_000),
        y: 1000 * Math.sin((2 * Math.PI * i) / 200_000),
      })),
      true,
    );
    const inside = Array.from({ length: 400 }, (_, i) =>
      shape([square((i % 20) * 20 - 200, Math.floor(i / 20) * 20 - 200, 5)]),
    );
    expect(() => assignRoles([shape([outline]), ...inside])).toThrow(
      expect.objectContaining({ name: 'ResourceLimitError', resource: 'svgShapeTests' }),
    );
  });

  it('circles stacked in one column are refused by the comparisons they ask for, before any of them', () => {
    // 8,000 small circles 10 mm apart in one column: 32 million comparisons in the sweep.
    const column = Array.from({ length: 8_000 }, (_, i) =>
      shape([Shapes.circle({ x: 0, y: 10 * i }, 0.5)]),
    );
    expect(() => assignRoles(column)).toThrow(
      expect.objectContaining({ name: 'ResourceLimitError', resource: 'svgShapeTests' }),
    );
  });
});
