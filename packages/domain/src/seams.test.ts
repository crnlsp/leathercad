import { EPS_LENGTH } from '@leathercad/core';
import { MatOps, PathOps, Shapes, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Feature, type Project, type Seam } from './feature.js';
import { evaluate } from './evaluate.js';
import { diagnose } from './diagnose.js';
import { problemKey } from './problems/index.js';
import { resolveSeam, seamRefusal, seamVerdict } from './seams.js';

const holeOp = {
  type: 'stitch-holes',
  pitchMm: 4,
  mode: 'fit-whole',
  corners: 'hole-at-corner',
} as const;
function project(width = 40, height = 20): Project {
  const path = Shapes.roundedRect({ x: 0, y: 0 }, width, height, uniformRadii(0));
  const features: Feature[] = [
    {
      id: 'line',
      name: 'Stitch line',
      kind: 'stitch-line',
      visible: true,
      locked: false,
      source: { kind: 'path', path },
    },
    {
      id: 'holes',
      name: 'Holes',
      kind: 'stitch-hole-set',
      visible: true,
      locked: false,
      source: { kind: 'derived', sourceId: 'line', op: holeOp },
    },
  ];
  return {
    id: 'project',
    name: 'Seams',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part', name: 'Panel', quantity: 1, features }],
  };
}
const seam: Seam = {
  id: 'seam',
  a: { holeSetId: 'holes', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
  b: { holeSetId: 'holes', stretch: { kind: 'from', anchor: 3, toward: 'previous' } },
};

describe('seam stretches (9.6a)', () => {
  it('rechecks when only the second side changes its distribution', () => {
    const p = project();
    const value: Seam = { ...seam, b: { ...seam.a, holeSetId: 'other-holes' } };
    const withPitch = (pitchMm: number): Project => ({
      ...p,
      parts: p.parts.map((part) => ({
        ...part,
        features: [
          ...part.features,
          {
            id: 'other-holes',
            name: 'Other holes',
            kind: 'stitch-hole-set',
            visible: true,
            locked: false,
            source: { kind: 'derived', sourceId: 'line', op: { ...holeOp, pitchMm } },
          },
        ],
      })),
    });
    const first = resolveSeam(withPitch(4), value);
    const changed = resolveSeam(withPitch(2), value);
    expect(changed).not.toBe(first);
    if (!first.ok || !changed.ok) throw new Error('both distributions must resolve');
    expect(first.a.holes).toEqual(changed.a.holes);
    expect(changed.b.holes.length).toBeGreaterThan(first.b.holes.length);
  });

  it('walks an open fixed stretch in reverse from its declared start', () => {
    const p = project();
    const open: Project = {
      ...p,
      parts: p.parts.map((part) => ({
        ...part,
        features: part.features.map((f): Feature =>
          f.kind === 'stitch-line'
            ? {
                ...f,
                source: {
                  kind: 'path',
                  path: PathOps.polyline(
                    [
                      { x: 0, y: 20 },
                      { x: 0, y: 0 },
                      { x: 40, y: 0 },
                      { x: 40, y: 20 },
                    ],
                    false,
                  ),
                },
              }
            : f,
        ),
      })),
    };
    const value: Seam = {
      ...seam,
      a: { holeSetId: 'holes', stretch: { kind: 'between', fromAnchor: 1, toAnchor: 0 } },
      b: seam.a,
    };
    const result = resolveSeam(open, value);
    if (!result.ok) throw new Error('reverse fixed stretches must resolve');
    expect(result.a.lengthMm).toBeCloseTo(40, 9);
    expect(result.a.holes.map((hole) => hole.distanceMm)).toEqual(
      result.b.holes.map((hole) => hole.distanceMm),
    );
    expect(result.a.holes[0]?.hole.point).toEqual(result.b.holes.at(-1)?.hole.point);
  });
  it('does no new seam walk after an unrelated edit, but rechecks changed inputs', () => {
    const p = project();
    const first = resolveSeam(p, seam);
    expect(resolveSeam({ ...p, name: 'Renamed' }, seam)).toBe(first);
    const changed = project(60, 30);
    const next = resolveSeam(changed, seam);
    expect(next).not.toBe(first);
    if (!next.ok) throw new Error('the resized seam must resolve');
    expect(next.a.lengthMm).toBeCloseTo(30, 9);
  });
  it('walks a pouch sewn to itself from either direction, counting shared corner holes', () => {
    const result = resolveSeam(project(), seam);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.a.lengthMm).toBeCloseTo(20, 9);
    expect(result.b.lengthMm).toBeCloseTo(20, 9);
    expect(result.a.holes.map((hole) => hole.distanceMm)).toEqual([0, 4, 8, 12, 16, 20]);
    expect(result.b.holes.map((hole) => hole.distanceMm)).toEqual([0, 4, 8, 12, 16, 20]);
  });

  it('swaps sides without changing either stretch, for any rectangular piece', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 1, max: 500 }), (w, h) => {
        const p = project(w, h);
        const first = resolveSeam(p, seam);
        const swapped = resolveSeam(p, { ...seam, a: seam.b, b: seam.a });
        expect(first.ok).toBe(true);
        if (!first.ok || !swapped.ok) throw new Error('valid stretches must resolve');
        expect(first.a).toEqual(swapped.b);
        expect(first.b).toEqual(swapped.a);
      }),
    );
  });

  it('keeps walked distances when the piece is moved, turned or reflected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.boolean(),
        (width, angle, reflected) => {
          const p = project(width);
          const line = p.parts[0]?.features[0];
          if (line?.kind !== 'stitch-line' || line.source.kind !== 'path')
            throw new Error('fixture is a drawn line');
          const path = line.source.path;
          const matrix = MatOps.composeAll(
            MatOps.fromScale(reflected ? -1 : 1, 1),
            MatOps.fromRotation(angle),
            MatOps.fromTranslation({ x: 100, y: -20 }),
          );
          const changed: Project = {
            ...p,
            parts: p.parts.map((part) => ({
              ...part,
              features: part.features.map((f) =>
                f.id === 'line' && f.kind === 'stitch-line'
                  ? { ...f, source: { kind: 'path', path: PathOps.transform(path, matrix) } }
                  : f,
              ),
            })),
          };
          const originalVerdict = seamVerdict(p, seam);
          const changedVerdict = seamVerdict(changed, seam);
          if (!originalVerdict.ok || !changedVerdict.ok)
            throw new Error('isometric seam must resolve');
          expect(Math.abs(originalVerdict.driftMm - changedVerdict.driftMm)).toBeLessThanOrEqual(
            EPS_LENGTH,
          );
          expect(changedVerdict.severity).toBe(originalVerdict.severity);
          const a = resolveSeam(p, seam);
          const b = resolveSeam(changed, seam);
          if (!a.ok || !b.ok) throw new Error('an isometry cannot break a seam');
          for (const side of ['a', 'b'] as const) {
            expect(Math.abs(a[side].lengthMm - b[side].lengthMm)).toBeLessThanOrEqual(EPS_LENGTH);
            expect(a[side].holes.length).toBe(b[side].holes.length);
            a[side].holes.forEach((hole, i) =>
              expect(
                Math.abs(hole.distanceMm - (b[side].holes[i]?.distanceMm ?? Infinity)),
              ).toBeLessThanOrEqual(EPS_LENGTH),
            );
          }
        },
      ),
    );
  });

  it('walks a full closed loop once, even when its start is not the path start', () => {
    const side = {
      holeSetId: 'holes',
      stretch: { kind: 'between', fromAnchor: 1, toAnchor: 1 },
    } as const;
    const p = project();
    const result = resolveSeam(p, { ...seam, a: side, b: side });
    if (!result.ok) throw new Error('closed loop must resolve');
    const holes = evaluate(p).parts[0]?.features[1];
    expect(result.a.lengthMm).toBeCloseTo(120, 9);
    expect(result.a.holes).toHaveLength(holes?.ok ? (holes.holes?.count ?? 0) : 0);
    expect(new Set(result.a.holes.map((hole) => hole.ordinal)).size).toBe(result.a.holes.length);
  });

  it('reports a missing or failed hole set without dropping the seam', () => {
    const p = { ...project(), seams: [{ ...seam, b: { ...seam.b, holeSetId: 'gone' } }] };
    expect(seamRefusal(p, p.seams[0]!)).toBeNull();
    const diagnostics = diagnose(p).filter((entry) => entry.problem.code === 'SEAM_SIDE_MISSING');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.problem.facts).toMatchObject({ seamId: 'seam', holeSetId: 'gone' });
    expect(p.seams).toHaveLength(1);
  });

  it('places a missing first side on its surviving partner and relates the missing side', () => {
    const p: Project = { ...project(), seams: [{ ...seam, a: { ...seam.a, holeSetId: 'gone' } }] };
    expect(diagnose(p).find((d) => d.problem.code === 'SEAM_SIDE_MISSING')).toMatchObject({
      featureId: 'holes',
      related: ['gone'],
    });
  });

  it('reports a swallowed anchor in its original slot and includes the seam in its identity', () => {
    const p = project();
    const root = p.parts[0]?.features[0];
    if (root?.kind !== 'stitch-line') throw new Error('the fixture starts with a line');
    const outline: Feature = { ...root, id: 'outline', kind: 'cut-contour', role: 'outer' };
    const partial: Feature = {
      ...root,
      source: {
        kind: 'derived',
        sourceId: 'outline',
        op: {
          type: 'offset',
          distanceMm: 2,
          side: 'inward',
          run: { kind: 'between', fromAnchor: 0, toAnchor: 1 },
        },
      },
    };
    const changed: Project = {
      ...p,
      parts: p.parts.map((part) => ({
        ...part,
        features: [outline, partial, ...part.features.filter((f) => f.id !== 'line')],
      })),
    };
    const value: Seam = {
      ...seam,
      a: { ...seam.a, stretch: { kind: 'between', fromAnchor: 2, toAnchor: 1 } },
      b: seam.a,
    };
    expect(seamRefusal(changed, value)).toBeNull();
    const result = resolveSeam(changed, value);
    expect(result).toMatchObject({
      ok: false,
      problem: { code: 'ANCHOR_MISSING', facts: { seamId: 'seam', anchor: 2 } },
    });
  });

  it('refuses two length-following sides and a feature that is not stitching', () => {
    const p = project();
    expect(seamRefusal(p, { ...seam, a: seam.b })?.code).toBe('SEAM_HAS_NO_LENGTH');
    expect(seamRefusal(p, { ...seam, a: { ...seam.a, holeSetId: 'line' } })?.code).toBe(
      'SEAM_NOT_A_HOLE_SET',
    );
  });

  it('refuses an anchor index outside the line without moving it to a neighbour', () => {
    expect(
      seamRefusal(project(), {
        ...seam,
        a: { ...seam.a, stretch: { kind: 'between', fromAnchor: 0, toAnchor: 99 } },
      })?.code,
    ).toBe('ANCHOR_MISSING');
  });

  it('reports SEAM_RUNS_OFF_THE_LINE instead of clamping an open side', () => {
    const p = project();
    const open: Project = {
      ...p,
      parts: p.parts.map((part) => ({
        ...part,
        features: part.features.map((f): Feature =>
          f.kind === 'stitch-line'
            ? {
                ...f,
                source: {
                  kind: 'path',
                  path: PathOps.polyline(
                    [
                      { x: 0, y: 20 },
                      { x: 0, y: 0 },
                      { x: 40, y: 0 },
                      { x: 40, y: 20 },
                    ],
                    false,
                  ),
                },
              }
            : f,
        ),
      })),
    };
    const value: Seam = {
      ...seam,
      b: { holeSetId: 'holes', stretch: { kind: 'from', anchor: 1, toward: 'next' } },
    };
    expect(resolveSeam(open, value)).toMatchObject({
      ok: false,
      problem: { code: 'SEAM_RUNS_OFF_THE_LINE', facts: { lengthMm: 40, availableMm: 20 } },
    });
  });

  it('keeps failed sides as SEAM_SIDE_MISSING, then recovers after their source is repaired', () => {
    const p = project();
    const failed: Project = {
      ...p,
      parts: p.parts.map((part) => ({
        ...part,
        features: part.features.map((f): Feature =>
          f.kind === 'stitch-hole-set'
            ? { ...f, source: { kind: 'derived', sourceId: 'line', op: { ...holeOp, pitchMm: 0 } } }
            : f,
        ),
      })),
    };
    expect(resolveSeam(failed, seam)).toMatchObject({
      ok: false,
      problem: { code: 'SEAM_SIDE_MISSING' },
    });
    expect(resolveSeam(p, seam).ok).toBe(true);
  });

  it('reads a mirrored hole set with its original arc-length distances', () => {
    const p = project();
    const mirror: Feature = {
      id: 'mirror',
      name: 'Mirrored holes',
      kind: 'stitch-hole-set',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'holes',
        op: {
          type: 'mirror',
          axis: { kind: 'line', origin: { x: 0, y: 0 }, angleRad: Math.PI / 3 },
          glideMm: 10,
        },
      },
    };
    const mirrored: Project = {
      ...p,
      parts: p.parts.map((part) => ({ ...part, features: [...part.features, mirror] })),
    };
    const value: Seam = { ...seam, b: { ...seam.a, holeSetId: 'mirror' } };
    const result = resolveSeam(mirrored, value);
    if (!result.ok) throw new Error('a mirror of the same holes must resolve');
    expect(result.a.holes.map((hole) => hole.distanceMm)).toEqual(
      result.b.holes.map((hole) => hole.distanceMm),
    );
  });

  it('keeps two seam outcomes on the same hole set distinct and stable', () => {
    const p = project();
    const a = { ...seam, b: { ...seam.b, holeSetId: 'gone' } };
    const b = { ...a, id: 'other-seam' };
    const keys = (value: Project) =>
      diagnose(value)
        .filter((d) => d.problem.code === 'SEAM_SIDE_MISSING')
        .map((d) => problemKey(d.problem));
    const first = keys({ ...p, seams: [a, b] });
    expect(new Set(first).size).toBe(2);
    expect(keys({ ...p, name: 'Renamed', seams: [a, b] })).toEqual(first);
  });
});
