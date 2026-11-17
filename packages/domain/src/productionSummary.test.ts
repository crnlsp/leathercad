import { EPS_AREA, EPS_LENGTH, approxEq } from '@leathercad/core';
import { MatOps, PathOps, Shapes, polyline, uniformRadii, type Path } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate } from './evaluate.js';
import { DEFAULT_SETTINGS, type Feature, type Part, type Project, type Seam } from './feature.js';
import { THREAD_ROUND_MM, THREAD_STITCH_FACTOR, productionSummary } from './productionSummary.js';

const base = (id: string, name: string, visible = true) => ({ id, name, visible, locked: false });

const rect = (width: number, height: number): Path =>
  Shapes.roundedRect({ x: 0, y: 0 }, width, height, uniformRadii(0));

const outline = (path: Path, role: 'outer' | 'inner' = 'outer', id = 'outline'): Feature => ({
  ...base(id, role === 'outer' ? 'Outline' : 'Cut-out'),
  kind: 'cut-contour',
  role,
  source: { kind: 'path', path },
});

/** A stitch line 3.5 mm inside the outline, and the holes along it. */
const stitching = (from = 'outline', suffix = ''): Feature[] => [
  {
    ...base(`line${suffix}`, 'Stitch line'),
    kind: 'stitch-line',
    source: {
      kind: 'derived',
      sourceId: from,
      op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
    },
  },
  {
    ...base(`holes${suffix}`, 'Stitch holes'),
    kind: 'stitch-hole-set',
    source: {
      kind: 'derived',
      sourceId: `line${suffix}`,
      // An iron whose pitch no whole-millimetre length divides at a half, so a turn
      // of the piece cannot tip a count.
      op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' },
    },
  },
];

const rivet = (id: string, x: number, diameterMm: number, type: 'rivet' | 'snap' = 'rivet') =>
  ({
    ...base(id, 'Rivet'),
    kind: 'hardware-hole',
    hardwareType: type,
    source: {
      kind: 'shape',
      shape: { type: 'circle', centre: { x, y: 10 }, radius: diameterMm / 2 },
    },
  }) satisfies Feature;

const piece = (id: string, quantity: number, ...features: Feature[]): Part => ({
  id,
  name: id,
  quantity,
  features,
});

const projectOf = (parts: Part[], seams?: Seam[]): Project => ({
  id: 'project',
  name: 'Summary',
  settings: DEFAULT_SETTINGS,
  parts,
  ...(seams === undefined ? {} : { seams }),
});

const summaryOf = (project: Project) => productionSummary(evaluate(project));

