import { EPS_LENGTH, QUANTUM_MM } from '@leathercad/core';
import { PathOps, uniformRadii, type Path, type Vec2 } from '@leathercad/geometry';
import { FONT } from '@leathercad/typography';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { diagnose } from './diagnose.js';
import { evaluate, type ResolvedProject } from './evaluate.js';
import {
  DEFAULT_SETTINGS,
  type Feature,
  type ParametricShape,
  type Part,
  type PocketRequirement,
  type Project,
} from './feature.js';
import type { Diagnostic } from './problems/index.js';
import type { RunReport, StitchHoles } from './stitch.js';
import { MIN_HOLE_EDGE_CLEARANCE_MM, validate } from './validate.js';

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

  // With an outline, so the spacing rules are asked in isolation: a part with
  // no material of its own is a different problem, and it has its own rule.
  const outline = panel(200, 100, 0);
  const p = project([outline, feature]);
  return {
    project: p,
    parts: [
      {
        part: p.parts[0]!,
        features: [
          {
            ok: true,
            feature: outline,
            role: 'cut',
            path: PathOps.polyline(
              [
                { x: 0, y: 0 },
                { x: 200, y: 0 },
                { x: 200, y: 100 },
                { x: 0, y: 100 },
              ],
              true,
            ),
            anchors: [],
          },
          { ok: true, feature, role: 'stitch-holes', path: line, holes, anchors: [] },
        ],
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
    // On a panel big enough to hold it, so the only question asked is whether
    // a crossing stitch line is reported. It is not: only a cut has to be
    // unambiguous.
    expect(
      codes(evaluate(project([panel(200, 120, 0), drawn('stitch-line', figureOfEight, true)]))),
    ).toEqual([]);
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
        { x: 20, y: 20 },
        { x: 22, y: 20 },
      ],
      false,
    );
    expect(codes(evaluate(project([panel(), short, holeSet()])))).toEqual([
      'HOLE_SPACING_DEVIATION',
    ]);
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

  it('warns about a label’s own words, naming the label rather than the part', () => {
    const label: Feature = {
      ...base('label-1', 'Label'),
      kind: 'text-label',
      source: { kind: 'text', text: 'szyć 漢', at: { x: 0, y: 0 }, sizeMm: 3, rotationRad: 0 },
    };
    const [diagnostic, ...rest] = validate(evaluate(project([panel(), label])));

    expect(rest).toEqual([]);
    expect(diagnostic).toMatchObject({
      problem: {
        code: 'TEXT_GLYPH_MISSING',
        facts: { featureId: 'label-1', text: 'szyć 漢', characters: '漢' },
      },
      featureId: 'label-1',
    });
    // Pointing at the label on the canvas, not at the part.
    expect(diagnostic!.location?.kind).toBe('path');
  });

  it('says nothing about a label the typeface can print', () => {
    const label: Feature = {
      ...base('label-1', 'Label'),
      kind: 'text-label',
      source: {
        kind: 'text',
        text: 'Zszyć przed klejeniem',
        at: { x: 0, y: 0 },
        sizeMm: 3,
        rotationRad: 0,
      },
    };
    expect(codes(evaluate(project([panel(), label])))).toEqual([]);
  });
});

describe('printed text legibility (DR5, Q34)', () => {
  const label = (sizeMm: number, text = 'Hi', rotationRad = 0): Feature => ({
    ...base('label-1', 'Label'),
    kind: 'text-label',
    source: { kind: 'text', text, at: { x: 20, y: 20 }, sizeMm, rotationRad },
  });
  const warnings = (feature: Feature) =>
    diagnose(project([panel(), feature])).filter(
      (d) => d.problem.code === 'TEXT_TOO_SMALL_TO_PRINT',
    );
  const sizeForCapHeight = (height: number) => (height * FONT.unitsPerEm) / FONT.capHeight;

  it('warns exactly below 1.5 mm cap height, whatever the letters or turn', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(14_999, 15_000, 15_001), fc.integer({ min: 1, max: 50_000 })),
        fc.constantFrom('Hi', 'gjyp', 'AG'),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (ticks, text, rotation) => {
          const found = warnings(label(sizeForCapHeight(ticks * QUANTUM_MM), text, rotation));
          expect(found).toHaveLength(ticks < 15_000 ? 1 : 0);
        },
      ),
    );
  });

  it.each([14_999, 15_000, 15_001])('handles the cap-height threshold at %i quanta', (ticks) => {
    expect(warnings(label(sizeForCapHeight(ticks * QUANTUM_MM)))).toHaveLength(
      ticks < 15_000 ? 1 : 0,
    );
  });

  it('judges printed capitals rather than the nominal em size (1.5 mm is still too small)', () => {
    expect(warnings(label(1.5))).toHaveLength(1);
    expect(warnings(label(2.15))).toEqual([]);
  });

  it.each([21_488, 21_489, 21_490, 21_491])(
    'judges a stored em size of %i quanta by its capital height',
    (ticks) => {
      // These are the stored sizes on either side of a 1.5 mm printed capital
      // in the vendored face, rather than unquantised inverse font metrics.
      expect(warnings(label(ticks * QUANTUM_MM))).toHaveLength(ticks < 21_490 ? 1 : 0);
    },
  );

  it('warns for Hi at one quantum of cap height with no rotation (Q34 counterexample)', () => {
    expect(warnings(label(sizeForCapHeight(QUANTUM_MM), 'Hi', 0))).toHaveLength(1);
  });

  it('locates even a minimum-size label and reports its cap height and the readable minimum', () => {
    const resolved = evaluate(project([panel(), label(QUANTUM_MM)]));
    const found = validate(resolved).filter((d) => d.problem.code === 'TEXT_TOO_SMALL_TO_PRINT');
    const entry = resolved.parts[0]?.features.find((f) => f.feature.id === 'label-1');
    if (entry?.ok !== true) throw new Error('The label did not resolve');

    expect(found).toEqual([
      {
        problem: {
          code: 'TEXT_TOO_SMALL_TO_PRINT',
          facts: {
            featureId: 'label-1',
            featureName: 'Label',
            capHeightMm: (QUANTUM_MM * FONT.capHeight) / FONT.unitsPerEm,
            minimumMm: 1.5,
          },
        },
        severity: 'warning',
        partId: 'part-0',
        featureId: 'label-1',
        related: [],
        location: { kind: 'path', path: entry.path },
      },
    ]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'leaves an invalid size %s to evaluation',
    (size) => {
      const found = diagnose(project([panel(), label(size)]));
      expect(found.some((d) => d.problem.code === 'PARAMETER_INVALID')).toBe(true);
      expect(found.some((d) => d.problem.code === 'TEXT_TOO_SMALL_TO_PRINT')).toBe(false);
    },
  );
});

