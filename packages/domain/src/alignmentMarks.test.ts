import { EPS_LENGTH } from '@leathercad/core';
import { Vec2Ops, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { alignmentMarks, markedPairs } from './alignmentMarks.js';
import { evaluate } from './evaluate.js';
import { DEFAULT_SETTINGS, type Part, type Project, type Seam, type SeamMarks } from './feature.js';
import { distanceToEdge, materialOf } from './material.js';
import { resolveSeam } from './seams.js';

interface Panel {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rounded panel stitched 3 mm in all round, at a 3.85 mm iron. */
function panel(i: number, { x, y, width, height }: Panel): Part {
  return {
    id: `part-${i}`,
    name: `Panel ${i}`,
    quantity: 1,
    features: [
      {
        id: `cut-${i}`,
        kind: 'cut-contour',
        role: 'outer',
        name: 'Outline',
        visible: true,
        locked: false,
        source: {
          kind: 'shape',
          shape: {
            type: 'rect',
            origin: { x, y },
            width,
            height,
            radii: uniformRadii(4),
            rotation: 0,
          },
        },
      },
      {
        id: `stitch-${i}`,
        kind: 'stitch-line',
        name: 'Stitch line',
        visible: true,
        locked: false,
        source: {
          kind: 'derived',
          sourceId: `cut-${i}`,
          op: { type: 'offset', distanceMm: 3, side: 'inward', run: { kind: 'whole' } },
        },
      },
      {
        id: `holes-${i}`,
        kind: 'stitch-hole-set',
        name: 'Stitch holes',
        visible: true,
        locked: false,
        source: {
          kind: 'derived',
          sourceId: `stitch-${i}`,
          op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' },
        },
      },
    ],
  };
}

function sewn(a: Panel, b: Panel, marks?: SeamMarks): Project {
  const seam: Seam = {
    id: 'seam',
    a: { holeSetId: 'holes-0', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
    b: { holeSetId: 'holes-1', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
    ...(marks === undefined ? {} : { marks }),
  };
  return {
    id: 'project',
    name: 'Marks',
    settings: DEFAULT_SETTINGS,
    parts: [panel(0, a), panel(1, b)],
    seams: [seam],
  };
}

const panelArb = fc.record({
  x: fc.integer({ min: -300, max: 300 }),
  y: fc.integer({ min: -300, max: 300 }),
  width: fc.double({ min: 30, max: 200, noNaN: true }),
  height: fc.double({ min: 30, max: 200, noNaN: true }),
});
const marksArb: fc.Arbitrary<SeamMarks> = fc.oneof(
  fc.constant({ kind: 'ends' as const }),
  fc.integer({ min: 1, max: 12 }).map((n) => ({ kind: 'every' as const, n })),
);

describe('which paired holes are marked', () => {
  it('the ends are the first and the last pair, once each', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (paired) => {
        expect(markedPairs({ kind: 'ends' }, paired)).toEqual(
          paired === 0 ? [] : paired === 1 ? [1] : [1, paired],
        );
      }),
    );
  });

  it('every nth is each multiple of n up to the last pair, in order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 1, max: 600 }),
        (paired, n) => {
          const pairs = markedPairs({ kind: 'every', n }, paired);
          expect(pairs).toHaveLength(Math.floor(paired / n));
          pairs.forEach((pair, i) => expect(pair).toBe((i + 1) * n));
        },
      ),
    );
  });

  it('refuses an n that counts no pairs, naming it', () => {
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => markedPairs({ kind: 'every', n }, 10)).toThrow(RangeError);
      expect(() => markedPairs({ kind: 'every', n }, 10)).toThrow(String(n));
    }
  });
});

