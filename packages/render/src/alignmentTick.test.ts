import {
  DEFAULT_SETTINGS,
  alignmentMarks,
  evaluate,
  type Project,
  type SeamMarks,
} from '@leathercad/domain';
import { PathOps, Vec2Ops, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { alignmentTick } from './alignmentTick.js';
import { buildDisplayList } from './buildDisplayList.js';
import { ALIGNMENT_MARK } from './theme/index.js';

/** A pouch folded and sewn to itself: one side of its stitching to the opposite one. */
function pouch(marks?: SeamMarks): Project {
  return {
    id: 'pouch',
    name: 'Pouch',
    settings: DEFAULT_SETTINGS,
    parts: [
      {
        id: 'part',
        name: 'Pouch',
        quantity: 1,
        features: [
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
                origin: { x: 0, y: 0 },
                width: 80,
                height: 160,
                radii: uniformRadii(4),
                rotation: 0,
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
              op: { type: 'offset', distanceMm: 3, side: 'inward', run: { kind: 'whole' } },
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
              },
            },
          },
        ],
      },
    ],
    seams: [
      {
        id: 'seam',
        a: { holeSetId: 'holes', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
        b: { holeSetId: 'holes', stretch: { kind: 'between', fromAnchor: 3, toAnchor: 2 } },
        ...(marks === undefined ? {} : { marks }),
      },
    ],
  };
}

const unit = fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }).map((a) => ({
  x: Math.cos(a),
  y: Math.sin(a),
}));
const point = fc.record({
  x: fc.double({ min: -1000, max: 1000, noNaN: true }),
  y: fc.double({ min: -1000, max: 1000, noNaN: true }),
});

describe('an alignment mark as drawn (9.13)', () => {
  it('is one straight tick along the inward normal, clear of the hole, its length the theme’s', () => {
    fc.assert(
      fc.property(point, unit, (at, inward) => {
        const tick = alignmentTick({
          seamId: 's',
          partId: 'p',
          holeSetId: 'h',
          pair: 1,
          point: at,
          inward,
        });
        const start = PathOps.start(tick);
        const end = PathOps.end(tick);
        if (start === null || end === null) throw new Error('a tick has two ends');
        expect(tick.closed).toBe(false);
        expect(tick.segments).toHaveLength(1);
        expect(Vec2Ops.dist(start, at)).toBeCloseTo(ALIGNMENT_MARK.gapMm, 9);
        expect(PathOps.length(tick)).toBeCloseTo(ALIGNMENT_MARK.lengthMm, 9);
        expect(Vec2Ops.dot(Vec2Ops.sub(end, start), inward)).toBeCloseTo(
          ALIGNMENT_MARK.lengthMm,
          9,
        );
      }),
    );
  });

  it('is drawn on the board in the marking role, one tick a mark', () => {
    const resolved = evaluate(pouch({ kind: 'ends' }));
    const ticks = buildDisplayList(resolved).items.filter(
      (item) => item.kind === 'path' && item.role === 'mark',
    );
    expect(ticks).toEqual(
      alignmentMarks(resolved).map((mark) =>
        expect.objectContaining({ kind: 'path', role: 'mark', path: alignmentTick(mark) }),
      ),
    );
    expect(ticks).toHaveLength(4);
  });

  it('is not drawn for a seam that asks for no marks', () => {
    const items = buildDisplayList(evaluate(pouch())).items;
    expect(items.some((item) => item.kind === 'path' && item.role === 'mark')).toBe(false);
  });
});