// ——— Part rules (DR1, DR2) ————————————————————————————————————————————————

describe('the rules about a part and its material', () => {
  /** A 105 × 75 panel with a 20 mm round hole in the middle of it. */
  const slot = (centre = { x: 52, y: 37 }, radius = 20): Feature => ({
    ...base('hole-1', 'Thumb slot'),
    kind: 'cut-contour',
    role: 'inner',
    source: { kind: 'shape', shape: { type: 'circle', centre, radius } },
  });

  const rivet = (centre: { x: number; y: number }): Feature => ({
    ...base('rivet-1', 'Rivet 4 mm'),
    kind: 'hardware-hole',
    hardwareType: 'rivet',
    source: { kind: 'shape', shape: { type: 'circle', centre, radius: 2 } },
  });

  describe('PART_HAS_NO_OUTER_CONTOUR', () => {
    it('reports a part with stitching but nothing to cut it from', () => {
      const [diagnostic, ...rest] = validate(
        evaluate(
          project([
            drawn(
              'stitch-line',
              [
                { x: 0, y: 0 },
                { x: 40, y: 0 },
              ],
              false,
            ),
          ]),
        ),
      );

      expect(rest).toEqual([]);
      expect(diagnostic).toMatchObject({
        problem: { code: 'PART_HAS_NO_OUTER_CONTOUR', facts: { partId: 'part-0' } },
        severity: 'error',
        partId: 'part-0',
      });
      // About the part, not a feature: it is the part that cannot be made.
      expect(diagnostic!.featureId).toBeUndefined();
    });

    it('says nothing about a part that has one', () => {
      expect(codes(evaluate(project([panel(), stitchLine()])))).toEqual([]);
    });

    it('leaves an empty part to EMPTY_PART, which says it better', () => {
      expect(codes(evaluate(project([])))).toEqual(['EMPTY_PART']);
    });
  });

  describe('CUT_OUT_OUTSIDE_PART', () => {
    it('reports a cut-out that misses the part', () => {
      const [diagnostic] = validate(evaluate(project([panel(), slot({ x: 300, y: 40 })])));

      expect(diagnostic).toMatchObject({
        problem: { code: 'CUT_OUT_OUTSIDE_PART', facts: { featureId: 'hole-1' } },
        severity: 'error',
        featureId: 'hole-1',
      });
    });

    it('reports one that only half overlaps, which cuts a notch rather than a hole', () => {
      expect(codes(evaluate(project([panel(), slot({ x: 0, y: 37 })])))).toContain(
        'CUT_OUT_OUTSIDE_PART',
      );
    });

    it('says nothing about one inside the part', () => {
      expect(codes(evaluate(project([panel(), slot()])))).toEqual([]);
    });
  });

  describe('OUTSIDE_PART', () => {
    it('reports holes punched through the outline, as an error', () => {
      // A stitch line outside the panel, with holes along it.
      const outside = drawn(
        'stitch-line',
        [
          { x: 200, y: 10 },
          { x: 260, y: 10 },
        ],
        false,
      );
      const reported = validate(evaluate(project([panel(), outside, holeSet('stitch-1')]))).filter(
        (d) => d.problem.code === 'OUTSIDE_PART',
      );

      // Both are off the leather and both are said: the line is a guide that
      // overshoots, the holes cannot be punched at all.
      expect(
        reported.map((d) => [
          d.problem.code === 'OUTSIDE_PART' && d.problem.facts.what,
          d.severity,
        ]),
      ).toEqual([
        ['line', 'warning'],
        ['holes', 'error'],
      ]);
    });

    it('reports holes that fall into a cut-out, which is not leather either', () => {
      const acrossTheSlot = drawn(
        'stitch-line',
        [
          { x: 40, y: 37 },
          { x: 64, y: 37 },
        ],
        false,
      );
      expect(
        codes(evaluate(project([panel(), slot(), acrossTheSlot, holeSet('stitch-1')]))),
      ).toContain('OUTSIDE_PART');
    });

    it('reports a rivet off the material', () => {
      expect(codes(evaluate(project([panel(), rivet({ x: 300, y: 40 })])))).toContain(
        'OUTSIDE_PART',
      );
    });

    it('reports a marking line that wanders off, as a warning rather than an error', () => {
      const wandering = {
        ...base('mark-1', 'Glue line'),
        kind: 'marking-line' as const,
        purpose: 'glue-area' as const,
        source: {
          kind: 'path' as const,
          path: PathOps.polyline(
            [
              { x: 20, y: 20 },
              { x: 300, y: 20 },
            ],
            false,
          ),
        },
      };

      const [diagnostic] = validate(evaluate(project([panel(), wandering]))).filter(
        (d) => d.problem.code === 'OUTSIDE_PART',
      );

      // A hole off the material cannot be punched; a line off it is a guide
      // that overshoots. Same code, different severity.
      expect(diagnostic).toMatchObject({
        problem: { facts: { what: 'line' } },
        severity: 'warning',
      });
    });

    it('says nothing when everything sits on the leather', () => {
      expect(codes(evaluate(project([panel(), slot(), rivet({ x: 12, y: 12 })])))).toEqual([]);
    });

    it('takes a fold drawn edge to edge as on the leather (Q2)', () => {
      // A fold runs right across the piece: its ends are on the outline, which
      // is the edge of the leather, not off it.
      const fold = (x: number): Feature => ({
        ...base(`fold-${String(x)}`, 'Fold'),
        kind: 'fold-line',
        direction: 'valley',
        source: {
          kind: 'path',
          path: PathOps.polyline(
            [
              { x, y: 0 },
              { x, y: 75 },
            ],
            false,
          ),
        },
      });
      expect(codes(evaluate(project([panel(105, 75, 0), fold(52.5)])))).toEqual([]);
      // Still reported one storage quantum past the edge and beyond.
      const over: Feature = {
        ...base('fold-over', 'Fold'),
        kind: 'fold-line',
        direction: 'valley',
        source: {
          kind: 'path',
          path: PathOps.polyline(
            [
              { x: 60, y: -1 },
              { x: 60, y: 75 },
            ],
            false,
          ),
        },
      };
      expect(codes(evaluate(project([panel(105, 75, 0), over])))).toContain('OUTSIDE_PART');
    });
  });

  describe('HOLE_TOO_CLOSE_TO_EDGE', () => {
    // The rivet's radius is 2 mm, so its rim is 2 mm nearer the edge than its
    // centre (Q33).
    const rivetAt = (x: number) => rivet({ x, y: 37 });

    it('warns about a rivet whose rim is under 1.5 mm from the edge, saying how near', () => {
      const [diagnostic] = validate(evaluate(project([panel(), rivetAt(3)]))).filter(
        (d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE',
      );

      expect(diagnostic).toMatchObject({
        problem: { facts: { clearanceMm: 1, minimumMm: 1.5 } },
        severity: 'warning',
        featureId: 'rivet-1',
      });
    });

    it('does not warn with the rim 1.5 mm in exactly, or further', () => {
      expect(codes(evaluate(project([panel(), rivetAt(3.5)])))).toEqual([]);
      expect(codes(evaluate(project([panel(), rivetAt(8)])))).toEqual([]);
    });

    it('does not warn about stitching inset exactly the minimum, whatever the offset rounds to', () => {
      // An inset of 1.5 mm measured 1.4999999999999911 mm from the edge (9.17).
      for (const radius of [0, 4, 8]) {
        expect(
          codes(evaluate(project([panel(105, 75, radius), stitchLine(1.5), holeSet()]))),
        ).not.toContain('HOLE_TOO_CLOSE_TO_EDGE');
      }
    });

    it('measures to a cut-out’s edge as readily as to the outline', () => {
      // A rivet whose rim is 1 mm outside the slot: far from the outline, far
      // too near the hole. Both are edges the leather can tear to.
      const [diagnostic] = validate(
        evaluate(project([panel(), slot(), rivet({ x: 52 - 23, y: 37 })])),
      ).filter((d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE');

      expect(diagnostic).toBeDefined();
      expect(
        diagnostic!.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE' &&
          diagnostic!.problem.facts.clearanceMm,
      ).toBeCloseTo(1, 6);
    });

    it('says nothing about a hole off the material — that is a different problem', () => {
      const off = codes(evaluate(project([panel(), rivet({ x: 300, y: 40 })])));

      expect(off).toContain('OUTSIDE_PART');
      expect(off).not.toContain('HOLE_TOO_CLOSE_TO_EDGE');
    });
  });
});

// ——— DR1 asks the parameters, not the geometry ————————————————————————————

describe('a part whose outline exists but cannot be built', () => {
  /** An outline with a negative radius: declared, and impossible. */
  const impossibleOutline: Feature = {
    ...base('cut-1', 'Outline'),
    kind: 'cut-contour',
    role: 'outer',
    source: { kind: 'shape', shape: { type: 'circle', centre: { x: 50, y: 50 }, radius: -10 } },
  };

  const glueLine: Feature = {
    ...base('mark-1', 'Glue line'),
    kind: 'marking-line',
    purpose: 'glue-area',
    source: {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
        ],
        false,
      ),
    },
  };

  it('reports what is actually wrong, and does not tell the user to draw another outline', () => {
    // Reading DR1 off the evaluated material said "no outline — draw one"
    // about a part that has one; the command would then refuse the second
    // (S5), leaving the user in a loop of advice nothing accepts.
    const codes = diagnose(project([impossibleOutline, glueLine])).map((d) => d.problem.code);

    expect(codes).toContain('PARAMETER_INVALID');
    expect(codes).not.toContain('PART_HAS_NO_OUTER_CONTOUR');
  });

  it('still reports a part that genuinely has no outline', () => {
    const codes = diagnose(project([glueLine])).map((d) => d.problem.code);

    expect(codes).toContain('PART_HAS_NO_OUTER_CONTOUR');
  });
});

// ——— The sampling convention ——————————————————————————————————————————————

describe('a line that leaves the leather at its very end', () => {
  const overshoot = (toX: number): Feature => ({
    ...base('mark-1', 'Glue line'),
    kind: 'marking-line',
    purpose: 'glue-area',
    source: {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: 10, y: 37 },
          { x: toX, y: 37 },
        ],
        false,
      ),
    },
  });

  it('is reported when it overshoots by a millimetre', () => {
    // The samples used to stop one step short of the end, so a small
    // overshoot — which is what an overshoot usually is — went unseen while a
    // larger one did not, for no reason the user could have worked out.
    expect(codes(evaluate(project([panel(105, 75, 0), overshoot(106)])))).toContain('OUTSIDE_PART');
  });

  it('is reported when it overshoots by five', () => {
    expect(codes(evaluate(project([panel(105, 75, 0), overshoot(110)])))).toContain('OUTSIDE_PART');
  });

  it('says nothing about one that stops short of the edge', () => {
    expect(codes(evaluate(project([panel(105, 75, 0), overshoot(100)])))).toEqual([]);
  });
});

