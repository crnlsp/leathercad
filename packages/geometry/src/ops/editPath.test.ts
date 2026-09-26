import { EPS_POINT } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbVec2 } from '../../test/arbitraries.js';
import { isValid, length, path, polyline, vertices, type Path } from '../path/index.js';
import { arc, cubic, end, line, pointAt, start, type Segment } from '../segment/index.js';
import { dist, vec, type Vec2 } from '../vec2.js';

import {
  arcFromChord,
  insertPathVertex,
  movePathVertex,
  removePathVertex,
  type PathEdit,
} from './editPath.js';

const RUNS = { numRuns: 300 };

/** A 100 × 50 rectangle, anticlockwise from the origin: four vertices, four sides. */
const box = polyline([vec(0, 0), vec(100, 0), vec(100, 50), vec(0, 50)], true);

/**
 * Drawn paths as the polyline tool makes them: straight runs, with some sides
 * bent into arcs. Arcs matter here because moving a point has to reshape one
 * rather than tear it off its neighbour.
 */
const arbDrawnPath: fc.Arbitrary<Path> = fc
  .tuple(
    fc.array(arbVec2, { minLength: 3, maxLength: 7 }),
    fc.boolean(),
    fc.array(fc.oneof(fc.constant(0), fc.double({ min: -2.5, max: 2.5, noNaN: true })), {
      minLength: 7,
      maxLength: 7,
    }),
  )
  .map(([points, closed, bends]) => {
    const straight = polyline(points, closed);
    const segments: Segment[] = straight.segments.map((s, i) => {
      const bend = bends[i % bends.length]!;
      const a = start(s);
      const b = end(s);
      return Math.abs(bend) > 0.2 ? (arcFromChord(a, b, bend) ?? s) : s;
    });
    return path(segments, closed);
  })
  .filter(
    (p) =>
      p.segments.length >= 2 &&
      // Real extent everywhere: a side shorter than a tenth of a millimetre is
      // not something a maker draws, and makes every "same point" check vacuous.
      p.segments.every((s) => dist(start(s), end(s)) > 0.1),
  );

/** A vertex index on the path, and the path. */
const arbVertexOf = (p: Path): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: vertices(p).length - 1 });

/** Every surviving old vertex is where it was, under its new index. */
function expectVerticesKept(before: Path, edit: PathEdit, except: number | null = null): void {
  const old = vertices(before);
  const now = vertices(edit.path);
  expect(edit.vertexMap).toHaveLength(old.length);
  for (const [i, j] of edit.vertexMap.entries()) {
    if (j === null || i === except) continue;
    expect(dist(now[j]!, old[i]!)).toBeLessThan(1e-9);
  }
}

describe('arcFromChord', () => {
  it('bends a chord into an arc of the given sweep, with its ends where they were', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, fc.double({ min: -6, max: 6, noNaN: true }), (a, b, sweep) => {
        fc.pre(dist(a, b) > 0.01 && Math.abs(sweep) > 1e-3);
        const bent = arcFromChord(a, b, sweep);
        expect(bent).not.toBeNull();
        expect(bent!.sweepAngle).toBe(sweep);
        expect(dist(pointAt(bent!, 0), a)).toBeLessThan(1e-7);
        expect(dist(pointAt(bent!, 1), b)).toBeLessThan(1e-7);
      }),
      RUNS,
    );
  });

  it('has no arc for coincident ends, or a sweep of nothing or a whole turn', () => {
    expect(arcFromChord(vec(1, 1), vec(1, 1), 1)).toBeNull();
    expect(arcFromChord(vec(0, 0), vec(10, 0), 0)).toBeNull();
    expect(arcFromChord(vec(0, 0), vec(10, 0), Math.PI * 2)).toBeNull();
  });
});

