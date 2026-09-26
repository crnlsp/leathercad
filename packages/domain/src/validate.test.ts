import { PathOps, uniformRadii, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { diagnose } from './diagnose.js';
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
    const rivetAt = (x: number) => rivet({ x, y: 37 });

    it('warns about a rivet under 1.5 mm from the edge, saying how near', () => {
      const [diagnostic] = validate(evaluate(project([panel(), rivetAt(1)]))).filter(
        (d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE',
      );

      expect(diagnostic).toMatchObject({
        problem: { facts: { clearanceMm: 1, minimumMm: 1.5 } },
        severity: 'warning',
        featureId: 'rivet-1',
      });
    });

    it('does not warn at 1.5 mm exactly, or further in', () => {
      expect(codes(evaluate(project([panel(), rivetAt(1.5)])))).toEqual([]);
      expect(codes(evaluate(project([panel(), rivetAt(8)])))).toEqual([]);
    });

    it('measures to a cut-out’s edge as readily as to the outline', () => {
      // A rivet 1 mm outside the slot: far from the outline, far too near the
      // hole. Both are edges the leather can tear to.
      const [diagnostic] = validate(
        evaluate(project([panel(), slot(), rivet({ x: 52 - 21, y: 37 })])),
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
    const resolved = evaluate(project([panel(105, 75, 0), rivetAt({ x: 1, y: 37 })]));

    expect(codes(resolved)).toContain('HOLE_TOO_CLOSE_TO_EDGE');
    expect(pointsOf(resolved, 'HOLE_TOO_CLOSE_TO_EDGE')).toEqual([{ x: 1, y: 37 }]);
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
