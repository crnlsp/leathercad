import { EPS_LENGTH, EPS_POINT, QUANTUM_MM } from '@leathercad/core';
import { PathOps, Shapes, arc, uniformRadii, type Path, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate, evaluationErrors, resolvedFeatures } from './evaluate.js';
import { DEFAULT_SETTINGS, type Feature, type Project } from './feature.js';
import { derivationRefusal } from './graph.js';
import { MIN_PITCH_MM, rowOfHoles } from './stitch.js';
import { MIN_HOLE_EDGE_CLEARANCE_MM, validate } from './validate.js';

/**
 * A row of holes along a line that is not a stitch line (4.14): belt
 * adjustment holes, rivets along a strap, lacing, decorative punching. Placed
 * as a stitch line's holes are, a hole on each end and the rest evenly
 * between, and punched at a true diameter like a hardware hole.
 */

// ——— Builders ————————————————————————————————————————————————————————————

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

function panel(width = 200, height = 40): Feature {
  return {
    ...base('cut-1', 'Outline'),
    kind: 'cut-contour',
    role: 'outer',
    source: {
      kind: 'shape',
      shape: {
        type: 'rect',
        origin: { x: 0, y: 0 },
        width,
        height,
        radii: uniformRadii(0),
        rotation: 0,
      },
    },
  };
}

function marking(path: Path, id = 'mark-1'): Feature {
  return {
    ...base(id, 'Marking'),
    kind: 'marking-line',
    purpose: 'other',
    source: { kind: 'path', path },
  };
}

function row(sourceId = 'mark-1', pitchMm = 25, radiusMm = 2): Feature {
  return {
    ...base('row-1', 'Row of holes'),
    kind: 'hole-row',
    source: { kind: 'derived', sourceId, op: { type: 'hole-row', pitchMm, radiusMm } },
  };
}

function project(features: Feature[]): Project {
  return {
    id: 'p',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part-1', name: 'Strap', quantity: 1, features }],
  };
}

const segmentFrom = (a: Vec2, b: Vec2): Path => PathOps.polyline([a, b], false);
const straight = (lengthMm: number): Path => segmentFrom({ x: 0, y: 0 }, { x: lengthMm, y: 0 });

function rowOn(path: Path, pitchMm = 25, radiusMm = 2) {
  const found = [
    ...resolvedFeatures(evaluate(project([marking(path), row('mark-1', pitchMm, radiusMm)]))),
  ].find((entry) => entry.feature.id === 'row-1');
  if (found?.holes === undefined) throw new Error('the row did not resolve to holes');
  return found.holes;
}

const gaps = (points: readonly Vec2[]): number[] =>
  points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));

const point = fc.record({
  x: fc.double({ min: -500, max: 500, noNaN: true }),
  y: fc.double({ min: -500, max: 500, noNaN: true }),
});

// ——— Placement —————————————————————————————————————————————————————————————

