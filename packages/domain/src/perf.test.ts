import { uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { evaluate, resolvedFeatures } from './evaluate.js';
import { DEFAULT_SETTINGS, type Feature, type Part, type Project } from './feature.js';

/**
 * A long strap stitched both sides reaches a few thousand holes in real use,
 * and `product-spec.md` §7 budgets a chain regeneration at under 50 ms.
 *
 * Measured rather than assumed: the distribution computes each position as
 * `start + k x pitch` from the index, so it is linear, but the offset and the
 * corner split in front of it are not obviously so.
 */
function strap(widthMm: number): Project {
  const features: Feature[] = [
    {
      id: 'cut-1',
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
          width: widthMm,
          height: 40,
          radii: uniformRadii(0),
          rotation: 0,
        },
      },
    },
    {
      id: 'stitch-1',
      kind: 'stitch-line',
      name: 'Stitch line',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'cut-1',
        op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
      },
    },
    {
      id: 'holes-1',
      kind: 'stitch-hole-set',
      name: 'Stitch holes',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'stitch-1',
        op: {
          type: 'stitch-holes',
          pitchMm: 3.85,
          mode: 'fit-whole',
          corners: 'hole-at-corner',
        },
      },
    },
  ];

  const part: Part = { id: 'part-1', name: 'Strap', quantity: 1, features };
  return { id: 'p', name: 'Strap', settings: DEFAULT_SETTINGS, parts: [part] };
}

describe('regeneration budget', () => {
  it('rebuilds a chain of three thousand holes well inside 50 ms', () => {
    // ~11.6 m of stitch line at 3.85 mm — a long strap stitched both sides.
    const project = strap(5800);

    const started = performance.now();
    const resolved = [...resolvedFeatures(evaluate(project))];
    const elapsed = performance.now() - started;

    const holes = resolved.find((f) => f.feature.id === 'holes-1')?.holes;
    expect(holes).toBeDefined();
    expect(holes!.count).toBeGreaterThan(3000);
    expect(elapsed).toBeLessThan(50);
  });
});
