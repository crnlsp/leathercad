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

/** One declared side seam per piece; used for 1.7's manufacturing work bound. */
export function seamedBag(parts = 40): Project {
  return {
    ...bag(parts),
    seams: Array.from({ length: parts }, (_, i) => ({
      id: `seam-${i}`,
      a: {
        holeSetId: `holes-${i}`,
        stretch: { kind: 'between' as const, fromAnchor: 0, toAnchor: 1 },
      },
      b: {
        holeSetId: `holes-${(i + 1) % parts}`,
        stretch: { kind: 'between' as const, fromAnchor: 0, toAnchor: 1 },
      },
    })),
  };
}

/**
 * A bifold sewn as one (PERF-018): the outer and its lining, 200 × 95 mm,
 * sewn along all four sides, and two card pockets each sewn to its backing
 * along the bottom: six pieces, six seams. Each seam joins two equal edges
 * stitched alike, so every one pairs its holes exactly and the project has
 * no seam problem — the cost measured is checking seams, not reporting them.
 */
export function seamedBifold(): Project {
  const pieces: [string, string, Vec2, number, number][] = [
    ['outer', 'Outer', { x: 0, y: 0 }, 200, 95],
    ['lining', 'Lining', { x: 0, y: 110 }, 200, 95],
    ['pocket-left', 'Left pocket', { x: 220, y: 0 }, 95, 60],
    ['backing-left', 'Left backing', { x: 220, y: 75 }, 95, 60],
    ['pocket-right', 'Right pocket', { x: 330, y: 0 }, 95, 60],
    ['backing-right', 'Right backing', { x: 330, y: 75 }, 95, 60],
  ];
  // A rectangle's corners are its anchors 0–3; side k runs from corner k to k + 1.
  const side = (piece: string, k: number) => ({
    holeSetId: `holes-${piece}`,
    stretch: { kind: 'between' as const, fromAnchor: k, toAnchor: (k + 1) % 4 },
  });
  return {
    id: 'bifold',
    name: 'Bifold',
    settings: DEFAULT_SETTINGS,
    parts: pieces.map(([id, name, origin, width, height]) => ({
      id,
      name,
      quantity: 1,
      features: strapFeatures(id, origin, width, height),
    })),
    seams: [
      ...[0, 1, 2, 3].map((k) => ({ id: `seam-${k}`, a: side('outer', k), b: side('lining', k) })),
      { id: 'seam-left', a: side('pocket-left', 3), b: side('backing-left', 3) },
      { id: 'seam-right', a: side('pocket-right', 3), b: side('backing-right', 3) },
    ],
  };
}

/**
 * An SVG pattern of `paths` paths (PERF-018), as a drawing program writes one
 * in millimetres: pieces of five paths each — a rounded outline in curves and
 * four slots — in rows of ten. `fixtures/perf/svg-300.svg` is `svgPattern(300)`,
 * written by `node tools/perf-compute.mjs --fixtures`.
 */
export function svgPattern(paths: number): string {
  const pieces = Array.from({ length: Math.ceil(paths / 5) }, (_, i) => {
    const x = (i % 10) * 70;
    const y = Math.floor(i / 10) * 50;
    const outline = `<path d="M${x + 5} ${y}H${x + 55}C${x + 58} ${y} ${x + 60} ${y + 2} ${x + 60} ${y + 5}V${y + 35}C${x + 60} ${y + 38} ${x + 58} ${y + 40} ${x + 55} ${y + 40}H${x + 5}C${x + 2} ${y + 40} ${x} ${y + 38} ${x} ${y + 35}V${y + 5}C${x} ${y + 2} ${x + 2} ${y} ${x + 5} ${y}Z"/>`;
    const slots = [0, 1, 2, 3].map(
      (k) => `<rect x="${x + 8 + k * 12}" y="${y + 15}" width="8" height="10" rx="2"/>`,
    );
    return [outline, ...slots];
  });
  const body = pieces
    .flat()
    .slice(0, paths)
    .map((p) => `  ${p}\n`)
    .join('');
  const height = Math.ceil(paths / 50) * 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="700mm" height="${height}mm" viewBox="0 0 700 ${height}" fill="none" stroke="black">\n${body}</svg>\n`;
}

/** A strap's outline, 40 mm high unless said, its stitch line 3.5 mm in and the holes on it. */
function strapFeatures(suffix: string, origin: Vec2, widthMm: number, heightMm = 40): Feature[] {
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
          height: heightMm,
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