// ——— Which hole ————————————————————————————————————————————————————————————

describe('a hole rule names the holes at fault', () => {
  const rivetAt = (centre: Vec2): Feature => ({
    ...base('rivet-1', 'Rivet 4 mm'),
    kind: 'hardware-hole',
    hardwareType: 'rivet',
    source: { kind: 'shape', shape: { type: 'circle', centre, radius: 2 } },
  });

  const pointsOf = (resolved: ResolvedProject, code: string): Vec2[] => {
    const found = validate(resolved).find((d) => d.problem.code === code);
    return found?.location?.kind === 'points' ? [...found.location.points] : [];
  };

  it('points HOLE_TOO_CLOSE_TO_EDGE at the hole, not at the whole feature', () => {
    const resolved = evaluate(project([panel(105, 75, 0), rivetAt({ x: 3, y: 37 })]));

    expect(codes(resolved)).toContain('HOLE_TOO_CLOSE_TO_EDGE');
    expect(pointsOf(resolved, 'HOLE_TOO_CLOSE_TO_EDGE')).toEqual([{ x: 3, y: 37 }]);
  });

  it('points OUTSIDE_PART at the hole that is off the leather', () => {
    const resolved = evaluate(project([panel(105, 75, 0), rivetAt({ x: 200, y: 37 })]));

    expect(pointsOf(resolved, 'OUTSIDE_PART')).toEqual([{ x: 200, y: 37 }]);
  });

  it('names only the offending holes of a set, not all three hundred', () => {
    // A slot close enough to the seam that the stitching beside it runs thin.
    // Highlighting the whole stitch line would tell the maker nothing they
    // could act on: the question is *which* hole to move.
    const slot: Feature = {
      ...base('hole-1', 'Thumb slot'),
      kind: 'cut-contour',
      role: 'inner',
      source: { kind: 'shape', shape: { type: 'circle', centre: { x: 12, y: 37 }, radius: 7.5 } },
    };
    const resolved = evaluate(project([panel(105, 75, 0), slot, stitchLine(3.5), holeSet()]));

    const set = resolved.parts[0]!.features.find((f) => f.feature.id === 'holes-1');
    const total = set?.ok === true ? (set.holes?.count ?? 0) : 0;
    const named = pointsOf(resolved, 'HOLE_TOO_CLOSE_TO_EDGE');

    expect(total).toBeGreaterThan(50);
    expect(named.length).toBeGreaterThan(0);
    expect(named.length).toBeLessThan(total);
    // Each one really is near the slot rather than merely in the set.
    for (const point of named) expect(point.y).toBeGreaterThan(20);
  });
});