describe('the production summary (9.12)', () => {
  it('counts a piece, its net leather and nothing else for a bare outline', () => {
    const summary = summaryOf(projectOf([piece('Panel', 1, outline(rect(40, 20)))]));
    expect(summary.pieces.map((p) => [p.name, p.quantity, p.holes])).toEqual([['Panel', 1, 0]]);
    expect(summary.toCut).toBe(1);
    expect(summary.holes).toBe(0);
    expect(summary.hardware).toEqual([]);
    expect(summary.threadMm).toBe(0);
    expect(approxEq(summary.leatherMm2, 800, EPS_AREA)).toBe(true);
  });

  it('takes the cut-outs out of the leather', () => {
    const summary = summaryOf(
      projectOf([
        piece(
          'Panel',
          1,
          outline(rect(40, 20)),
          outline(
            PathOps.transform(rect(10, 5), MatOps.fromTranslation({ x: 5, y: 5 })),
            'inner',
            'slot',
          ),
        ),
      ]),
    );
    expect(approxEq(summary.leatherMm2, 750, EPS_AREA)).toBe(true);
  });

  it('leaves out what is not cut: a hidden outline, no outline, an open outline', () => {
    const hidden: Feature = { ...outline(rect(40, 20)), visible: false };
    const open: Feature = outline(
      polyline(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 20 },
        ],
        false,
      ),
    );
    const summary = summaryOf(
      projectOf([
        piece('Hidden', 1, hidden),
        piece('Open', 1, open),
        piece('Words', 1, {
          ...base('words', 'Label'),
          kind: 'text-label',
          source: { kind: 'text', text: 'hi', at: { x: 0, y: 0 }, sizeMm: 5, rotationRad: 0 },
        }),
        piece('Panel', 2, outline(rect(10, 10))),
      ]),
    );
    expect(summary.pieces.map((p) => p.name)).toEqual(['Panel']);
    expect(summary.toCut).toBe(2);
  });

  it('counts the holes of a piece once per piece, and in all times its quantity', () => {
    const p = projectOf([piece('Panel', 3, outline(rect(60, 40)), ...stitching())]);
    const summary = summaryOf(p);
    const perPiece = summary.pieces[0]?.holes ?? 0;
    expect(perPiece).toBeGreaterThan(10);
    expect(summary.holes).toBe(perPiece * 3);
  });

  it('counts hardware by type and diameter, as holes, times the quantity', () => {
    const summary = summaryOf(
      projectOf([
        piece(
          'Strap',
          2,
          outline(rect(80, 20)),
          rivet('r1', 10, 4),
          rivet('r2', 20, 4),
          rivet('r3', 30, 5),
          rivet('s1', 40, 4, 'snap'),
        ),
      ]),
    );
    expect(summary.hardware.map((h) => [h.hardwareType, h.diameterMm, h.holes, h.pieces])).toEqual(
      expect.arrayContaining([
        ['rivet', 4, 4, 4],
        ['rivet', 5, 2, 2],
        ['snap', 4, 2, 2],
      ]),
    );
    expect(summary.hardware).toHaveLength(3);
  });

  it('counts a pair of holes that meet across a fold as one piece of hardware', () => {
    const fold: Feature = {
      ...base('fold', 'Fold'),
      kind: 'fold-line',
      direction: 'valley',
      source: {
        kind: 'path',
        path: polyline(
          [
            { x: 50, y: 0 },
            { x: 50, y: 20 },
          ],
          false,
        ),
      },
    };
    const mirrored: Feature = {
      ...base('r2', 'Rivet mirrored'),
      kind: 'hardware-hole',
      hardwareType: 'rivet',
      source: {
        kind: 'derived',
        sourceId: 'r1',
        op: { type: 'mirror', axis: { kind: 'fold', foldId: 'fold' }, glideMm: 0 },
      },
    };
    const summary = summaryOf(
      projectOf([piece('Fob', 1, outline(rect(100, 20)), fold, rivet('r1', 30, 4), mirrored)]),
    );
    expect(summary.hardware).toHaveLength(1);
    expect(summary.hardware[0]).toMatchObject({
      hardwareType: 'rivet',
      diameterMm: 4,
      holes: 2,
      pieces: 1,
    });
  });

  describe('thread, an estimate', () => {
    const outer = piece('Outer', 1, outline(rect(100, 60)), ...stitching());
    const pocket = piece(
      'Pocket',
      2,
      outline(rect(80, 40), 'outer', 'pocket-outline'),
      ...stitching('pocket-outline', '-p'),
    );
    const stitchedLength = (p: Project, id: string) => {
      const entry = evaluate(p)
        .parts.flatMap((part) => part.features)
        .find((e) => e.feature.id === id);
      if (entry === undefined || !entry.ok) throw new Error(`${id} must resolve`);
      return PathOps.length(entry.path);
    };

    it('is four times the stitching, rounded up to the next 10 cm', () => {
      const p = projectOf([outer]);
      const summary = summaryOf(p);
      const stitching = stitchedLength(p, 'holes');
      expect(summary.stitchingMm).toBeCloseTo(stitching, 6);
      expect(summary.threadMm).toBe(
        Math.ceil((THREAD_STITCH_FACTOR * stitching) / THREAD_ROUND_MM) * THREAD_ROUND_MM,
      );
      expect(THREAD_STITCH_FACTOR).toBe(4);
      expect(THREAD_ROUND_MM).toBe(100);
    });

    it('adds up every hole set times its quantity when nothing is sewn together', () => {
      const p = projectOf([outer, pocket]);
      expect(summaryOf(p).stitchingMm).toBeCloseTo(
        stitchedLength(p, 'holes') + 2 * stitchedLength(p, 'holes-p'),
        6,
      );
    });

    it('counts two hole sets joined by a seam once, and what the seam leaves over', () => {
      const a = piece(
        'A',
        1,
        outline(rect(100, 60), 'outer', 'a-outline'),
        ...stitching('a-outline', '-a'),
      );
      const b = piece(
        'B',
        2,
        outline(rect(100, 60), 'outer', 'b-outline'),
        ...stitching('b-outline', '-b'),
      );
      const seam: Seam = {
        id: 'seam',
        a: { holeSetId: 'holes-a', stretch: { kind: 'whole' } },
        b: { holeSetId: 'holes-b', stretch: { kind: 'whole' } },
      };
      const p = projectOf([a, b], [seam]);
      // Both go through the same holes: A once, B's two pieces riding along.
      expect(summaryOf(p).stitchingMm).toBeCloseTo(stitchedLength(p, 'holes-a'), 6);
      expect(summaryOf({ ...p, seams: [] }).stitchingMm).toBeCloseTo(
        3 * stitchedLength(p, 'holes-a'),
        6,
      );
    });
  });

  describe('properties', () => {
    const size = fc.record({
      width: fc.integer({ min: 30, max: 120 }),
      height: fc.integer({ min: 30, max: 120 }),
      angle: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      dx: fc.integer({ min: -200, max: 200 }),
      dy: fc.integer({ min: -200, max: 200 }),
    });

    const placed = (path: Path, s: { angle: number; dx: number; dy: number }): Path =>
      PathOps.transform(
        path,
        MatOps.compose(MatOps.fromRotation(s.angle), MatOps.fromTranslation({ x: s.dx, y: s.dy })),
      );

    /** A piece with a cut-out, holes and a rivet, drawn in place by `s`. */
    const projectAt = (
      s: { width: number; height: number; angle: number; dx: number; dy: number },
      quantity = 1,
    ) =>
      projectOf([
        piece(
          'Panel',
          quantity,
          outline(placed(rect(s.width, s.height), s)),
          outline(
            placed(PathOps.transform(rect(8, 6), MatOps.fromTranslation({ x: 10, y: 10 })), s),
            'inner',
            'slot',
          ),
          ...stitching(),
          {
            ...base('rivet', 'Rivet'),
            kind: 'hardware-hole',
            hardwareType: 'rivet',
            source: { kind: 'path', path: placed(Shapes.circle({ x: 20, y: 20 }, 2), s) },
          },
        ),
      ]);

    it('does not change when the piece is moved or turned', () => {
      fc.assert(
        fc.property(size, (s) => {
          const home = summaryOf(projectAt({ ...s, angle: 0, dx: 0, dy: 0 }));
          const away = summaryOf(projectAt(s));
          expect(away.toCut).toBe(home.toCut);
          expect(away.holes).toBe(home.holes);
          expect(away.hardware).toEqual(home.hardware);
          expect(away.threadMm).toBe(home.threadMm);
          expect(Math.abs(away.leatherMm2 - home.leatherMm2)).toBeLessThan(1e-6);
          expect(Math.abs(away.stitchingMm - home.stitchingMm)).toBeLessThan(1e-6);
        }),
      );
    });

    it('multiplies counts, leather and stitching by the quantity', () => {
      fc.assert(
        fc.property(size, fc.integer({ min: 1, max: 6 }), (s, quantity) => {
          const one = summaryOf(projectAt(s, 1));
          const many = summaryOf(projectAt(s, quantity));
          expect(many.toCut).toBe(one.toCut * quantity);
          expect(many.holes).toBe(one.holes * quantity);
          expect(many.hardware.map((h) => h.holes)).toEqual(
            one.hardware.map((h) => h.holes * quantity),
          );
          expect(Math.abs(many.leatherMm2 - one.leatherMm2 * quantity)).toBeLessThan(1e-6);
          expect(Math.abs(many.stitchingMm - one.stitchingMm * quantity)).toBeLessThan(1e-6);
        }),
      );
    });

    it('never has less than no leather, nor more than the outlines enclose', () => {
      fc.assert(
        fc.property(
          size,
          fc.integer({ min: 1, max: 200 }),
          fc.integer({ min: 1, max: 200 }),
          fc.integer({ min: 1, max: 4 }),
          (s, cutW, cutH, quantity) => {
            const p = projectOf([
              piece(
                'Panel',
                quantity,
                outline(placed(rect(s.width, s.height), s)),
                // A cut-out that may be as large as, or larger than, the piece.
                outline(placed(rect(cutW, cutH), s), 'inner', 'slot'),
              ),
            ]);
            const { leatherMm2 } = summaryOf(p);
            expect(leatherMm2).toBeGreaterThanOrEqual(0);
            expect(leatherMm2).toBeLessThanOrEqual(s.width * s.height * quantity + EPS_LENGTH);
          },
        ),
      );
    });
  });
});
