import { PathOps, uniformRadii, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate, type ResolvedProject } from './evaluate.js';
import { DEFAULT_SETTINGS, type Feature, type Project } from './feature.js';
import type { RunReport, StitchHoles } from './stitch.js';
import { validate } from './validate.js';

// ——— Builders ————————————————————————————————————————————————————————————

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

function panel(width = 105, height = 75, radius = 8): Feature {
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
        radii: uniformRadii(radius),
        rotation: 0,
      },
    },
  };
}

function stitchLine(inset = 3.5): Feature {
  return {
    ...base('stitch-1', 'Stitch line'),
    kind: 'stitch-line',
    source: {
      kind: 'derived',
      sourceId: 'cut-1',
      op: { type: 'offset', distanceMm: inset, side: 'inward', run: { kind: 'whole' } },
    },
  };
}

function holeSet(from = 'stitch-1', pitchMm = 3.85): Feature {
  return {
    ...base('holes-1', 'Stitch holes'),
    kind: 'stitch-hole-set',
    source: {
      kind: 'derived',
      sourceId: from,
      op: { type: 'stitch-holes', pitchMm, mode: 'fit-whole', corners: 'continuous' },
    },
  };
}

function drawn(kind: 'cut-contour' | 'stitch-line', points: Vec2[], closed: boolean): Feature {
  const source = { kind: 'path' as const, path: PathOps.polyline(points, closed) };
  return kind === 'cut-contour'
    ? { ...base('cut-1', 'Outline'), kind, role: 'outer', source }
    : { ...base('stitch-1', 'Stitch line'), kind, source };
}

function project(...parts: Feature[][]): Project {
  return {
    id: 'proj',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: parts.map((features, i) => ({
      id: `part-${i}`,
      name: `Part ${i}`,
      quantity: 1,
      features,
    })),
  };
}

/** A figure of eight: the first and third sides cross at (25, 25). */
const figureOfEight: Vec2[] = [
  { x: 0, y: 0 },
  { x: 50, y: 50 },
  { x: 50, y: 0 },
  { x: 0, y: 50 },
];

/**
 * A resolved hole set with exactly the numbers a rule reads.
 *
 * The thresholds are the specification, so they are tested against numbers
 * chosen to sit either side of them — not against whatever spacing a real
 * outline happens to produce.
 */
function resolvedHoles(
  pitchMm: number,
  numbers: { count: number; achievedPitchMm: number; runs?: number[] },
): ResolvedProject {
  const feature = holeSet('stitch-1', pitchMm);
  const line = PathOps.polyline(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
  );
  const runs: RunReport[] = (numbers.runs ?? [numbers.achievedPitchMm]).map((spacing) => ({
    lengthMm: 50,
    count: 10,
    achievedPitchMm: spacing,
  }));
  const holes: StitchHoles = {
    holes: [],
    count: numbers.count,
    achievedPitchMm: numbers.achievedPitchMm,
    runs,
  };

  const p = project([feature]);
  return {
    project: p,
    parts: [
      {
        part: p.parts[0]!,
        features: [{ ok: true, feature, role: 'stitch-holes', path: line, holes }],
      },
    ],
  };
}

const codes = (resolved: ResolvedProject): string[] =>
  validate(resolved).map((d) => d.problem.code);

// ——— EMPTY_PART ——————————————————————————————————————————————————————————

describe('EMPTY_PART', () => {
  it('lists a part with nothing in it, as information about the part', () => {
    const diagnostics = validate(evaluate(project([])));

    expect(diagnostics).toEqual([
      {
        problem: { code: 'EMPTY_PART', facts: { partId: 'part-0', partName: 'Part 0' } },
        severity: 'info',
        partId: 'part-0',
        related: [],
      },
    ]);
  });

  it('says nothing about a part that has something in it', () => {
    expect(codes(evaluate(project([panel()])))).toEqual([]);
  });
});

// ——— CONTOUR_SELF_INTERSECTS ———————————————————————————————————————————————

describe('CONTOUR_SELF_INTERSECTS', () => {
  it('marks an outline that crosses itself, where it crosses', () => {
    const [diagnostic, ...rest] = validate(
      evaluate(project([drawn('cut-contour', figureOfEight, true)])),
    );

    expect(rest).toEqual([]);
    expect(diagnostic).toMatchObject({
      problem: { code: 'CONTOUR_SELF_INTERSECTS', facts: { featureId: 'cut-1', crossings: 1 } },
      severity: 'error',
      partId: 'part-0',
      featureId: 'cut-1',
    });
    expect(diagnostic!.location?.kind).toBe('points');
    const [point] = diagnostic!.location?.kind === 'points' ? diagnostic!.location.points : [];
    expect(point!.x).toBeCloseTo(25, 9);
    expect(point!.y).toBeCloseTo(25, 9);
  });

  it('says nothing about a panel with rounded corners', () => {
    // The corner arcs meet the straights end to end. Reporting those joins
    // would make every outline cross itself.
    expect(codes(evaluate(project([panel()])))).toEqual([]);
  });

  it('leaves a stitch line that crosses itself alone — only a cut has to be unambiguous', () => {
    expect(codes(evaluate(project([drawn('stitch-line', figureOfEight, true)])))).toEqual([]);
  });
});

// ——— Stitching —————————————————————————————————————————————————————————————