// ——— A hardware hole is its rim (Q33) ——————————————————————————————————————

describe('a hardware hole is measured by its rim, not its centre (Q33)', () => {
  const hardware = (centre: Vec2, radius: number): Feature => ({
    ...base('rivet-1', 'Hole'),
    kind: 'hardware-hole',
    hardwareType: 'rivet',
    source: { kind: 'shape', shape: { type: 'circle', centre, radius } },
  });

  const roundPart = (radius: number): Feature => ({
    ...base('cut-1', 'Outline'),
    kind: 'cut-contour',
    role: 'outer',
    source: { kind: 'shape', shape: { type: 'circle', centre: { x: 0, y: 0 }, radius } },
  });

  const holeCodes = (...features: Feature[]): string[] =>
    codes(evaluate(project(features))).filter(
      (code) => code === 'OUTSIDE_PART' || code === 'HOLE_TOO_CLOSE_TO_EDGE',
    );

  const clearanceOf = (...features: Feature[]): number | undefined => {
    const found = validate(evaluate(project(features))).find(
      (d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE',
    );
    return found?.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE'
      ? found.problem.facts.clearanceMm
      : undefined;
  };

  it('reports a 6 mm hole centred 2 mm inside the edge as off the material', () => {
    // Its rim cuts 1 mm through the edge: the punch takes a bite out of it.
    const [diagnostic, ...rest] = validate(
      evaluate(project([panel(105, 75, 0), hardware({ x: 2, y: 37 }, 3)])),
    );

    expect(rest).toEqual([]);
    expect(diagnostic).toMatchObject({
      problem: { code: 'OUTSIDE_PART', facts: { what: 'holes' } },
      severity: 'error',
      location: { kind: 'points', points: [{ x: 2, y: 37 }] },
    });
  });

  it('reports a 4 mm rivet hole whose rim crosses the edge as off, not merely too close', () => {
    expect(holeCodes(panel(105, 75, 0), hardware({ x: 1, y: 37 }, 2))).toEqual(['OUTSIDE_PART']);
  });

  it('takes a rim that touches the edge as on the leather, with no clearance at all', () => {
    // Tangent circles, the numerically fragile case: within a storage quantum
    // of the edge is on it, as for a line (Q2).
    const outline = panel(105, 75, 0);

    expect(holeCodes(outline, hardware({ x: 2, y: 37 }, 2))).toEqual(['HOLE_TOO_CLOSE_TO_EDGE']);
    expect(clearanceOf(outline, hardware({ x: 2, y: 37 }, 2))).toBeCloseTo(0, 9);
    // Never a negative clearance, a fraction of a quantum over the edge.
    expect(clearanceOf(outline, hardware({ x: 2, y: 37 }, 2.00005))).toBe(0);
  });

  it('catches a rim crossing a rounded corner that the straight sides would not', () => {
    // 3 mm from both sides, and 0.93 mm inside the 8 mm corner's arc.
    expect(holeCodes(panel(105, 75, 8), hardware({ x: 3, y: 3 }, 2))).toEqual(['OUTSIDE_PART']);
  });

  it('reports a rim that crosses into a cut-out', () => {
    const slot: Feature = {
      ...base('hole-1', 'Thumb slot'),
      kind: 'cut-contour',
      role: 'inner',
      source: { kind: 'shape', shape: { type: 'circle', centre: { x: 52, y: 37 }, radius: 20 } },
    };
    // Centre 1 mm outside the slot, radius 2.
    expect(holeCodes(panel(), slot, hardware({ x: 31, y: 37 }, 2))).toEqual(['OUTSIDE_PART']);
  });

  it('reports a hole wider than the part it is punched in', () => {
    expect(holeCodes(roundPart(3), hardware({ x: 0, y: 0 }, 5))).toEqual(['OUTSIDE_PART']);
  });

  // —— Properties ——

  type Verdict = 'fine' | 'too-close' | 'outside';
  const verdict = (found: string[]): Verdict =>
    found.includes('OUTSIDE_PART')
      ? 'outside'
      : found.includes('HOLE_TOO_CLOSE_TO_EDGE')
        ? 'too-close'
        : 'fine';
  const rank: Record<Verdict, number> = { fine: 0, 'too-close': 1, outside: 2 };

  /** Kept clear of the thresholds, where the answer is decided by the last bit. */
  const MARGIN = 1e-3;

  it('agrees with the exact rim clearance on a square-cornered panel', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 2000, noNaN: true }),
        fc.double({ min: 20, max: 2000, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        (width, height, u, v, radius) => {
          const centre = { x: width * (0.001 + 0.998 * u), y: height * (0.001 + 0.998 * v) };
          const rimMm = Math.min(centre.x, width - centre.x, centre.y, height - centre.y) - radius;
          const near = (threshold: number) => Math.abs(rimMm - threshold) < MARGIN;
          fc.pre(!near(0) && !near(MIN_HOLE_EDGE_CLEARANCE_MM));

          const outline = panel(width, height, 0);
          const expected: Verdict =
            rimMm < 0 ? 'outside' : rimMm < MIN_HOLE_EDGE_CLEARANCE_MM ? 'too-close' : 'fine';

          expect(verdict(holeCodes(outline, hardware(centre, radius)))).toBe(expected);
          if (expected === 'too-close') {
            expect(clearanceOf(outline, hardware(centre, radius))).toBeCloseTo(rimMm, 6);
          }
        },
      ),
    );
  });

  it('always reports a hole whose centre is on a round part and whose rim leaves it', () => {
    // An arc-bounded edge, where the nearest point is not on a straight side.
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 0.99, noNaN: true }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.double({ min: MARGIN, max: 20, noNaN: true }),
        (partRadius, along, angle, overshoot) => {
          const out = partRadius * along;
          const centre = { x: out * Math.cos(angle), y: out * Math.sin(angle) };
          const radius = partRadius - out + overshoot;

          expect(verdict(holeCodes(roundPart(partRadius), hardware(centre, radius)))).toBe(
            'outside',
          );
        },
      ),
    );
  });

  it('never finds a new problem with a hole when its radius shrinks', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.5, max: 15, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        (u, v, radius, shrink) => {
          const outline = panel(105, 75, 8);
          const centre = { x: 105 * u, y: 75 * v };
          const before = verdict(holeCodes(outline, hardware(centre, radius)));
          const after = verdict(holeCodes(outline, hardware(centre, radius * shrink)));

          expect(rank[after]).toBeLessThanOrEqual(rank[before]);
        },
      ),
    );
  });
});

