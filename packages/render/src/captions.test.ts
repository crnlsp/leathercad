import type { Feature, ResolvedFeature, ResolvedPart } from '@leathercad/domain';
import { Shapes } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { describeStitching } from './captions.js';

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

describe('describeStitching — the iron on the pattern (UI Foundations §13)', () => {
  it('says the count, the pitch and the iron, the way a maker writes it on card', () => {
    expect(describeStitching(partOf(holeSet(88, 3.85, 'KS Blade 3.85 mm')))).toBe(
      '88 holes · 3.85 mm · KS Blade',
    );
  });

  it('keeps an iron’s own name when it does not repeat the pitch', () => {
    expect(describeStitching(partOf(holeSet(40, 3.85, 'Wuta')))).toBe('40 holes · 3.85 mm · Wuta');
    // A different number is part of the name, not a repeat of the pitch.
    expect(describeStitching(partOf(holeSet(40, 3.85, 'KS Blade 3.38 mm')))).toBe(
      '40 holes · 3.85 mm · KS Blade 3.38 mm',
    );
  });

  it('reads a decimal comma in a label as the same pitch', () => {
    expect(describeStitching(partOf(holeSet(12, 3.85, 'Żelazko 3,85 mm')))).toBe(
      '12 holes · 3.85 mm · Żelazko',
    );
  });

  it('names the pitch alone when the iron has no name', () => {
    expect(describeStitching(partOf(holeSet(24, 3)))).toBe('24 holes · 3.00 mm');
  });

  it('counts one hole as one hole', () => {
    expect(describeStitching(partOf(holeSet(1, 3.85)))).toBe('1 hole · 3.85 mm');
  });

  it('adds up the sets one iron makes, and lists each iron once', () => {
    expect(
      describeStitching(
        partOf(
          holeSet(60, 3.85, 'KS Blade 3.85 mm'),
          holeSet(28, 3.85, 'KS Blade 3.85 mm'),
          holeSet(24, 3),
        ),
      ),
    ).toBe('88 holes · 3.85 mm · KS Blade, 24 holes · 3.00 mm');
  });

  it('counts only the holes that are drawn', () => {
    expect(
      describeStitching(
        partOf(
          holeSet(88, 3.85),
          holeSet(30, 3.85, undefined, { visible: false }),
          holeSet(9, 3.85, undefined, { ok: false }),
        ),
      ),
    ).toBe('88 holes · 3.85 mm');
  });

  it('has nothing to say about a part without stitching', () => {
    expect(describeStitching(partOf())).toBeNull();
  });
});
