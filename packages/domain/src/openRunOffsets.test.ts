import { Shapes } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { diagnose } from './diagnose.js';
import { DEFAULT_SETTINGS, type Feature, type Project, type Run } from './feature.js';
import { endOffsetsClearOfTheEdge } from './openRunOffsets.js';

interface Pocket {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly rotation: number;
  readonly insetMm: number;
  readonly run: Run;
}

/** A rectangle, its stitch line inset along `run`, and holes along it from its very ends. */
function pocket(p: Pocket, offsets: object = {}): Project {
  const features: Feature[] = [
    {
      id: 'cut',
      kind: 'cut-contour',
      role: 'outer',
      name: 'Outline',
      visible: true,
      locked: false,
      source: {
        kind: 'shape',
        shape: {
          type: 'rect',
          origin: { x: 10, y: 10 },
          width: p.width,
          height: p.height,
          radii: Shapes.uniformRadii(p.radius),
          rotation: p.rotation,
        },
      },
    },
    {
      id: 'stitch',
      kind: 'stitch-line',
      name: 'Stitch line',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'cut',
        op: { type: 'offset', distanceMm: p.insetMm, side: 'inward', run: p.run },
      },
    },
    {
      id: 'holes',
      kind: 'stitch-hole-set',
      name: 'Stitch holes',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'stitch',
        op: {
          type: 'stitch-holes',
          pitchMm: 3.85,
          mode: 'fit-whole',
          corners: 'hole-at-corner',
          ...offsets,
        },
      },
    },
  ];
  return {
    id: 'p',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part', name: 'Pocket', quantity: 1, features }],
  };
}

const edgeCodes = (project: Project) =>
  diagnose(project)
    .map((d) => d.problem.code)
    .filter((code) => code === 'OUTSIDE_PART' || code === 'HOLE_TOO_CLOSE_TO_EDGE');

const openPocket = fc
  .record({
    width: fc.double({ min: 30, max: 300, noNaN: true }),
    height: fc.double({ min: 30, max: 300, noNaN: true }),
    roundness: fc.double({ min: 0, max: 0.4, noNaN: true }),
    quarters: fc.integer({ min: 0, max: 3 }),
    insetMm: fc.double({ min: 2, max: 8, noNaN: true }),
    side: fc.integer({ min: 0, max: 3 }),
  })
  .map(({ width, height, roundness, quarters, insetMm, side }): Pocket => ({
    width,
    height,
    radius: roundness * Math.min(width, height),
    rotation: (quarters * Math.PI) / 2,
    insetMm,
    run: { kind: 'between', fromAnchor: (side + 1) % 4, toAnchor: side },
  }));

describe('endOffsetsClearOfTheEdge (U2)', () => {
  it('leaves no end hole off the material or near an edge, for any pocket open on a side', () => {
    fc.assert(
      fc.property(openPocket, (p) => {
        const offsets = endOffsetsClearOfTheEdge(pocket(p), 'stitch');
        expect(edgeCodes(pocket(p, offsets))).toEqual([]);
      }),
    );
  });

  it('moves a square corner’s end hole in by the line’s inset', () => {
    const p = { width: 95, height: 70, radius: 0, rotation: 0, insetMm: 3.5 };
    const run: Run = { kind: 'between', fromAnchor: 2, toAnchor: 1 };
    expect(edgeCodes(pocket({ ...p, run }))).not.toEqual([]);
    const offsets = endOffsetsClearOfTheEdge(pocket({ ...p, run }), 'stitch');
    expect(offsets.startOffsetMm).toBeCloseTo(3.5, 9);
    expect(offsets.endOffsetMm).toBeCloseTo(3.5, 9);
  });

  it('asks nothing of an end a rounded corner already holds that far in', () => {
    const p = { width: 95, height: 70, radius: 8, rotation: 0, insetMm: 3.5 };
    const run: Run = { kind: 'between', fromAnchor: 2, toAnchor: 1 };
    expect(endOffsetsClearOfTheEdge(pocket({ ...p, run }), 'stitch')).toEqual({});
  });

  it('asks nothing of a line stitched all round', () => {
    const p = { width: 95, height: 70, radius: 0, rotation: 0, insetMm: 3.5 };
    expect(endOffsetsClearOfTheEdge(pocket({ ...p, run: { kind: 'whole' } }), 'stitch')).toEqual(
      {},
    );
  });

  it('asks nothing of a feature that is not there', () => {
    const p = { width: 95, height: 70, radius: 0, rotation: 0, insetMm: 3.5 };
    expect(endOffsetsClearOfTheEdge(pocket({ ...p, run: { kind: 'whole' } }), 'nothing')).toEqual(
      {},
    );
  });
});
