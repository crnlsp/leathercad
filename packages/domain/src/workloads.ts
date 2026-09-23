import { PathOps, uniformRadii } from '@leathercad/geometry';

import { DEFAULT_SETTINGS, type Feature, type Part, type Project } from './feature.js';

/**
 * Projects sized like real heavy work, shared by `perf.test.ts`, which holds
 * loose ceilings, and `domain.bench.ts`, which records the trend. Test support
 * only: nothing in the package index exports it.
 */

/**
 * A long strap stitched both sides reaches a few thousand holes in real use,
 * and `product-spec.md` §7 budgets a chain regeneration at under 50 ms.
 *
 * Measured rather than assumed: the distribution computes each position as
 * `start + k x pitch` from the index, so it is linear, but the offset and the
 * corner split in front of it are not obviously so.
 */
export function strap(widthMm: number, cutOuts = 0): Project {
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

  // Keeper slots down the strap. Each one is another edge every hole has to
  // be measured against, which is the part of validation that grows.
  for (let i = 0; i < cutOuts; i++) {
    features.push({
      id: `slot-${i}`,
      kind: 'cut-contour',
      role: 'inner',
      name: `Slot ${i}`,
      visible: true,
      locked: false,
      source: {
        kind: 'shape',
        shape: { type: 'circle', centre: { x: 100 + i * 60, y: 20 }, radius: 5 },
      },
    });
  }

  const part: Part = { id: 'part-1', name: 'Strap', quantity: 1, features };
  return { id: 'p', name: 'Strap', settings: DEFAULT_SETTINGS, parts: [part] };
}

/**
 * A pattern traced by hand rather than built from shapes.
 *
 * The heavy case on purpose: every hole is measured against every segment of
 * the outline, so a 500-point trace is where the cost actually shows. Nobody
 * has said this shape has to be fast — the point is to know what it costs.
 */
export function tracedOutline(points: number): Project {
  const outline = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    return { x: 300 + 290 * Math.cos(angle), y: 300 + 290 * Math.sin(angle) };
  });

  const features: Feature[] = [
    {
      id: 'cut-1',
      kind: 'cut-contour',
      role: 'outer',
      name: 'Outline',
      visible: true,
      locked: false,
      source: { kind: 'path', path: PathOps.polyline(outline, true) },
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
        op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
      },
    },
  ];

  const part: Part = { id: 'part-1', name: 'Traced', quantity: 1, features };
  return { id: 'p', name: 'Traced', settings: DEFAULT_SETTINGS, parts: [part] };
}
