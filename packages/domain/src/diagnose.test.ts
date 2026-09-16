import { PathOps, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { diagnose } from './diagnose.js';
import { DEFAULT_SETTINGS, type Feature, type Project } from './feature.js';
import { PROBLEM_CODES } from './problems/index.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const panel = (): Feature => ({
  ...base('cut-1', 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width: 105,
      height: 75,
      radii: uniformRadii(8),
      rotation: 0,
    },
  },
});

const stitchLine = (inset: number): Feature => ({
  ...base('stitch-1', 'Stitch line'),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: 'cut-1',
    op: { type: 'offset', distanceMm: inset, side: 'inward', run: { kind: 'whole' } },
  },
});

const holeSet = (): Feature => ({
  ...base('holes-1', 'Stitch holes'),
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId: 'stitch-1',
    op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
  },
});

const crossedOutline = (): Feature => ({
  ...base('cut-2', 'Crossed'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'path',
    path: PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 50, y: 0 },
        { x: 0, y: 50 },
      ],
      true,
    ),
  },
});

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

describe('diagnose', () => {
  it('lists an inset too deep for its outline once, at its root (E3)', () => {
    const diagnostics = diagnose(project([panel(), stitchLine(60), holeSet()]));

    expect(diagnostics.map((d) => [d.featureId, d.problem.code])).toEqual([
      ['stitch-1', 'OFFSET_COLLAPSED'],
      ['holes-1', 'SOURCE_FAILED'],
    ]);
  });

  it('points the collapse at what it was built from, and the holes at the line they follow', () => {
    const [collapse, holes] = diagnose(project([panel(), stitchLine(60), holeSet()]));

    expect(collapse).toMatchObject({
      problem: { facts: { distanceMm: 60, side: 'inward' } },
      severity: 'error',
      partId: 'part-0',
      related: [],
      location: { kind: 'path' },
    });
    expect(holes).toMatchObject({
      problem: { facts: { sourceId: 'stitch-1', sourceName: 'Stitch line' } },
      related: ['stitch-1'],
    });
    expect(holes!.location).toBeUndefined();
  });

  it('has nothing to say once the inset fits', () => {
    expect(diagnose(project([panel(), stitchLine(3.5), holeSet()]))).toEqual([]);
  });

  it('returns the same list to everyone who asks about the same project (X7)', () => {
    const p = project([panel(), stitchLine(60)]);
    expect(diagnose(p)).toBe(diagnose(p));
  });

  it('orders by part, then feature, whatever kind of problem each is', () => {
    const diagnostics = diagnose(project([], [crossedOutline()], [panel(), stitchLine(60)]));

    expect(diagnostics.map((d) => [d.partId, d.problem.code])).toEqual([
      ['part-0', 'EMPTY_PART'],
      ['part-1', 'CONTOUR_SELF_INTERSECTS'],
      ['part-2', 'OFFSET_COLLAPSED'],
    ]);
  });

  it('gives every diagnostic its code’s registered severity', () => {
    for (const d of diagnose(
      project([], [crossedOutline()], [panel(), stitchLine(60), holeSet()]),
    )) {
      expect(d.severity).toBe(PROBLEM_CODES[d.problem.code].severity);
    }
  });

  it('never lists a refusal — only outcomes and rules', () => {
    const p = project([], [crossedOutline()], [panel(), stitchLine(60), holeSet()]);
    for (const d of diagnose(p)) {
      expect(['outcome', 'rule']).toContain(PROBLEM_CODES[d.problem.code].category);
    }
  });

  it('never also judges a feature that failed', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 80, noNaN: true }), (inset) => {
        const diagnostics = diagnose(project([panel(), stitchLine(inset), holeSet()]));
        const failed = new Set(
          diagnostics
            .filter((d) => PROBLEM_CODES[d.problem.code].category === 'outcome')
            .map((d) => d.featureId),
        );
        return diagnostics.every(
          (d) => PROBLEM_CODES[d.problem.code].category !== 'rule' || !failed.has(d.featureId),
        );
      }),
    );
  });
});
