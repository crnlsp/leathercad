import { PathOps, uniformRadii, type Vec2 } from '@leathercad/geometry';

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
  const features = strapFeatures('1', { x: 0, y: 0 }, widthMm);

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
 * The audit's synthetic bag (docs/performance-backlog.md, *Workloads*):
 * `strap(200)` copied into `parts` independent parts, eight to a row, every id
 * its own — 118 holes a part. Many small parts, so what grows is per part.
 */
export function bag(parts: number): Project {
  return {
    id: 'bag',
    name: 'Bag',
    settings: DEFAULT_SETTINGS,
    parts: Array.from({ length: parts }, (_, i): Part => {
      const origin = { x: (i % 8) * 220, y: Math.floor(i / 8) * 60 };
      const features = strapFeatures(String(i), origin, 200);
      return { id: `part-${i}`, name: `Strap ${i}`, quantity: 1, features };
    }),
  };
}

/** A 40 mm wide strap's outline, its stitch line 3.5 mm in and the holes on it. */
function strapFeatures(suffix: string, origin: Vec2, widthMm: number): Feature[] {
  return [
    {
      id: `cut-${suffix}`,
      kind: 'cut-contour',
      role: 'outer',
      name: 'Outline',
      visible: true,
      locked: false,
      source: {
        kind: 'shape',
        shape: {
          type: 'rect',
          origin,
          width: widthMm,
          height: 40,
          radii: uniformRadii(0),
          rotation: 0,
        },
      },
    },
    {
      id: `stitch-${suffix}`,
      kind: 'stitch-line',
      name: 'Stitch line',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: `cut-${suffix}`,
        op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
      },
    },
    {
      id: `holes-${suffix}`,
      kind: 'stitch-hole-set',
      name: 'Stitch holes',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: `stitch-${suffix}`,
        op: {
          type: 'stitch-holes',
          pitchMm: 3.85,
          mode: 'fit-whole',
          corners: 'hole-at-corner',
        },
      },
    },
  ];
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

/**
 * A stitch line mirrored across x = 150, and each mirror mirrored back,
 * `depth` times, each following the one before it. A valid project, and far
 * deeper than any pattern: the audit's stress for walks along a chain of
 * sources (PERF-015).
 */
export function mirrorChain(depth: number): Project {
  // The strap's outline and stitch line; its holes are not needed here.
  const drawn = strapFeatures('1', { x: 0, y: 0 }, 100).slice(0, 2);
  const mirrors = Array.from({ length: depth }, (_, k): Feature => ({
    id: `mirror-${k + 1}`,
    kind: 'stitch-line',
    name: `Mirror ${k + 1}`,
    visible: true,
    locked: false,
    source: {
      kind: 'derived',
      sourceId: k > 0 ? `mirror-${k}` : 'stitch-1',
      op: {
        type: 'mirror',
        axis: { kind: 'line', origin: { x: 150, y: 0 }, angleRad: Math.PI / 2 },
        glideMm: 0,
      },
    },
  }));
  const part: Part = {
    id: 'part-1',
    name: 'Chain',
    quantity: 1,
    features: [...drawn, ...mirrors],
  };
  return { id: 'p', name: 'Chain', settings: DEFAULT_SETTINGS, parts: [part] };
}
