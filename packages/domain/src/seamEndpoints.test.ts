import { EPS_LENGTH } from '@leathercad/core';
import { MatOps, PathOps, type Path } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  type Derivation,
  type Feature,
  type Project,
  type Seam,
} from './feature.js';
import { evaluate } from './evaluate.js';
import { resolveSeam, seamRefusal } from './seams.js';

const straight = (length: number): Path =>
  PathOps.polyline(
    [
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ],
    false,
  );
const seam: Seam = {
  id: 'endpoint-seam',
  a: { holeSetId: 'holes', stretch: { kind: 'between', fromAnchor: 'start', toAnchor: 'end' } },
  b: { holeSetId: 'holes', stretch: { kind: 'from', anchor: 'end', toward: 'previous' } },
};
function project(
  path: Path,
  op: Partial<Extract<Derivation, { type: 'stitch-holes' }>> = {},
): Project {
  const features: Feature[] = [
    {
      id: 'line',
      name: 'Line',
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
      source: {
        kind: 'derived',
        sourceId: 'line',
        op: { type: 'stitch-holes', pitchMm: 4, mode: 'fit-whole', corners: 'continuous', ...op },
      },
    },
  ];
  return {
    id: 'project',
    name: 'Endpoint seam',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part', name: 'Panel', quantity: 1, features }],
  };
}

describe('open-line seam endpoints (D17, 9.6a)', () => {
  it('walks a straight line in either direction without inventing corner anchors', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 2000, noNaN: true }),
        fc.boolean(),
        (length, reversed) => {
          const p = project(straight(length));
          const value: Seam = reversed
            ? seam
            : {
                ...seam,
                b: { ...seam.b, stretch: { kind: 'from', anchor: 'start', toward: 'next' } },
              };
          const result = resolveSeam(p, value);
          if (!result.ok) throw new Error('open endpoints must resolve');
          expect(Math.abs(result.a.lengthMm - length)).toBeLessThanOrEqual(EPS_LENGTH);
          expect(result.a.holes.length).toBe(result.b.holes.length);
          result.a.holes.forEach((hole, i) =>
            expect(
              Math.abs(hole.distanceMm - (result.b.holes[i]?.distanceMm ?? Infinity)),
            ).toBeLessThanOrEqual(EPS_LENGTH),
          );
          const holes = evaluate(p).parts[0]?.features[1];
          expect(holes?.ok && holes.anchors).toEqual([]);
        },
      ),
    );
  });

  it('names geometric endpoints even when the first and last holes are inset', () => {
    const result = resolveSeam(
      project(straight(40), { mode: 'exact-pitch', startOffsetMm: 3, endOffsetMm: 4 }),
      seam,
    );
    if (!result.ok) throw new Error('endpoint offsets must resolve');
    expect(result.a.lengthMm).toBeCloseTo(40, 9);
    expect(result.a.holes[0]?.hole.point.x).toBeCloseTo(3, 9);
    expect(result.a.holes.at(-1)?.hole.point.x).toBeCloseTo(35, 9);
    expect(result.a.holes.at(-1)?.distanceMm).toBeCloseTo(32, 9);
    expect(result.b.holes[0]?.hole.point.x).toBeCloseTo(35, 9);
  });

  it('keeps numeric corners at their existing indices beside explicit endpoints', () => {
    const p = project(
      PathOps.polyline(
        [
          { x: 0, y: 20 },
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 20 },
        ],
        false,
      ),
      { corners: 'hole-at-corner' },
    );
    const value: Seam = {
      ...seam,
      a: { ...seam.a, stretch: { kind: 'between', fromAnchor: 0, toAnchor: 'start' } },
      b: { ...seam.b, stretch: { kind: 'from', anchor: 1, toward: 'next' } },
    };
    const result = resolveSeam(p, value);
    if (!result.ok) throw new Error('corners and endpoints must coexist');
    expect(result.a.lengthMm).toBeCloseTo(20, 9);
    expect(result.a.holes[0]?.hole.point).toEqual({ x: 0, y: 0 });
    const holes = evaluate(p).parts[0]?.features[1];
    expect(holes?.ok && holes.anchors).toEqual([20, 60]);
  });

  it('preserves endpoint walks through moving, turning and a linked mirror', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (length, angle) => {
          const path = PathOps.transform(
            straight(length),
            MatOps.composeAll(
              MatOps.fromRotation(angle),
              MatOps.fromTranslation({ x: 100, y: -200 }),
            ),
          );
          const p = project(path);
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
                axis: { kind: 'line', origin: { x: 10, y: 20 }, angleRad: angle / 2 },
                glideMm: 10,
              },
            },
          };
          const mirrored: Project = {
            ...p,
            parts: p.parts.map((part) => ({ ...part, features: [...part.features, mirror] })),
          };
          const result = resolveSeam(mirrored, { ...seam, b: { ...seam.a, holeSetId: 'mirror' } });
          if (!result.ok) throw new Error('an isometry must preserve endpoint seams');
          expect(Math.abs(result.a.lengthMm - result.b.lengthMm)).toBeLessThanOrEqual(EPS_LENGTH);
          expect(result.a.holes.map((hole) => hole.distanceMm)).toEqual(
            result.b.holes.map((hole) => hole.distanceMm),
          );
        },
      ),
    );
  });

  it('walks an open arc by arc length even though it has no corners', () => {
    const result = resolveSeam(
      project(
        PathOps.open([
          { kind: 'arc', centre: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweepAngle: Math.PI },
        ]),
      ),
      seam,
    );
    if (!result.ok) throw new Error('open arc endpoints must resolve');
    expect(Math.abs(result.a.lengthMm - Math.PI * 10)).toBeLessThanOrEqual(EPS_LENGTH);
  });

  it.each([PathOps.open([]), straight(0)])(
    'handles an empty or zero-length open line without NaNs',
    (path) => {
      const result = resolveSeam(project(path), seam);
      expect(result).toEqual({
        ok: true,
        a: { lengthMm: 0, holes: [] },
        b: { lengthMm: 0, holes: [] },
      });
    },
  );

  it.each(['start', 'end'] as const)('refuses the %s endpoint on a closed line', (anchor) => {
    const p = project(
      PathOps.polyline(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 20 },
        ],
        true,
      ),
    );
    const value: Seam = {
      ...seam,
      a: { ...seam.a, stretch: { kind: 'between', fromAnchor: anchor, toAnchor: 0 } },
    };
    expect(seamRefusal(p, value)).toMatchObject({
      code: 'ANCHOR_MISSING',
      facts: { seamId: seam.id, anchor },
    });
  });
});
