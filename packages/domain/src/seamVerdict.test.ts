import { EPS_LENGTH } from '@leathercad/core';
import { PathOps, Shapes } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Project, type Seam } from './feature.js';
import { diagnosticTarget } from './diagnosticTarget.js';
import { evaluate } from './evaluate.js';
import { diagnose } from './diagnose.js';
import { resolveSeam, seamRefusal, seamVerdict, SEAM_DRIFT_LIMIT_MM } from './seams.js';

function fixture(a: number, b: number, countA = 11, countB = countA): Project {
  return {
    id: 'project',
    name: 'Pairing',
    settings: DEFAULT_SETTINGS,
    parts: [a, b].map((length, i) => ({
      id: `part-${i}`,
      name: i === 0 ? 'Pocket' : 'Outer',
      quantity: 1,
      features: [
        {
          id: `line-${i}`,
          name: 'Line',
          kind: 'stitch-line',
          visible: true,
          locked: false,
          source: {
            kind: 'path',
            path: PathOps.polyline(
              [
                { x: i * 200, y: 0 },
                { x: i * 200, y: length },
              ],
              false,
            ),
          },
        },
        {
          id: `holes-${i}`,
          name: 'Holes',
          kind: 'stitch-hole-set',
          visible: true,
          locked: false,
          source: {
            kind: 'derived',
            sourceId: `line-${i}`,
            op: {
              type: 'stitch-holes',
              pitchMm: length / ((i === 0 ? countA : countB) - 1),
              mode: 'fit-whole',
              corners: 'hole-at-corner',
            },
          },
        },
      ],
    })),
    seams: [seam],
  };
}
const seam: Seam = {
  id: 'seam',
  a: { holeSetId: 'holes-0', stretch: { kind: 'between', fromAnchor: 'start', toAnchor: 'end' } },
  b: { holeSetId: 'holes-1', stretch: { kind: 'between', fromAnchor: 'start', toAnchor: 'end' } },
};

