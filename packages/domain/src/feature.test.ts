import { approxEq, EPS_LENGTH } from '@leathercad/core';
import { PathOps, Shapes, vec } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Feature, FeatureKind } from './feature.js';
import { roleOf } from './feature.js';
import { isCutting, LAYER_ROLE_LABELS } from './layerRole.js';

const base = {
  id: 'f1' as Feature['id'],
  name: 'thing',
  visible: true,
  locked: false,
  source: { kind: 'path' as const, path: Shapes.rect(vec(0, 0), 10, 10) },
};

/** One of every feature kind, so the mapping below is checked against all of them. */
const ONE_OF_EACH: readonly Feature[] = [
  { ...base, kind: 'cut-contour', role: 'outer' },
  { ...base, kind: 'stitch-line' },
  { ...base, kind: 'stitch-hole-set' },
  { ...base, kind: 'fold-line', direction: 'valley' },
  { ...base, kind: 'marking-line', purpose: 'glue-area' },
  { ...base, kind: 'hardware-hole', hardwareType: 'rivet' },
];

describe('roleOf', () => {
  it('gives every feature kind a role', () => {
    // `Feature['kind']` is the authority: if a kind is added and not listed
    // here, this fails rather than the omission being noticed in review.
    const covered = new Set<FeatureKind>(ONE_OF_EACH.map((f) => f.kind));
    const known: readonly FeatureKind[] = [
      'cut-contour',
      'stitch-line',
      'stitch-hole-set',
      'fold-line',
      'marking-line',
      'hardware-hole',
    ];

    expect([...covered].sort()).toEqual([...known].sort());
    for (const feature of ONE_OF_EACH) {
      expect(LAYER_ROLE_LABELS[roleOf(feature)]).toBeTruthy();
    }
  });

  it('files a hardware hole where a cutting export will find it', () => {
    const hole = ONE_OF_EACH.find((f) => f.kind === 'hardware-hole')!;

    // A punched hole is material removed from the hide, so a laser file has to
    // carry it. Getting this wrong means a pattern that cuts but has no holes.
    expect(roleOf(hole)).toBe('hardware');
    expect(isCutting(roleOf(hole))).toBe(true);
  });

  it('keeps a fold line and a marking line out of a cutting export', () => {
    const fold = ONE_OF_EACH.find((f) => f.kind === 'fold-line')!;
    const mark = ONE_OF_EACH.find((f) => f.kind === 'marking-line')!;

    // Cutting along a fold line destroys the piece.
    expect(isCutting(roleOf(fold))).toBe(false);
    expect(isCutting(roleOf(mark))).toBe(false);
  });
});

describe('a hardware hole as a circle', () => {
  it('measures the diameter it was asked for, anywhere and at any size', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: 0.5, max: 50, noNaN: true }),
        (x, y, diameterMm) => {
          const path = Shapes.circle(vec(x, y), diameterMm / 2);
          const box = PathOps.bbox(path)!;

          // A 4 mm punch makes a 4 mm hole. The whole product promise, applied
          // to the one feature whose size is a tool the user owns.
          return (
            approxEq(box.maxX - box.minX, diameterMm, EPS_LENGTH) &&
            approxEq(box.maxY - box.minY, diameterMm, EPS_LENGTH)
          );
        },
      ),
    );
  });
});