describe('movePathVertex', () => {
  it('moves one corner of a rectangle and both sides that meet there', () => {
    const edit = movePathVertex(box, 2, vec(120, 60))!;

    expect(vertices(edit.path)).toEqual([vec(0, 0), vec(100, 0), vec(120, 60), vec(0, 50)]);
    expect(edit.vertexMap).toEqual([0, 1, 2, 3]);
    expect(edit.segmentMap).toEqual([0, 1, 2, 3]);
  });

  it('moves the start of a closed path, which is also the end of its last side', () => {
    const edit = movePathVertex(box, 0, vec(-10, -10))!;

    expect(start(edit.path.segments[0]!)).toEqual(vec(-10, -10));
    expect(end(edit.path.segments[3]!)).toEqual(vec(-10, -10));
    expect(isValid(edit.path)).toBe(true);
  });

  it('reshapes an arc beside the point rather than tearing it off', () => {
    // A D shape: a straight back and a half-circle bulge.
    const d = path(
      [line(vec(0, 20), vec(0, 0)), arcFromChord(vec(0, 0), vec(0, 20), Math.PI)!],
      true,
    );
    const edit = movePathVertex(d, 0, vec(0, 30))!;
    const bulge = edit.path.segments[1]!;

    expect(bulge.kind).toBe('arc');
    expect(bulge.kind === 'arc' && bulge.sweepAngle).toBe(Math.PI);
    expect(dist(end(bulge), vec(0, 30))).toBeLessThan(1e-9);
    expect(isValid(edit.path)).toBe(true);
  });

  it("moves a cubic's handle with its end, so the curve keeps its shape there", () => {
    // An open run: a straight lead-in, then a curve. Cubics come only from
    // frozen or imported geometry today, but a point edit must not tear one.
    const run = path([
      line(vec(-10, 0), vec(0, 0)),
      cubic(vec(0, 0), vec(10, 10), vec(20, 10), vec(30, 0)),
    ]);

    const fromStart = movePathVertex(run, 1, vec(0, 5))!.path.segments[1]!;
    expect(fromStart).toEqual(cubic(vec(0, 5), vec(10, 15), vec(20, 10), vec(30, 0)));

    const fromEnd = movePathVertex(run, 2, vec(40, 0))!.path.segments[1]!;
    expect(fromEnd).toEqual(cubic(vec(0, 0), vec(10, 10), vec(30, 10), vec(40, 0)));

    // Collapsing the curve onto its other end is a side of no length.
    expect(movePathVertex(run, 1, vec(30, 0))).toBeNull();
    expect(movePathVertex(run, 2, vec(0, 0))).toBeNull();
  });

  it('refuses to fold a side down to nothing', () => {
    expect(movePathVertex(box, 1, vec(0, 0))).toBeNull();
  });

  it('refuses an index the path does not have, and a point that is not a number', () => {
    expect(movePathVertex(box, 4, vec(1, 1))).toBeNull();
    expect(movePathVertex(box, -1, vec(1, 1))).toBeNull();
    expect(() => movePathVertex(box, 1, vec(Number.NaN, 0))).toThrow(RangeError);
  });

  it('puts the point where it was asked and leaves every other point alone', () => {
    fc.assert(
      fc.property(
        arbDrawnPath.chain((p) => fc.tuple(fc.constant(p), arbVertexOf(p), arbVec2)),
        ([p, index, to]) => {
          const edit = movePathVertex(p, index, to);
          if (edit === null) return;

          expect(isValid(edit.path)).toBe(true);
          expect(edit.path.closed).toBe(p.closed);
          expect(edit.path.segments.map((s) => s.kind)).toEqual(p.segments.map((s) => s.kind));
          expect(dist(vertices(edit.path)[index]!, to)).toBeLessThan(1e-9);
          expectVerticesKept(p, edit, index);
        },
      ),
      RUNS,
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(
        arbDrawnPath.chain((p) => fc.tuple(fc.constant(p), arbVertexOf(p), arbVec2)),
        ([p, index, to]) => {
          expect(movePathVertex(p, index, to)).toEqual(movePathVertex(p, index, to));
        },
      ),
      RUNS,
    );
  });
});

