import { evaluate, pocketSize, problem, type Diagnostic } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  drawRectangle,
  outlineOf,
  statesNothing,
  stitchLeavingOpen,
  stitchOf,
  type Side,
} from './actions.js';
import { Bench } from './bench.js';
import { differences, report, within, type Expected } from './expectDiagnostics.js';

/**
 * The harness is tested before anything trusts it: a matcher that forgives a
 * missing or an extra diagnostic would make every scenario pass.
 */

const narrow: Diagnostic = {
  problem: problem('POCKET_TOO_NARROW', {
    featureId: 's',
    featureName: 'Stitch line',
    content: 'id-1',
    widthMm: 84,
    neededMm: 87.6,
    easeMm: 2,
  }),
  severity: 'warning',
  partId: 'p',
  featureId: 's',
  related: [],
};
const empty: Diagnostic = {
  problem: problem('EMPTY_PART', { partId: 'q', partName: 'Q' }),
  severity: 'info',
  partId: 'q',
  related: [],
};
const expectNarrow: Expected = {
  code: 'POCKET_TOO_NARROW',
  severity: 'warning',
  on: 's',
  facts: { widthMm: 84, neededMm: 87.6 },
};

describe('the diagnostic comparison', () => {
  it('finds nothing to report when the lists agree, in any order', () => {
    const expectEmpty: Expected = { code: 'EMPTY_PART', severity: 'info', on: 'part:q' };
    expect(differences([narrow, empty], [expectEmpty, expectNarrow])).toEqual([]);
  });

  it('reports an expected diagnostic that is not there', () => {
    expect(differences([], [expectNarrow])).toEqual([
      { finding: 'missing', line: 'POCKET_TOO_NARROW (warning) on s' },
    ]);
  });

  it('reports a diagnostic nobody expected, even when nothing was', () => {
    expect(differences([narrow], []).map((d) => d.finding)).toEqual(['unexpected']);
  });

  it('reports a wrong severity, subject, related feature and measurement each by name', () => {
    const loud = { ...narrow, severity: 'error' as const, related: ['x'] };
    expect(differences([loud], [{ ...expectNarrow, related: [] }])).toEqual([
      { finding: 'severity', line: 'POCKET_TOO_NARROW on s — expected warning, got error' },
      {
        finding: 'related',
        line: 'POCKET_TOO_NARROW on s — expected related [], got [x]',
      },
    ]);
    expect(differences([narrow], [{ ...expectNarrow, on: 't' }])).toEqual([
      { finding: 'target', line: 'POCKET_TOO_NARROW — expected on t, found on s' },
    ]);
    expect(differences([narrow], [{ ...expectNarrow, facts: { widthMm: 83 } }])).toEqual([
      { finding: 'facts', line: 'POCKET_TOO_NARROW on s — widthMm: expected 83, got 84' },
    ]);
  });

  it('compares a measurement within EPS_LENGTH, or a tolerance it is given', () => {
    const noisy = {
      ...narrow,
      problem: { ...narrow.problem, facts: { ...narrow.problem.facts, widthMm: 84 + 1e-9 } },
    } as Diagnostic;
    expect(differences([noisy], [expectNarrow])).toEqual([]);
    expect(
      differences([narrow], [{ ...expectNarrow, facts: { widthMm: within(84.004, 0.005) } }]),
    ).toEqual([]);
    expect(() => within(84, 1e-12)).toThrow(RangeError);
  });

  it('reports a problem listed twice on one subject', () => {
    expect(differences([narrow, narrow], [expectNarrow, expectNarrow])).toEqual([
      { finding: 'duplicate', line: 'POCKET_TOO_NARROW:s on s — listed 2 times' },
    ]);
  });

  it('reads nested facts, as a seam’s two sides are', () => {
    const facts = { a: { count: 12 }, b: { count: 11 } };
    const seam = {
      ...narrow,
      problem: { code: 'SEAM_HOLE_COUNT_MISMATCH', facts },
    } as unknown as Diagnostic;
    expect(
      differences(
        [seam],
        [
          {
            code: 'SEAM_HOLE_COUNT_MISMATCH',
            severity: 'warning',
            on: 's',
            facts: { a: { count: 12 }, b: { count: 12 } },
          },
        ],
      ),
    ).toEqual([
      { finding: 'facts', line: 'SEAM_HOLE_COUNT_MISMATCH on s — b.count: expected 12, got 11' },
    ]);
  });

  it('prints every difference and both lists in full', () => {
    const text = report([empty], [expectNarrow], 'after widening');
    expect(text).toContain('the diagnostics after widening are not what the scenario expects');
    expect(text).toContain('missing     POCKET_TOO_NARROW (warning) on s');
    expect(text).toContain('unexpected  EMPTY_PART (info) on part:q');
    expect(text).toContain('Expected (1):');
    expect(text).toContain('Actual (1):');
    expect(report([], [])).toBeNull();
  });
});

describe('the workbench', () => {
  it('refuses a step that changes nothing, so no scenario passes on an edit that did not happen', () => {
    const bench = new Bench().do(drawRectangle('panel', { x: 0, y: 0, width: 50, height: 30 }));
    // A requirement taken off an outline, which has none to take: the command
    // applies and leaves the project as it was.
    expect(() => bench.do(statesNothing(outlineOf('panel')))).toThrow('changed nothing');
  });

  it('undoes and redoes one maker’s step at a time, and says when there is none', () => {
    const bench = new Bench().do(drawRectangle('panel', { x: 0, y: 0, width: 50, height: 30 }));
    expect(bench.undo().project.parts).toEqual([]);
    expect(bench.redo().project.parts).toHaveLength(1);
    expect(() => bench.redo()).toThrow('nothing left to redo');
  });

  it.each<[Side, { x: number; y: number }, { x: number; y: number }]>([
    ['top', { x: 3, y: 60 }, { x: 97, y: 60 }],
    ['bottom', { x: 97, y: 0 }, { x: 3, y: 0 }],
    ['left', { x: 0, y: 3 }, { x: 0, y: 57 }],
    ['right', { x: 100, y: 57 }, { x: 100, y: 3 }],
  ])('leaves the %s of a rectangle open when asked to', (side, start, end) => {
    const bench = new Bench().do(
      drawRectangle('pocket', { x: 0, y: 0, width: 100, height: 60 }),
      stitchLeavingOpen('pocket', side, 3),
    );
    const stitch = evaluate(bench.project)
      .parts.flatMap((p) => p.features)
      .find((f) => f.feature.id === stitchOf('pocket'));
    if (stitch?.ok !== true) throw new Error('the stitching must resolve');
    expect(PathOps.start(stitch.path)).toEqual(start);
    expect(PathOps.end(stitch.path)).toEqual(end);
    expect(pocketSize(stitch.path)).not.toBeNull();
  });
});