describe('alignment marks (9.13)', () => {
  it('fall on the same pairs on both pieces, each at its own hole', () => {
    fc.assert(
      fc.property(panelArb, panelArb, marksArb, (a, b, marks) => {
        const project = sewn(a, b, marks);
        const resolved = resolveSeam(project, project.seams![0]!);
        if (!resolved.ok) throw new Error('the seam must resolve');
        const paired = Math.min(resolved.a.holes.length, resolved.b.holes.length);
        const found = alignmentMarks(evaluate(project));
        const expected = markedPairs(marks, paired);

        for (const [side, holeSetId, partId] of [
          [resolved.a, 'holes-0', 'part-0'],
          [resolved.b, 'holes-1', 'part-1'],
        ] as const) {
          const own = found.filter((mark) => mark.holeSetId === holeSetId);
          expect(own.map((mark) => mark.pair)).toEqual(expected);
          for (const mark of own) {
            expect(mark.partId).toBe(partId);
            expect(mark.seamId).toBe('seam');
            expect(mark.point).toEqual(side.holes[mark.pair - 1]!.hole.point);
          }
        }
      }),
    );
  });

  it('point square to the stitch line, into the leather', () => {
    fc.assert(
      fc.property(panelArb, panelArb, marksArb, (a, b, marks) => {
        const resolved = evaluate(sewn(a, b, marks));
        const resolvedSeam = resolveSeam(resolved.project, resolved.project.seams![0]!);
        if (!resolvedSeam.ok) throw new Error('the seam must resolve');
        for (const mark of alignmentMarks(resolved)) {
          const part = resolved.parts.find((p) => p.part.id === mark.partId)!;
          const side = mark.holeSetId === 'holes-0' ? resolvedSeam.a : resolvedSeam.b;
          const { tangent } = side.holes[mark.pair - 1]!.hole;
          expect(Vec2Ops.len(mark.inward)).toBeCloseTo(1, 12);
          expect(Math.abs(Vec2Ops.dot(mark.inward, tangent))).toBeLessThanOrEqual(EPS_LENGTH);
          const material = materialOf(part);
          const inside = Vec2Ops.add(mark.point, Vec2Ops.scale(mark.inward, 1));
          expect(distanceToEdge(material, inside)).toBeGreaterThan(
            distanceToEdge(material, mark.point),
          );
        }
      }),
    );
  });

  it('follow their holes when a piece moves, and leave the other piece’s alone', () => {
    fc.assert(
      fc.property(
        panelArb,
        panelArb,
        marksArb,
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (a, b, marks, dx, dy) => {
          const before = alignmentMarks(evaluate(sewn(a, b, marks)));
          const after = alignmentMarks(
            evaluate(sewn({ ...a, x: a.x + dx, y: a.y + dy }, b, marks)),
          );
          expect(after).toHaveLength(before.length);
          after.forEach((mark, i) => {
            const was = before[i]!;
            const by = mark.partId === 'part-0' ? { x: dx, y: dy } : { x: 0, y: 0 };
            expect(mark.point.x).toBeCloseTo(was.point.x + by.x, 6);
            expect(mark.point.y).toBeCloseTo(was.point.y + by.y, 6);
            expect(mark.inward.x).toBeCloseTo(was.inward.x, 9);
            expect(mark.inward.y).toBeCloseTo(was.inward.y, 9);
          });
        },
      ),
    );
  });

  it('are the same marks with the seam’s sides swapped', () => {
    fc.assert(
      fc.property(panelArb, panelArb, marksArb, (a, b, marks) => {
        const project = sewn(a, b, marks);
        const seam = project.seams![0]!;
        const swapped: Project = { ...project, seams: [{ ...seam, a: seam.b, b: seam.a }] };
        const key = (mark: { holeSetId: string; pair: number }) => `${mark.holeSetId}:${mark.pair}`;
        expect(alignmentMarks(evaluate(swapped)).map(key).sort()).toEqual(
          alignmentMarks(evaluate(project)).map(key).sort(),
        );
      }),
    );
  });

  const card = { x: 0, y: 0, width: 105, height: 70 };

  it('are none for a seam that asks for none, or a project without seams', () => {
    expect(alignmentMarks(evaluate(sewn(card, { ...card, x: 200 })))).toEqual([]);
    const { seams: _, ...unsewn } = sewn(card, { ...card, x: 200 }, { kind: 'ends' });
    expect(alignmentMarks(evaluate(unsewn))).toEqual([]);
  });

  it('go with the seam when it is unsewn (ADR 0009)', () => {
    const project = sewn(card, { ...card, x: 200 }, { kind: 'ends' });
    expect(alignmentMarks(evaluate(project))).toHaveLength(4);
    expect(alignmentMarks(evaluate({ ...project, seams: [] }))).toEqual([]);
  });

  it('are none for a seam that cannot be walked, a side’s holes gone', () => {
    const project = sewn(card, { ...card, x: 200 }, { kind: 'ends' });
    const gone: Project = {
      ...project,
      parts: project.parts.map((part) =>
        part.id === 'part-1'
          ? { ...part, features: part.features.filter((f) => f.id !== 'holes-1') }
          : part,
      ),
    };
    expect(alignmentMarks(evaluate(gone))).toEqual([]);
  });

  it('are not printed on a piece whose hole set is hidden', () => {
    const project = sewn(card, { ...card, x: 200 }, { kind: 'ends' });
    const hidden: Project = {
      ...project,
      parts: project.parts.map((part) =>
        part.id === 'part-1'
          ? {
              ...part,
              features: part.features.map((f) =>
                f.id === 'holes-1' ? { ...f, visible: false } : f,
              ),
            }
          : part,
      ),
    };
    expect(alignmentMarks(evaluate(hidden)).map((mark) => mark.holeSetId)).toEqual([
      'holes-0',
      'holes-0',
    ]);
  });

  it('mark every 6th pair up a side, and at its corner hole the leather lies diagonally in', () => {
    // Corner 0 to corner 1 of a 105 × 70 mm card is its right side: 18 paired
    // holes, so pairs 6, 12 and 18, the last on the rounded top-right corner.
    const project = sewn(card, { ...card, x: 200 }, { kind: 'every', n: 6 });
    const marks = alignmentMarks(evaluate(project)).filter((m) => m.partId === 'part-0');
    expect(marks.map((m) => m.pair)).toEqual([6, 12, 18]);
    expect(marks[0]!.point.x).toBeCloseTo(102, 9);
    expect(marks[0]!.inward.x).toBeCloseTo(-1, 9);
    expect(marks[0]!.inward.y).toBeCloseTo(0, 9);
    expect(marks[2]!.inward.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(marks[2]!.inward.y).toBeCloseTo(-Math.SQRT1_2, 9);
  });

  it('is the same list for the same evaluation, so the board and paper share it', () => {
    const resolved = evaluate(sewn(card, { ...card, x: 200 }, { kind: 'ends' }));
    expect(alignmentMarks(resolved)).toBe(alignmentMarks(resolved));
  });
});