describe('validation reused across revisions (PERF-005)', () => {
  /** A marking line with nothing to cut it from. */
  const panelless = (): Feature => ({
    ...base('mark-1', 'Mark'),
    kind: 'marking-line',
    purpose: 'alignment',
    source: {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        false,
      ),
    },
  });

  /** A part `k`: an outline, its stitch line and holes, and round slots. */
  function strapPart(k: number, width: number, slots: readonly Vec2[]): Part {
    const id = (what: string) => `${what}-${k}`;
    return {
      id: id('part'),
      name: `Strap ${k}`,
      quantity: 1,
      features: [
        {
          ...base(id('cut'), 'Outline'),
          kind: 'cut-contour',
          role: 'outer',
          source: {
            kind: 'shape',
            shape: {
              type: 'rect',
              origin: { x: 0, y: k * 60 },
              width,
              height: 40,
              radii: uniformRadii(4),
              rotation: 0,
            },
          },
        },
        {
          ...base(id('stitch'), 'Stitch line'),
          kind: 'stitch-line',
          source: {
            kind: 'derived',
            sourceId: id('cut'),
            op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
          },
        },
        {
          ...base(id('holes'), 'Stitch holes'),
          kind: 'stitch-hole-set',
          source: {
            kind: 'derived',
            sourceId: id('stitch'),
            op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
          },
        },
        ...slots.map((centre, i): Feature => slotAt(`${id('slot')}-${i}`, centre)),
      ],
    };
  }

  const slotAt = (id: string, centre: Vec2, radius = 4): Feature => ({
    ...base(id, 'Slot'),
    kind: 'cut-contour',
    role: 'inner',
    source: { kind: 'shape', shape: { type: 'circle', centre, radius } },
  });

  /**
   * A stitch line in part 1 that follows part 0's outline, and holes on it:
   * off part 1's leather, so it has findings that hang on another part.
   */
  const following = (): Feature[] => [
    {
      ...base('seam-1', 'Seam'),
      kind: 'stitch-line',
      source: {
        kind: 'derived',
        sourceId: 'cut-0',
        op: { type: 'offset', distanceMm: 6, side: 'inward', run: { kind: 'whole' } },
      },
    },
    {
      ...base('seam-holes-1', 'Seam holes'),
      kind: 'stitch-hole-set',
      source: {
        kind: 'derived',
        sourceId: 'seam-1',
        op: { type: 'stitch-holes', pitchMm: 5, mode: 'fit-whole', corners: 'continuous' },
      },
    },
  ];

  /** Replaces part `k`'s feature `j` and nothing else, as a command does. */
  const withFeature = (
    p: Project,
    k: number,
    j: number,
    f: (feature: Feature) => Feature,
  ): Project => ({
    ...p,
    parts: p.parts.map((part, i) =>
      i === k % p.parts.length && part.features.length > 0
        ? {
            ...part,
            features: part.features.map((feature, n) =>
              n === j % part.features.length ? f(feature) : feature,
            ),
          }
        : part,
    ),
  });
  const withPart = (p: Project, k: number, f: (part: Part) => Part): Project => ({
    ...p,
    parts: p.parts.map((part, i) => (i === k % p.parts.length ? f(part) : part)),
  });

  type Edit = (p: Project, history: readonly Project[]) => Project;
  const arbXY = fc.record({
    x: fc.double({ min: -20, max: 320, noNaN: true }),
    y: fc.double({ min: -10, max: 130, noNaN: true }),
  });
  const arbEdit: fc.Arbitrary<Edit> = fc.oneof(
    fc.tuple(fc.nat(), fc.string()).map(
      ([k, name]): Edit =>
        (p) =>
          withPart(p, k, (part) => ({ ...part, name })),
    ),
    fc.tuple(fc.nat(), fc.integer({ min: 1, max: 4 })).map(
      ([k, quantity]): Edit =>
        (p) =>
          withPart(p, k, (part) => ({ ...part, quantity })),
    ),
    fc.tuple(fc.nat(), fc.nat(), fc.string()).map(
      ([k, j, name]): Edit =>
        (p) =>
          withFeature(p, k, j, (feature) => ({ ...feature, name })),
    ),
    // Hidden or shown: a new feature object, its geometry as it was.
    fc.tuple(fc.nat(), fc.nat()).map(
      ([k, j]): Edit =>
        (p) =>
          withFeature(p, k, j, (feature) => ({ ...feature, visible: !feature.visible })),
    ),
    // A slot moved: a cut-out every hole of its part is measured against.
    fc.tuple(fc.nat(), fc.nat(), arbXY).map(
      ([k, j, centre]): Edit =>
        (p) =>
          withFeature(p, k, j, (feature) =>
            feature.kind === 'cut-contour' && feature.role === 'inner'
              ? slotAt(feature.id, centre)
              : feature,
          ),
    ),
    // The outline resized: its stitch line, its holes, and another part's seam follow.
    fc.tuple(fc.nat(), fc.double({ min: 60, max: 300, noNaN: true })).map(
      ([k, width]): Edit =>
        (p) =>
          withFeature(p, k, 0, (feature) =>
            feature.kind === 'cut-contour' &&
            feature.source.kind === 'shape' &&
            feature.source.shape.type === 'rect'
              ? {
                  ...feature,
                  source: { ...feature.source, shape: { ...feature.source.shape, width } },
                }
              : feature,
          ),
    ),
    // The pitch changed: the same holes feature, new holes.
    fc.tuple(fc.nat(), fc.double({ min: 2, max: 30, noNaN: true })).map(
      ([k, pitchMm]): Edit =>
        (p) =>
          withFeature(p, k, 2, (feature) =>
            feature.kind === 'stitch-hole-set' &&
            feature.source.kind === 'derived' &&
            feature.source.op.type === 'stitch-holes'
              ? { ...feature, source: { ...feature.source, op: { ...feature.source.op, pitchMm } } }
              : feature,
          ),
    ),
    // A slot added, or the last feature taken away.
    fc.tuple(fc.nat(), arbXY, fc.nat()).map(
      ([k, centre, n]): Edit =>
        (p) =>
          withPart(p, k, (part) => ({
            ...part,
            features: [...part.features, slotAt(`added-${n}-${part.features.length}`, centre)],
          })),
    ),
    fc.nat().map(
      (k): Edit =>
        (p) =>
          withPart(p, k, (part) =>
            part.features.length > 3 ? { ...part, features: part.features.slice(0, -1) } : part,
          ),
    ),
    // A slot carried to another part: the same feature object, in a part with
    // other leather.
    fc.tuple(fc.nat(), fc.nat()).map(([k, to]): Edit => (p) => {
      const from = k % p.parts.length;
      const target = to % p.parts.length;
      const slot = p.parts[from]!.features.find(
        (f) => f.kind === 'cut-contour' && f.role === 'inner',
      );
      if (slot === undefined || target === from) return p;
      return {
        ...p,
        parts: p.parts.map((part, i) =>
          i === from
            ? { ...part, features: part.features.filter((f) => f !== slot) }
            : i === target
              ? { ...part, features: [...part.features, slot] }
              : part,
        ),
      };
    }),
    // Undo, or redo: a revision diagnosed before, its own objects.
    fc.nat().map(
      (n): Edit =>
        (p, history) =>
          history[n % history.length] ?? p,
    ),
  );

  const arbProject: fc.Arbitrary<Project> = fc
    .tuple(
      fc.array(
        fc.tuple(fc.double({ min: 60, max: 300, noNaN: true }), fc.array(arbXY, { maxLength: 3 })),
        {
          minLength: 1,
          maxLength: 3,
        },
      ),
      fc.boolean(),
    )
    .map(([parts, seam]) => {
      const built = parts.map(([width, slots], k) => strapPart(k, width, slots));
      if (seam && built.length > 1) {
        built[1] = { ...built[1]!, features: [...built[1]!.features, ...following()] };
      }
      return { id: 'proj', name: 'Test', settings: DEFAULT_SETTINGS, parts: built };
    });

  it('finds what a copy sharing no object finds, through any run of edits', () => {
    fc.assert(
      fc.property(arbProject, fc.array(arbEdit, { minLength: 1, maxLength: 8 }), (start, edits) => {
        const history: Project[] = [start];
        expect(diagnose(start)).toEqual(diagnose(structuredClone(start)));
        for (const edit of edits) {
          const next = edit(history.at(-1)!, history);
          history.push(next);
          expect(diagnose(next)).toEqual(diagnose(structuredClone(next)));
        }
      }),
      { numRuns: 200 },
    );
  });

  it('keeps every feature’s findings through a rename, and words the part’s own afresh', () => {
    const before = project([
      panel(),
      stitchLine(),
      holeSet(),
      drawn(
        'stitch-line',
        [
          { x: -20, y: 10 },
          { x: 40, y: 10 },
        ],
        false,
      ),
    ]);
    const renamed = { ...before, parts: [{ ...before.parts[0]!, name: '\u{1F600}' }] };

    const [a, b] = [diagnose(before), diagnose(renamed)];

    const aboutFeatures = (list: readonly Diagnostic[]) =>
      list.filter((d) => d.featureId !== undefined);
    expect(aboutFeatures(b).length).toBeGreaterThan(0);
    aboutFeatures(b).forEach((d, i) => expect(d).toBe(aboutFeatures(a)[i]));
    // The new name has a character the typeface cannot print.
    expect(b.map((d) => d.problem.code)).toContain('TEXT_GLYPH_MISSING');
    expect(a.map((d) => d.problem.code)).not.toContain('TEXT_GLYPH_MISSING');
  });

  it('finds a slot off the leather once the outline shrinks away from it', () => {
    // The slot's own geometry is the same object; only the outline it is
    // measured against changed.
    const wide: Project = {
      id: 'proj',
      name: 'Test',
      settings: DEFAULT_SETTINGS,
      parts: [strapPart(0, 200, [{ x: 150, y: 20 }])],
    };
    const narrow = withFeature(wide, 0, 0, (feature) =>
      feature.kind === 'cut-contour' &&
      feature.source.kind === 'shape' &&
      feature.source.shape.type === 'rect'
        ? {
            ...feature,
            source: { ...feature.source, shape: { ...feature.source.shape, width: 100 } },
          }
        : feature,
    );
    const codesOf = (p: Project) =>
      diagnose(p)
        .filter((d) => d.featureId === 'slot-0-0')
        .map((d) => d.problem.code);

    expect(codesOf(wide)).toEqual([]);
    expect(codesOf(narrow)).toEqual(['CUT_OUT_OUTSIDE_PART']);
  });

  it('places a feature carried to another part in that part', () => {
    const two: Project = {
      id: 'proj',
      name: 'Test',
      settings: DEFAULT_SETTINGS,
      parts: [strapPart(0, 200, [{ x: 50, y: 20 }]), strapPart(1, 200, [{ x: 150, y: 80 }])],
    };
    const slot = two.parts[0]!.features.at(-1)!;
    const moved: Project = {
      ...two,
      parts: [
        { ...two.parts[0]!, features: two.parts[0]!.features.slice(0, -1) },
        { ...two.parts[1]!, features: [...two.parts[1]!.features, slot] },
      ],
    };
    diagnose(two);

    expect(diagnose(moved)).toEqual(diagnose(structuredClone(moved)));
    expect(diagnose(moved).find((d) => d.featureId === slot.id)?.partId).toBe('part-1');
  });

  it('places a crossed cut-out carried between two parts with no outline in its new part', () => {
    // Neither part has leather, so the material the cut-out is found against
    // is the same either side: only the part tells the findings apart.
    const crossed: Feature = {
      ...base('cross-1', 'Crossed'),
      kind: 'cut-contour',
      role: 'inner',
      source: { kind: 'path', path: PathOps.polyline(figureOfEight, true) },
    };
    const before = project([crossed], [panelless()]);
    const after = project([panelless()], [crossed]);
    diagnose(before);

    const placedIn = diagnose(after).find((d) => d.problem.code === 'CONTOUR_SELF_INTERSECTS');

    expect(placedIn?.partId).toBe('part-1');
  });

  it('measures nothing again for a rename', () => {
    // A work bound, not a timing: the guard against a metadata edit
    // validating geometry it did not touch. The audit's 500-point traced
    // outline, drawn, with its stitch line and 468 holes: every segment read
    // of the outline counts. Renaming its part used to validate the holes
    // again, each asked whether it is on the leather and how far it is from
    // the edge, both against all 500 segments: about 480,000 reads. Nothing
    // the outline's findings depend on changed, so none is needed; the bound,
    // 1,000, is under a four-hundredth of that.
    const reads = { count: 0 };
    const outline = PathOps.polyline(
      Array.from({ length: 500 }, (_, i) => {
        const angle = (i / 500) * Math.PI * 2;
        return { x: 300 + 290 * Math.cos(angle), y: 300 + 290 * Math.sin(angle) };
      }),
      true,
    );
    const counted: Path = {
      closed: true,
      segments: new Proxy([...outline.segments], {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key)) reads.count++;
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
    };
    const before = project([
      {
        ...base('cut-1', 'Outline'),
        kind: 'cut-contour',
        role: 'outer',
        source: { kind: 'path', path: counted },
      },
      stitchLine(),
      holeSet(),
    ]);
    diagnose(before);
    reads.count = 0;

    diagnose({ ...before, parts: [{ ...before.parts[0]!, name: 'Renamed' }] });

    expect(reads.count).toBeLessThan(1000);
  });
});