describe('DR7 seam pairing', () => {
  it('compares travelled distances from the first hole, including sub-limit information', () => {
    expect(SEAM_DRIFT_LIMIT_MM).toBe(0.5);
    expect(seamVerdict(fixture(40, 40.4), seam)).toMatchObject({
      ok: true,
      countA: 11,
      countB: 11,
      driftMm: expect.closeTo(0.4, 9),
      worstPair: 11,
      severity: 'info',
    });
    expect(diagnose(fixture(40, 40.4)).filter((d) => d.problem.code.startsWith('SEAM_'))).toEqual(
      [],
    );
    const d = diagnose(fixture(40, 40.6)).find((d) => d.problem.code === 'SEAM_HOLES_DRIFT');
    expect(d).toMatchObject({
      severity: 'warning',
      partId: 'part-0',
      featureId: 'holes-0',
      related: ['holes-1'],
      problem: {
        facts: {
          seamId: 'seam',
          a: { partName: 'Pocket', count: 11, lengthMm: 40, stretch: seam.a.stretch },
          b: { partName: 'Outer', count: 11 },
          worstPair: 11,
          driftMm: expect.closeTo(0.6, 9),
        },
      },
    });
  });
  it('frames both sewn pieces while selecting side A', () => {
    const p = fixture(40, 40.6);
    const d = diagnose(p).find((d) => d.problem.code === 'SEAM_HOLES_DRIFT');
    if (d === undefined) throw new Error('drift must be listed');
    const target = diagnosticTarget(evaluate(p), d);
    expect(target.subject).toEqual({ kind: 'feature', featureId: 'holes-0' });
    expect(target.bounds?.minX).toBeLessThan(0);
    expect(target.bounds?.maxX).toBeGreaterThan(200);
  });
  it('reports different counts as an error even when the paired distances agree', () => {
    expect(
      diagnose(fixture(40, 40, 11, 10)).filter((d) => d.problem.code.startsWith('SEAM_')),
    ).toMatchObject([{ severity: 'error', problem: { code: 'SEAM_HOLE_COUNT_MISMATCH' } }]);
  });
  it('finds the worst interior pair even when both ends and counts agree', () => {
    const p = fixture(40, 40);
    const bent: Project = {
      ...p,
      parts: p.parts.map((part) => ({
        ...part,
        features: part.features.map((f) =>
          f.id === 'line-0' && f.kind === 'stitch-line'
            ? {
                ...f,
                source: {
                  kind: 'path',
                  path: PathOps.polyline(
                    [
                      { x: 0, y: 0 },
                      { x: 0, y: 13 },
                      { x: 27, y: 13 },
                    ],
                    false,
                  ),
                },
              }
            : f,
        ),
      })),
    };
    expect(seamVerdict(bent, seam)).toMatchObject({
      ok: true,
      countA: 11,
      countB: 11,
      lengthA: 40,
      lengthB: 40,
      driftMm: expect.closeTo(1, 9),
      worstPair: 4,
      severity: 'warning',
    });
  });
  it('refreshes diagnostic names when a piece is renamed', () => {
    const p = fixture(40, 40.6);
    const renamed = {
      ...p,
      parts: p.parts.map((part) =>
        part.id === 'part-1' ? { ...part, name: 'Renamed outer' } : part,
      ),
    };
    diagnose(p);
    expect(
      diagnose(renamed).find((d) => d.problem.code === 'SEAM_HOLES_DRIFT')?.problem.facts,
    ).toMatchObject({ b: { partName: 'Renamed outer' } });
  });
  it('treats the limit itself as within tolerance', () => {
    expect(seamVerdict(fixture(40, 40.5), seam)).toMatchObject({ severity: 'info' });
  });
  it('is symmetric and drift grows with the length difference for fixed counts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 400 }),
        fc.integer({ min: 0, max: 100 }),
        (length, delta) => {
          const p = fixture(length, length + delta / 10);
          const first = seamVerdict(p, seam);
          const swapped = seamVerdict(p, { ...seam, a: seam.b, b: seam.a });
          const greater = seamVerdict(fixture(length, length + delta / 10 + 1), seam);
          if (!first.ok || !swapped.ok || !greater.ok) throw new Error('valid seam');
          expect(Math.abs(first.driftMm - swapped.driftMm)).toBeLessThanOrEqual(EPS_LENGTH);
          expect(first.severity).toBe(swapped.severity);
          expect(greater.driftMm).toBeGreaterThan(first.driftMm);
          expect(Math.abs(first.driftMm - delta / 10)).toBeLessThanOrEqual(EPS_LENGTH);
        },
      ),
    );
  });
  it('reuses the verdict after unrelated edits and rechecks either changed side', () => {
    const p = fixture(40, 40.6);
    const first = seamVerdict(p, seam);
    expect(seamVerdict({ ...p, name: 'Renamed' }, seam)).toBe(first);
    const d = diagnose(p).find((d) => d.problem.code === 'SEAM_HOLES_DRIFT');
    expect(
      diagnose({ ...p, name: 'Unrelated' }).find((d) => d.problem.code === 'SEAM_HOLES_DRIFT'),
    ).toBe(d);
    const unrelatedFeatureEdit = { ...p, parts: p.parts.map((part) => ({ ...part, quantity: 2 })) };
    expect(diagnose(unrelatedFeatureEdit).find((d) => d.problem.code === 'SEAM_HOLES_DRIFT')).toBe(
      d,
    );
    expect(seamVerdict(fixture(40, 41), seam)).not.toBe(first);
    expect(seamVerdict(fixture(41, 40.6), seam)).not.toBe(first);
  });
  it('walks cornerless closed lines once from their existing start (D18)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 100 }), (radius) => {
        const p = fixture(40, 40);
        const circle: Project = {
          ...p,
          parts: p.parts.map((part) => ({
            ...part,
            features: part.features.map((f) =>
              f.kind === 'stitch-line'
                ? { ...f, source: { kind: 'path', path: Shapes.circle({ x: 0, y: 0 }, radius) } }
                : f,
            ),
          })),
        };
        const whole: Seam = {
          ...seam,
          a: { ...seam.a, stretch: { kind: 'whole' } },
          b: { ...seam.b, stretch: { kind: 'whole' } },
        };
        const result = resolveSeam(circle, whole);
        if (!result.ok) throw new Error('circle must resolve without corners');
        expect(result.a.lengthMm).toBeCloseTo(2 * Math.PI * radius, 8);
        expect(new Set(result.a.holes.map((h) => h.ordinal)).size).toBe(result.a.holes.length);
        expect(seamVerdict(circle, whole)).toMatchObject({ severity: 'info', driftMm: 0 });
        expect(seamRefusal(p, whole)?.code).toBe('SEAM_REQUIRES_CLOSED_LINE');
      }),
    );
  });
});
