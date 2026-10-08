import type { Feature, ResolvedFeature, ResolvedPart } from '@leathercad/domain';
import { Shapes } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { stitchingOf } from './captions.js';

/** A resolved hole set: `count` holes from an iron of `pitchMm`, named `label`. */
function holeSet(
  count: number,
  pitchMm: number,
  label?: string,
  extra: { visible?: boolean; ok?: boolean } = {},
): ResolvedFeature {
  const feature = {
    id: `holes-${String(count)}-${String(pitchMm)}`,
    kind: 'stitch-hole-set',
    name: 'Stitch holes',
    visible: extra.visible ?? true,
    locked: false,
    source: {
      kind: 'derived',
      sourceId: 'stitch',
      op: {
        type: 'stitch-holes',
        pitchMm,
        mode: 'fit-whole',
        corners: 'hole-at-corner',
        ...(label === undefined ? {} : { ironLabel: label }),
      },
    },
  } as Feature;
  if (extra.ok === false) {
    return {
      ok: false,
      feature,
      problem: { code: 'OFFSET_COLLAPSED', facts: { featureId: feature.id } },
    } as unknown as ResolvedFeature;
  }
  return {
    ok: true,
    feature,
    role: 'stitch-holes',
    path: Shapes.rect({ x: 0, y: 0 }, 10, 10),
    anchors: [],
    holes: { holes: [], count, achievedPitchMm: pitchMm, runs: [] },
  };
}

const partOf = (...features: ResolvedFeature[]): ResolvedPart => ({
  part: { id: 'p', name: 'Panel', quantity: 1, features: features.map((f) => f.feature) },
  features,
});

describe('stitchingOf — what a piece’s caption counts (R-01)', () => {
  it('counts the holes at the iron’s pitch', () => {
    expect(stitchingOf(partOf(holeSet(52, 3.85, 'KS Blade 3.85 mm')))).toEqual([
      { holes: 52, pitchMm: 3.85 },
    ]);
  });

  it('adds up the sets at one pitch, whatever iron made them, and lists each pitch once', () => {
    // The caption names the pitch, not the iron (R-01): two irons of one
    // pitch punch the same holes.
    expect(
      stitchingOf(
        partOf(holeSet(60, 3.85, 'KS Blade 3.85 mm'), holeSet(28, 3.85, 'Wuta'), holeSet(24, 3)),
      ),
    ).toEqual([
      { holes: 88, pitchMm: 3.85 },
      { holes: 24, pitchMm: 3 },
    ]);
  });

  it('counts only the holes that are drawn', () => {
    expect(
      stitchingOf(
        partOf(
          holeSet(88, 3.85),
          holeSet(30, 3.85, undefined, { visible: false }),
          holeSet(9, 3.85, undefined, { ok: false }),
        ),
      ),
    ).toEqual([{ holes: 88, pitchMm: 3.85 }]);
  });

  it('has nothing to count on a part without stitching', () => {
    expect(stitchingOf(partOf())).toEqual([]);
  });

  it('counts every drawn hole once, under a pitch it lists once', () => {
    const sets = fc.array(
      fc.record({
        count: fc.integer({ min: 0, max: 500 }),
        pitch: fc.constantFrom(2.7, 3, 3.38, 3.85, 4),
        visible: fc.boolean(),
        ok: fc.boolean(),
      }),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(sets, (generated) => {
        const counted = stitchingOf(
          partOf(
            ...generated.map(({ count, pitch, visible, ok }) =>
              holeSet(count, pitch, undefined, { visible, ok }),
            ),
          ),
        );
        const drawn = generated.filter(({ visible, ok }) => visible && ok);
        expect(counted.reduce((sum, { holes }) => sum + holes, 0)).toBe(
          drawn.reduce((sum, { count }) => sum + count, 0),
        );
        expect(new Set(counted.map(({ pitchMm }) => pitchMm)).size).toBe(counted.length);
        expect(counted.map(({ pitchMm }) => pitchMm)).toEqual([
          ...new Set(drawn.map(({ pitch }) => pitch)),
        ]);
      }),
    );
  });
});