// ——— Pocket requirements (DR8, 9.14b) ———————————————————————————————————————

describe('a pocket holds what it is for (DR8)', () => {
  /** The card holder's pocket (D19): 99.0 mm between stitch lines, its opening 44.3487 mm above the bottom stitching. */
  const cardHolderPocket = (holds?: PocketRequirement): Feature[] => [
    outlineOf({
      ...rectShape(0, -60, 105, 47.3487),
      radii: { bottomLeft: 4, bottomRight: 4, topLeft: 3, topRight: 3 },
    }),
    {
      ...base('stitch-1', 'Stitch line'),
      kind: 'stitch-line',
      source: {
        kind: 'derived',
        sourceId: 'cut-1',
        op: {
          type: 'offset',
          distanceMm: 3,
          side: 'inward',
          run: { kind: 'between', fromAnchor: 2, toAnchor: 1 },
        },
      },
      ...(holds === undefined ? {} : { holds }),
    },
  ];
  /** The bifold's card pocket (D20): 89.0 mm between drawn stitch lines, 53 mm deep, 4 mm under the opening. */
  const bifoldPocket = (holds?: PocketRequirement, width = 89): Feature[] => [
    outlineOf(rectShape(-3, -60, width + 6, 60)),
    {
      ...drawn(
        'stitch-line',
        [
          { x: 0, y: -4 },
          { x: 0, y: -57 },
          { x: width, y: -57 },
          { x: width, y: -4 },
        ],
        false,
      ),
      ...(holds === undefined ? {} : { holds }),
    } as Feature,
  ];
  const card = (easeMm: number, fully = false): PocketRequirement => ({
    content: { kind: 'id-1' },
    easeMm,
    fully,
  });
  const pocketCodes = (features: Feature[]) =>
    diagnose(project(features))
      .filter((d) => d.problem.code.startsWith('POCKET_'))
      .map((d) => d.problem);

  it('flags the bifold and not the card holder for an ID-1 card with 4 mm ease', () => {
    expect(pocketCodes(cardHolderPocket(card(4)))).toEqual([]);
    expect(pocketCodes(bifoldPocket(card(4)))).toEqual([
      {
        code: 'POCKET_TOO_NARROW',
        facts: {
          featureId: 'stitch-1',
          featureName: 'Stitch line',
          content: 'id-1',
          widthMm: 89,
          neededMm: 89.6,
          easeMm: 4,
        },
      },
    ]);
  });

  it('says nothing about a pocket whose maker said nothing about it', () => {
    expect(pocketCodes(cardHolderPocket())).toEqual([]);
    expect(pocketCodes(bifoldPocket(undefined, 50))).toEqual([]);
  });

  it('warns exactly when the width is under the content and the ease, by storage quanta', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: -3, max: 3 }),
        (easeTicks, offsetTicks) => {
          // The bifold is 89 mm across; the content plus ease sits a few quanta either side.
          const easeMm = easeTicks * QUANTUM_MM;
          const widthMm = 89 - easeMm + offsetTicks * QUANTUM_MM;
          if (widthMm <= 0) return;
          const found = pocketCodes(
            bifoldPocket({
              content: { kind: 'size', widthMm, heightMm: 20 },
              easeMm,
              fully: false,
            }),
          );
          expect(found.map((p) => p.code)).toEqual(offsetTicks > 0 ? ['POCKET_TOO_NARROW'] : []);
        },
      ),
    );
  });

  it('reports depth without judging it unless the content goes in fully (D15)', () => {
    // A 53.98 mm card stands 9.6313 mm proud of the card holder's opening, as it is meant to.
    expect(pocketCodes(cardHolderPocket(card(0)))).toEqual([]);
    const fully = pocketCodes(cardHolderPocket(card(1, true)));
    expect(fully).toHaveLength(1);
    expect(fully[0]?.code).toBe('POCKET_TOO_SHALLOW');
    const facts = fully[0]?.facts as { depthMm: number; neededMm: number };
    expect(Math.abs(facts.depthMm - 44.3487)).toBeLessThanOrEqual(EPS_LENGTH);
    expect(facts.neededMm).toBe(53.98);
  });

  it('judges depth by the content alone: ease is room across the pocket, not under it (D22)', () => {
    // The bifold's card sits 3.02 mm below its opening. A 4 mm ease is the leather
    // wrapping the card's two faces, which costs width; counted on depth it would
    // call a pocket that holds its card fully too shallow.
    expect(
      pocketCodes(
        bifoldPocket({ ...card(4, true), content: { kind: 'size', widthMm: 80, heightMm: 53.98 } }),
      ),
    ).toEqual([]);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200_000 }), (easeTicks) => {
        const holds = (heightMm: number): PocketRequirement => ({
          content: { kind: 'size', widthMm: 40, heightMm },
          easeMm: easeTicks * QUANTUM_MM,
          fully: true,
        });
        expect(pocketCodes(bifoldPocket(holds(57)))).toEqual([]);
        expect(pocketCodes(bifoldPocket(holds(57 + QUANTUM_MM))).map((p) => p.code)).toEqual([
          'POCKET_TOO_SHALLOW',
        ]);
      }),
      { numRuns: 30 },
    );
  });

  it('judges a full pocket from its opening, never from its stitch ends', () => {
    // 53 mm of stitching, 57 mm below the opening: a 55 mm card goes in fully, a 57.0001 mm one does not.
    const holds = (heightMm: number): PocketRequirement => ({
      content: { kind: 'size', widthMm: 80, heightMm },
      easeMm: 0,
      fully: true,
    });
    expect(pocketCodes(bifoldPocket(holds(55)))).toEqual([]);
    expect(pocketCodes(bifoldPocket(holds(57)))).toEqual([]);
    expect(pocketCodes(bifoldPocket(holds(57 + QUANTUM_MM))).map((p) => p.code)).toEqual([
      'POCKET_TOO_SHALLOW',
    ]);
  });

  it('says a requirement cannot be checked rather than passing it silently', () => {
    const all: Feature[] = [panel(), { ...stitchLine(), holds: card(4) } as Feature];
    expect(pocketCodes(all)).toEqual([
      {
        code: 'POCKET_NOT_MEASURABLE',
        facts: { featureId: 'stitch-1', featureName: 'Stitch line', reading: 'width' },
      },
    ]);
  });

  it('says a full pocket cannot be checked when its stitching is off the leather', () => {
    const [, stitch] = bifoldPocket(card(4, true), 89);
    const elsewhere = outlineOf(rectShape(500, 0, 50, 50));
    const found = pocketCodes([elsewhere, stitch!]).filter((p) => p.code !== 'POCKET_TOO_NARROW');
    expect(found).toEqual([
      {
        code: 'POCKET_NOT_MEASURABLE',
        facts: { featureId: 'stitch-1', featureName: 'Stitch line', reading: 'opening' },
      },
    ]);
  });

  it('places the warning on the stitching it is about', () => {
    const found = diagnose(project(bifoldPocket(card(4)))).find(
      (d) => d.problem.code === 'POCKET_TOO_NARROW',
    );
    expect(found).toMatchObject({ severity: 'warning', partId: 'part-0', featureId: 'stitch-1' });
    expect(found?.location?.kind).toBe('path');
  });
});

function outlineOf(shape: ParametricShape): Feature {
  return {
    ...base('cut-1', 'Outline'),
    kind: 'cut-contour',
    role: 'outer',
    source: { kind: 'shape', shape },
  };
}

function rectShape(x: number, y: number, width: number, height: number) {
  return {
    type: 'rect' as const,
    origin: { x, y },
    width,
    height,
    radii: uniformRadii(0),
    rotation: 0,
  };
}