describe('HOLE_SPACING_DEVIATION', () => {
  it('warns just past a quarter of the pitch', () => {
    expect(codes(resolvedHoles(4, { count: 20, achievedPitchMm: 5.01 }))).toEqual([
      'HOLE_SPACING_DEVIATION',
    ]);
    expect(codes(resolvedHoles(4, { count: 20, achievedPitchMm: 2.99 }))).toEqual([
      'HOLE_SPACING_DEVIATION',
    ]);
  });

  it('does not warn at a quarter exactly, or inside it', () => {
    expect(codes(resolvedHoles(4, { count: 20, achievedPitchMm: 5 }))).toEqual([]);
    expect(codes(resolvedHoles(4, { count: 20, achievedPitchMm: 4.99 }))).toEqual([]);
    expect(codes(resolvedHoles(4, { count: 20, achievedPitchMm: 3.01 }))).toEqual([]);
  });

  it('carries both spacings, for the sentence to compare', () => {
    const [diagnostic] = validate(resolvedHoles(4, { count: 20, achievedPitchMm: 6 }));
    expect(diagnostic).toMatchObject({
      problem: { facts: { achievedMm: 6, pitchMm: 4 } },
      severity: 'warning',
      featureId: 'holes-1',
      location: { kind: 'path' },
    });
  });

  it('finds the crowding on a real run too short for the iron', () => {
    // A 2 mm run asked to hold a 3.85 mm pitch gets two holes 2 mm apart —
    // crowded enough on that iron to tear out between them.
    const short = drawn(
      'stitch-line',
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      false,
    );
    expect(codes(evaluate(project([short, holeSet()])))).toEqual(['HOLE_SPACING_DEVIATION']);
  });
});

describe('HOLE_SPACING_UNEVEN', () => {
  it('mentions runs whose spacings differ by more than a twentieth of the pitch', () => {
    const [diagnostic, ...rest] = validate(
      resolvedHoles(8, { count: 40, achievedPitchMm: 8.2, runs: [8, 8.5] }),
    );

    expect(rest).toEqual([]);
    expect(diagnostic).toMatchObject({
      problem: { code: 'HOLE_SPACING_UNEVEN', facts: { narrowestMm: 8, widestMm: 8.5 } },
      severity: 'info',
    });
  });

  it('stays quiet inside a twentieth', () => {
    expect(codes(resolvedHoles(8, { count: 40, achievedPitchMm: 8.1, runs: [8, 8.25] }))).toEqual(
      [],
    );
  });

  it('has nothing to compare on a single run', () => {
    expect(codes(resolvedHoles(8, { count: 40, achievedPitchMm: 8, runs: [8] }))).toEqual([]);
  });

  it('ignores a run with no spacing of its own', () => {
    // One hole on a short side between two corners: its spacing is zero, which
    // is not uneven, it is absent.
    expect(codes(resolvedHoles(8, { count: 40, achievedPitchMm: 8, runs: [8, 0, 8.1] }))).toEqual(
      [],
    );
  });

  it('is reported beside a deviation, because they say different things', () => {
    expect(codes(resolvedHoles(4, { count: 40, achievedPitchMm: 6, runs: [5.5, 6.5] }))).toEqual([
      'HOLE_SPACING_DEVIATION',
      'HOLE_SPACING_UNEVEN',
    ]);
  });
});

describe('HOLE_COUNT_TOO_LOW', () => {
  it.each([0, 1])('warns about a set of %i', (count) => {
    const [diagnostic, ...rest] = validate(resolvedHoles(4, { count, achievedPitchMm: 0 }));

    expect(rest).toEqual([]);
    expect(diagnostic).toMatchObject({
      problem: { code: 'HOLE_COUNT_TOO_LOW', facts: { count } },
      severity: 'warning',
    });
  });

  it('is satisfied by two', () => {
    expect(codes(resolvedHoles(4, { count: 2, achievedPitchMm: 4 }))).toEqual([]);
  });
});

// ——— Properties ——————————————————————————————————————————————————————————

describe('validate, for any ordinary panel', () => {
  const arbPanel = fc.record({
    width: fc.double({ min: 60, max: 400, noNaN: true }),
    height: fc.double({ min: 60, max: 400, noNaN: true }),
    pitch: fc.constantFrom(2.7, 3, 3.38, 3.85, 4, 5),
  });

  it('finds nothing wrong with an outline, its stitch line and its holes', () => {
    // A leatherworker's everyday panel must never raise a problem. A rule that
    // does is noise, and noise is how a problems panel stops being read.
    fc.assert(
      fc.property(arbPanel, ({ width, height, pitch }) => {
        const p = project([panel(width, height), stitchLine(), holeSet('stitch-1', pitch)]);
        return validate(evaluate(p)).length === 0;
      }),
    );
  });

  it('gives the same answer every time it is asked', () => {
    fc.assert(
      fc.property(arbPanel, fc.double({ min: 1, max: 80, noNaN: true }), (dims, inset) => {
        const p = project([panel(dims.width, dims.height), stitchLine(inset), holeSet()]);
        expect(validate(evaluate(p))).toEqual(validate(evaluate(p)));
      }),
    );
  });
});

// ——— TEXT_GLYPH_MISSING ———————————————————————————————————————————————————

describe('TEXT_GLYPH_MISSING', () => {
  const named = (name: string): Project => {
    const p = project([panel()]);
    return { ...p, parts: [{ ...p.parts[0]!, name }] };
  };

  it('warns about a part name the typeface cannot print', () => {
    const [diagnostic, ...rest] = validate(evaluate(named('Panel 漢字')));

    expect(rest).toEqual([]);
    expect(diagnostic).toMatchObject({
      problem: { code: 'TEXT_GLYPH_MISSING', facts: { characters: '漢 字' } },
      severity: 'warning',
      partId: 'part-0',
    });
    // About the part, not a feature: it is the part's name.
    expect(diagnostic!.featureId).toBeUndefined();
  });

  it('says nothing about a Polish name, which is exactly why the typeface was vendored', () => {
    expect(codes(evaluate(named('Przegroda główna')))).toEqual([]);
    expect(codes(evaluate(named('Łódź')))).toEqual([]);
  });
});