describe('insertPathVertex', () => {
  it('splits a side in two without changing the shape', () => {
    const edit = insertPathVertex(box, 0, 0.25)!;

    expect(vertices(edit.path)).toEqual([
      vec(0, 0),
      vec(25, 0),
      vec(100, 0),
      vec(100, 50),
      vec(0, 50),
    ]);
    expect(edit.vertexMap).toEqual([0, 2, 3, 4]);
    // The side that was split does not survive as one segment.
    expect(edit.segmentMap).toEqual([null, 2, 3, 4]);
    expect(edit.inserted).toBe(1);
  });

  it('splits the closing side of a closed path after its last point', () => {
    const edit = insertPathVertex(box, 3, 0.5)!;

    expect(vertices(edit.path)[4]).toEqual(vec(0, 25));
    expect(edit.vertexMap).toEqual([0, 1, 2, 3]);
  });

  it('refuses a split at an end, which would make a side of no length', () => {
    expect(insertPathVertex(box, 0, 0)).toBeNull();
    expect(insertPathVertex(box, 0, 1)).toBeNull();
    expect(insertPathVertex(box, 7, 0.5)).toBeNull();
  });

  it('keeps the outline exactly: same length, one more point, every old point kept', () => {
    fc.assert(
      fc.property(
        arbDrawnPath.chain((p) =>
          fc.tuple(
            fc.constant(p),
            fc.integer({ min: 0, max: p.segments.length - 1 }),
            fc.double({ min: 0.05, max: 0.95, noNaN: true }),
          ),
        ),
        ([p, segment, t]) => {
          const edit = insertPathVertex(p, segment, t)!;

          expect(edit).not.toBeNull();
          expect(isValid(edit.path)).toBe(true);
          expect(vertices(edit.path)).toHaveLength(vertices(p).length + 1);
          expect(length(edit.path)).toBeCloseTo(length(p), 9);
          expect(
            dist(vertices(edit.path)[edit.inserted]!, pointAt(p.segments[segment]!, t)),
          ).toBeLessThan(1e-9);
          expectVerticesKept(p, edit);
        },
      ),
      RUNS,
    );
  });
});

describe('removePathVertex', () => {
  it('joins the two sides at the point with one straight side', () => {
    const edit = removePathVertex(box, 2)!;

    expect(vertices(edit.path)).toEqual([vec(0, 0), vec(100, 0), vec(0, 50)]);
    expect(edit.vertexMap).toEqual([0, 1, null, 2]);
    expect(edit.segmentMap).toEqual([0, null, null, 2]);
  });

  it('removes the start of a closed path, and the next point becomes its start', () => {
    const edit = removePathVertex(box, 0)!;

    expect(vertices(edit.path)).toEqual([vec(0, 50), vec(100, 0), vec(100, 50)]);
    expect(edit.vertexMap).toEqual([null, 1, 2, 0]);
    expect(isValid(edit.path)).toBe(true);
  });

  it('drops the end side when an end of an open path goes', () => {
    const run = polyline([vec(0, 0), vec(10, 0), vec(10, 10)]);

    expect(vertices(removePathVertex(run, 0)!.path)).toEqual([vec(10, 0), vec(10, 10)]);
    expect(vertices(removePathVertex(run, 2)!.path)).toEqual([vec(0, 0), vec(10, 0)]);
    expect(removePathVertex(run, 2)!.vertexMap).toEqual([0, 1, null]);
  });

  it('refuses to leave fewer points than a path needs', () => {
    // A closed path needs three points to enclose anything; an open one, two.
    const triangle = polyline([vec(0, 0), vec(10, 0), vec(0, 10)], true);
    expect(removePathVertex(triangle, 1)).toBeNull();
    expect(removePathVertex(polyline([vec(0, 0), vec(10, 0)]), 0)).toBeNull();
  });

  it('is undone by inserting the point again, on a straight polygon', () => {
    fc.assert(
      fc.property(
        fc
          .array(arbVec2, { minLength: 4, maxLength: 8 })
          .chain((points) =>
            fc.tuple(fc.constant(points), fc.integer({ min: 1, max: points.length - 2 })),
          ),
        ([points, index]) => {
          // An interior point of an open polyline, lying on the straight line
          // between its neighbours: removing it changes nothing a maker could
          // see, and putting it back restores the path.
          const a = points[index - 1]!;
          const b = points[index + 1]!;
          fc.pre(dist(a, b) > 0.2 && dist(points[index]!, a) > 0.1);
          const onLine: Vec2[] = points.map((p, i) =>
            i === index ? vec((a.x + b.x) / 2, (a.y + b.y) / 2) : p,
          );
          const p = polyline(onLine);
          fc.pre(p.segments.every((s) => dist(start(s), end(s)) > 0.1));

          const removed = removePathVertex(p, index)!;
          expect(removed).not.toBeNull();
          const restored = insertPathVertex(removed.path, index - 1, 0.5)!;
          const now = vertices(restored.path);
          for (const [i, point] of vertices(p).entries()) {
            expect(dist(now[i]!, point)).toBeLessThan(1e-9);
          }
        },
      ),
      RUNS,
    );
  });

  it('always leaves a valid path, with every other point where it was', () => {
    fc.assert(
      fc.property(
        arbDrawnPath.chain((p) => fc.tuple(fc.constant(p), arbVertexOf(p))),
        ([p, index]) => {
          const edit = removePathVertex(p, index);
          if (edit === null) return;

          expect(isValid(edit.path)).toBe(true);
          expect(vertices(edit.path)).toHaveLength(vertices(p).length - 1);
          expect(edit.vertexMap[index]).toBeNull();
          expectVerticesKept(p, edit);
        },
      ),
      RUNS,
    );
  });
});