describe('a row of holes along a marking line (4.14)', () => {
  it('puts a hole on each end of an open line and divides it evenly between them', () => {
    // Five adjustment holes at 25 mm: the task the 4.7 design left for this.
    const holes = rowOn(straight(100));

    expect(holes.count).toBe(5);
    expect(holes.holes.map((hole) => hole.point.x)).toEqual([0, 25, 50, 75, 100]);
    expect(holes.achievedPitchMm).toBeCloseTo(25, 9);
  });

  it('punches every hole at the row’s diameter', () => {
    expect(rowOn(straight(100), 25, 2).radiusMm).toBe(2);
  });

  it('gives a line shorter than a pitch its two ends', () => {
    const holes = rowOn(straight(5));

    expect(holes.holes.map((hole) => hole.point.x)).toEqual([0, 5]);
  });

  it('places the whole number of pitches the line holds, plus its far end', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 2000, noNaN: true }),
        fc.double({ min: MIN_PITCH_MM, max: 50, noNaN: true }),
        (lengthMm, pitchMm) => {
          // Away from the rounding tie, which distribution pins on its own.
          const intervals = lengthMm / pitchMm;
          fc.pre(Math.abs(intervals - Math.floor(intervals) - 0.5) > 1e-6);

          const holes = rowOn(straight(lengthMm), pitchMm);
          const expected = Math.max(1, Math.round(intervals));

          expect(holes.count).toBe(expected + 1);
          // Spacing is achieved, pitch is nominal (glossary): the line is
          // divided exactly, so every gap is the same achieved spacing.
          for (const gap of gaps(holes.holes.map((hole) => hole.point))) {
            expect(Math.abs(gap - lengthMm / expected)).toBeLessThan(EPS_POINT);
          }
          expect(holes.achievedPitchMm).toBeCloseTo(lengthMm / expected, 6);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps every hole on the line it follows, whatever its corners', () => {
    fc.assert(
      fc.property(
        fc.array(point, { minLength: 2, maxLength: 6 }),
        fc.double({ min: 1, max: 50, noNaN: true }),
        (points, pitchMm) => {
          const line = PathOps.polyline(points, false);
          fc.pre(PathOps.length(line) > EPS_LENGTH);

          for (const hole of rowOn(line, pitchMm).holes) {
            expect(PathOps.distanceToPath(line, hole.point)).toBeLessThan(EPS_POINT);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('moves with its line, hole for hole, when the line moves', () => {
    fc.assert(
      fc.property(
        fc.array(point, { minLength: 2, maxLength: 5 }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (points, dx, dy) => {
          const line = PathOps.polyline(points, false);
          fc.pre(PathOps.length(line) > EPS_LENGTH);
          const moved = PathOps.polyline(
            points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            false,
          );

          const before = rowOn(line, 10).holes;
          const after = rowOn(moved, 10).holes;

          expect(after).toHaveLength(before.length);
          after.forEach((hole, i) => {
            expect(hole.point.x - dx).toBeCloseTo(before[i]!.point.x, 6);
            expect(hole.point.y - dy).toBeCloseTo(before[i]!.point.y, 6);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('puts a hole on the corner of a bent line', () => {
    // A row of rivets turning the corner of a strap: 60 mm along, 40 mm up.
    const bent = PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 40 },
      ],
      false,
    );
    const points = rowOn(bent, 20).holes.map((hole) => hole.point);

    expect(points.some((p) => Math.hypot(p.x - 60, p.y) < EPS_POINT)).toBe(true);
    // Punched once, not once per side.
    expect(points.filter((p) => Math.hypot(p.x - 60, p.y) < EPS_POINT)).toHaveLength(1);
    expect(points).toHaveLength(6);
  });

  it('divides a closed line evenly, with no doubled hole where it closes', () => {
    // Rivets round a circle: 2π × 20 mm is 125.66 mm, five 25.13 mm gaps.
    const points = rowOn(Shapes.circle({ x: 0, y: 0 }, 20), 25).holes.map((hole) => hole.point);

    expect(points).toHaveLength(5);
    const ring = [...points, points[0]!];
    for (const gap of gaps(ring)) expect(gap).toBeCloseTo(gaps(ring)[0]!, 6);
  });

  it('follows an arc, every hole on its radius', () => {
    const curve = PathOps.open([arc({ x: 10, y: 10 }, 30, 0, Math.PI / 2)]);
    const holes = rowOn(curve, 8).holes;

    expect(holes.length).toBeGreaterThan(2);
    for (const { point: p } of holes) {
      expect(Math.abs(Math.hypot(p.x - 10, p.y - 10) - 30)).toBeLessThan(EPS_POINT);
    }
  });

  it('keeps the last hole on the end of a very long line, without drift', () => {
    // 2 m at the finest pitch: four thousand holes, each from its index.
    const holes = rowOn(straight(2000), MIN_PITCH_MM, 0.1);

    expect(holes.count).toBe(4001);
    expect(holes.holes.at(-1)!.point.x).toBeCloseTo(2000, 9);
    expect(holes.holes[2000]!.point.x).toBeCloseTo(1000, 9);
  });

  it('has no holes on a line of no length, rather than failing', () => {
    const holes = rowOn(segmentFrom({ x: 5, y: 5 }, { x: 5, y: 5 }));

    expect(holes.count).toBe(0);
  });
});

// ——— Parameters ——————————————————————————————————————————————————————————

describe('what a row of holes refuses', () => {
  const failure = (pitchMm: number, radiusMm: number) =>
    evaluationErrors(
      evaluate(project([marking(straight(100)), row('mark-1', pitchMm, radiusMm)])),
    )[0]?.problem;

  it('refuses a pitch under the floor a hole set has, by name', () => {
    expect(failure(MIN_PITCH_MM / 2, 2)).toMatchObject({
      code: 'PARAMETER_INVALID',
      facts: { featureId: 'row-1', parameter: 'pitch', requirement: 'at-least' },
    });
  });

  it('refuses a hole with no size, since there is nothing to punch', () => {
    expect(failure(25, 0)).toMatchObject({
      code: 'PARAMETER_INVALID',
      facts: { parameter: 'radius', requirement: 'positive' },
    });
    expect(failure(25, -1)).toMatchObject({ facts: { parameter: 'radius' } });
    expect(failure(25, Number.NaN)).toMatchObject({ facts: { requirement: 'finite' } });
  });
});

describe('rowOfHoles, called directly', () => {
  it('places nothing on an empty path', () => {
    const op = { type: 'hole-row', pitchMm: 25, radiusMm: 2 } as const;

    expect(rowOfHoles({ closed: false, segments: [] }, op).count).toBe(0);
  });

  it.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses a radius of %s loudly, naming it',
    (radiusMm) => {
      expect(() => rowOfHoles(straight(100), { type: 'hole-row', pitchMm: 25, radiusMm })).toThrow(
        new RangeError(`radiusMm must be greater than zero, received ${String(radiusMm)}`),
      );
    },
  );
});

// ——— What it may follow ——————————————————————————————————————————————————

describe('what a row of holes may follow (S4)', () => {
  const stitchLine: Feature = {
    ...base('stitch-1', 'Stitch line'),
    kind: 'stitch-line',
    source: {
      kind: 'derived',
      sourceId: 'cut-1',
      op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
    },
  };
  const fold: Feature = {
    ...base('fold-1', 'Fold'),
    kind: 'fold-line',
    direction: 'valley',
    source: { kind: 'path', path: straight(40) },
  };
  const all = project([panel(), stitchLine, fold, marking(straight(100))]);
  const refusal = (feature: Feature) => derivationRefusal(all, feature)?.facts;

  it('follows a marking line', () => {
    expect(derivationRefusal(all, row('mark-1'))).toBeNull();
  });

  it.each([
    ['an outline', 'cut-1'],
    ['a stitch line, whose holes are a hole set', 'stitch-1'],
    ['a fold', 'fold-1'],
  ])('refuses to follow %s', (_what, sourceId) => {
    expect(refusal(row(sourceId))).toMatchObject({ rule: 'row-needs-marking-line' });
  });

  it('is the only feature a row of holes builds', () => {
    const set: Feature = {
      ...base('holes-1', 'Stitch holes'),
      kind: 'stitch-hole-set',
      source: {
        kind: 'derived',
        sourceId: 'mark-1',
        op: { type: 'hole-row', pitchMm: 25, radiusMm: 2 },
      },
    };
    expect(refusal(set)).toMatchObject({ rule: 'row-needs-hole-row' });
  });

  it('leaves stitch holes on stitch lines only', () => {
    const set: Feature = {
      ...base('holes-1', 'Stitch holes'),
      kind: 'stitch-hole-set',
      source: {
        kind: 'derived',
        sourceId: 'mark-1',
        op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
      },
    };
    expect(refusal(set)).toMatchObject({ rule: 'holes-need-stitch-line' });
  });
});

// ——— Mirror ——————————————————————————————————————————————————————————————

describe('a mirrored row of holes', () => {
  it('has its original’s holes, reflected, at its original’s diameter', () => {
    const counterpart: Feature = {
      ...base('row-2', 'Row of holes'),
      kind: 'hole-row',
      source: {
        kind: 'derived',
        sourceId: 'row-1',
        op: {
          type: 'mirror',
          axis: { kind: 'line', origin: { x: 0, y: -10 }, angleRad: 0 },
          glideMm: 0,
        },
      },
    };
    const resolved = [
      ...resolvedFeatures(
        evaluate(project([marking(straight(100)), row('mark-1', 25, 3), counterpart])),
      ),
    ];
    const original = resolved.find((entry) => entry.feature.id === 'row-1')!.holes!;
    const mirrored = resolved.find((entry) => entry.feature.id === 'row-2')!.holes!;

    expect(mirrored.radiusMm).toBe(3);
    expect(mirrored.holes.map((hole) => hole.point)).toEqual(
      original.holes.map((hole) => ({ x: hole.point.x, y: -20 - hole.point.y })),
    );
  });
});

// ——— Validation ——————————————————————————————————————————————————————————

describe('a row of holes on the leather (DR2, by its rim as Q33 decided)', () => {
  /** A row 20 mm to 180 mm along a 200 × 40 strap, at height `y`. */
  const strapRow = (y: number, radiusMm: number) =>
    validate(
      evaluate(
        project([
          panel(),
          marking(segmentFrom({ x: 20, y }, { x: 180, y })),
          row('mark-1', 20, radiusMm),
        ]),
      ),
    ).filter((d) => d.featureId === 'row-1');

  it('is quiet down the middle of the strap', () => {
    expect(strapRow(20, 2)).toEqual([]);
  });

  it('reports holes whose rims break the edge as off the material, every one of them', () => {
    // Centres 1 mm in, rims 1 mm through: the punch takes a bite out of the edge.
    const [found] = strapRow(1, 2);

    expect(found?.problem).toMatchObject({ code: 'OUTSIDE_PART', facts: { what: 'holes' } });
    expect(found?.location).toMatchObject({ kind: 'points' });
    expect(found?.location?.kind === 'points' && found.location.points).toHaveLength(9);
  });

  it('warns when the rims come under the clearance a hole needs, saying how near', () => {
    // Centres 3 mm in, a 4 mm punch: 1 mm of leather left.
    const [found] = strapRow(3, 2);

    expect(found?.problem).toMatchObject({
      code: 'HOLE_TOO_CLOSE_TO_EDGE',
      facts: { minimumMm: MIN_HOLE_EDGE_CLEARANCE_MM },
    });
    expect(
      found?.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE' && found.problem.facts.clearanceMm,
    ).toBeCloseTo(1, 6);
  });

  it('agrees with the exact rim clearance anywhere across the strap', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 39.5, noNaN: true }),
        fc.double({ min: 0.5, max: 5, noNaN: true }),
        (y, radiusMm) => {
          const rimMm = Math.min(y, 40 - y) - radiusMm;
          // Away from the two thresholds, where the quantum decides.
          fc.pre(Math.abs(rimMm) > 1e-3 && Math.abs(rimMm - MIN_HOLE_EDGE_CLEARANCE_MM) > 1e-3);

          const codes = strapRow(y, radiusMm).map((d) => d.problem.code);
          const expected =
            rimMm < -QUANTUM_MM
              ? ['OUTSIDE_PART']
              : rimMm < MIN_HOLE_EDGE_CLEARANCE_MM
                ? ['HOLE_TOO_CLOSE_TO_EDGE']
                : [];
          expect(codes).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is not judged as stitching: no iron to match, no seam to close', () => {
    // Two holes 10 mm apart on a 25 mm pitch would be a warning on a hole set
    // (HOLE_SPACING_DEVIATION). A row is punched, not sewn: DR4 does not apply.
    const found = validate(
      evaluate(project([panel(), marking(segmentFrom({ x: 50, y: 20 }, { x: 60, y: 20 })), row()])),
    ).filter((d) => d.featureId === 'row-1');

    expect(found).toEqual([]);
  });
});
