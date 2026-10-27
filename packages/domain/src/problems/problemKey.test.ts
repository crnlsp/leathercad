import { uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { diagnose } from '../diagnose.js';
import { DEFAULT_SETTINGS, type Feature, type Project } from '../feature.js';
import { problem, problemKey } from './index.js';

const named = { featureId: 'f-1', featureName: 'Stitch line' };

const base = (id: string) => ({ id, name: id, visible: true, locked: false });

function rect(id: string, x: number, y: number, width: number, height: number): Feature {
  return {
    ...base(id),
    kind: 'cut-contour',
    role: 'outer',
    source: {
      kind: 'shape',
      shape: {
        type: 'rect',
        origin: { x, y },
        width,
        height,
        radii: uniformRadii(0),
        rotation: 0,
      },
    },
  };
}

const stitch = (id: string, from: string, inset: number): Feature => ({
  ...base(id),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'offset', distanceMm: inset, side: 'inward', run: { kind: 'whole' } },
  },
});

const holes = (id: string, from: string, pitchMm = 3.85): Feature => ({
  ...base(id),
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'stitch-holes', pitchMm, mode: 'fit-whole', corners: 'continuous' },
  },
});

const projectOf = (...parts: Feature[][]): Project => ({
  id: 'proj',
  name: 'Test',
  settings: DEFAULT_SETTINGS,
  parts: parts.map((features, i) => ({
    id: `part-${i}`,
    name: `Part ${i}`,
    quantity: 1,
    features,
  })),
});

/** Problems of several kinds: a failed feature, holes too near an edge, a part with nothing in it. */
function troubled(dx = 0, dy = 0): Project {
  return projectOf(
    [
      rect('outline', dx, dy, 100, 60),
      stitch('line', 'outline', 0.5),
      holes('holes', 'line'),
      holes('broken', 'line', 0.01),
    ],
    [],
  );
}

const keysOf = (p: Project): string[] => diagnose(p).map((d) => problemKey(d.problem));

describe('problemKey: one occurrence, named by what it is about', () => {
  it('tells apart codes whose facts name more than the feature', () => {
    const invalid = (parameter: 'width' | 'height') =>
      problem('PARAMETER_INVALID', { ...named, parameter, value: 0, requirement: 'positive' });
    expect(problemKey(invalid('width'))).not.toBe(problemKey(invalid('height')));

    const failed = (sourceId: string) =>
      problem('SOURCE_FAILED', { ...named, sourceId, sourceName: 'x' });
    expect(problemKey(failed('f-2'))).not.toBe(problemKey(failed('f-3')));

    const off = (what: 'holes' | 'line') => problem('OUTSIDE_PART', { ...named, what });
    expect(problemKey(off('holes'))).not.toBe(problemKey(off('line')));

    const missing = (anchor: number) =>
      problem('ANCHOR_MISSING', { ...named, anchor, available: 2 });
    expect(problemKey(missing(2))).not.toBe(problemKey(missing(3)));
  });

  it('ignores names and measured values, which are not identity', () => {
    const at = (distanceMm: number, featureName: string) =>
      problem('OFFSET_COLLAPSED', { featureId: 'f-1', featureName, distanceMm, side: 'inward' });
    expect(problemKey(at(5, 'A'))).toBe(problemKey(at(9, 'B')));
  });

  it('is unique within a result', () => {
    const keys = keysOf(troubled());
    expect(keys.length).toBe(3);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('PARAMETER_INVALID:broken:pitch');
    expect(keys).toContain('EMPTY_PART:part-1');
  });

  it('is unchanged by translating the part', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (dx, dy) => {
          expect(keysOf(troubled(dx, dy))).toEqual(keysOf(troubled()));
        },
      ),
    );
  });

  it('is unchanged by an unrelated feature appearing', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.double({ min: 20, max: 300, noNaN: true }),
        (w, h) => {
          const before = troubled();
          const [first, ...rest] = before.parts;
          const after: Project = {
            ...before,
            parts: [
              { ...first!, features: [...first!.features, rect('other', 400, 400, w, h)] },
              ...rest,
            ],
          };
          const kept = new Set(keysOf(after));
          for (const key of keysOf(before)) expect(kept.has(key)).toBe(true);
          expect(kept.size).toBe(keysOf(after).length);
        },
      ),
    );
  });

  it('changes when the problem is about a different feature', () => {
    const about = [
      (id: string) => problem('CUT_OUT_OUTSIDE_PART', { featureId: id, featureName: 'x' }),
      (id: string) => problem('EMPTY_PART', { partId: id, partName: 'x' }),
    ];
    fc.assert(
      fc.property(fc.constantFrom(...about), fc.uuid(), fc.uuid(), (make, a, b) => {
        fc.pre(a !== b);
        expect(problemKey(make(a))).not.toBe(problemKey(make(b)));
      }),
    );
  });
});