describe('the maps an edit reports', () => {
  it('never send two old points or segments to the same place', () => {
    const arbEdit = arbDrawnPath.chain((p) =>
      fc.oneof(
        fc.tuple(arbVertexOf(p), arbVec2).map(([i, to]) => ({ p, edit: movePathVertex(p, i, to) })),
        fc
          .tuple(
            fc.integer({ min: 0, max: p.segments.length - 1 }),
            fc.double({ min: 0.05, max: 0.95, noNaN: true }),
          )
          .map(([s, t]) => ({ p, edit: insertPathVertex(p, s, t) })),
        arbVertexOf(p).map((i) => ({ p, edit: removePathVertex(p, i) })),
      ),
    );

    fc.assert(
      fc.property(arbEdit, ({ p, edit }) => {
        if (edit === null) return;
        const vertexTargets = edit.vertexMap.filter((j) => j !== null);
        const segmentTargets = edit.segmentMap.filter((j) => j !== null);

        expect(new Set(vertexTargets).size).toBe(vertexTargets.length);
        expect(new Set(segmentTargets).size).toBe(segmentTargets.length);
        expect(edit.segmentMap).toHaveLength(p.segments.length);
        // A segment that survives is the same kind of segment.
        for (const [i, j] of edit.segmentMap.entries()) {
          if (j !== null) expect(edit.path.segments[j]!.kind).toBe(p.segments[i]!.kind);
        }
      }),
      RUNS,
    );
  });

  it('keep an arc an arc: a whole circle has no second point to move against', () => {
    const ring = path([arc(vec(0, 0), 10, 0, Math.PI * 2)], true);

    expect(movePathVertex(ring, 0, vec(20, 0))).toBeNull();
    expect(removePathVertex(ring, 0)).toBeNull();
  });

  it('have nothing to edit on an empty path', () => {
    const empty = path([], false);

    expect(movePathVertex(empty, 0, vec(1, 1))).toBeNull();
    expect(insertPathVertex(empty, 0, 0.5)).toBeNull();
    expect(removePathVertex(empty, 0)).toBeNull();
  });

  it('reject a split parameter that is not a number, rather than splitting nowhere', () => {
    expect(() => insertPathVertex(box, 0, Number.NaN)).toThrow(RangeError);
    expect(() => insertPathVertex(box, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    // A point index that is not a whole number names no point.
    expect(removePathVertex(box, 1.5)).toBeNull();
  });

  it('are tolerant only at EPS_POINT', () => {
    // A move of less than EPS_POINT still lands exactly where asked.
    const edit = movePathVertex(box, 1, vec(100 + EPS_POINT / 2, 0))!;
    expect(vertices(edit.path)[1]!.x).toBe(100 + EPS_POINT / 2);
  });
});
