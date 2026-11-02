import {
  DEFAULT_SETTINGS,
  evaluate,
  type Feature,
  type Part,
  type Project,
} from '@leathercad/domain';
import { PathOps, uniformRadii } from '@leathercad/geometry';
import { test, type Bench } from 'vitest';

import { buildSnapIndex } from './snap.js';

/**
 * What one pointer move of a drag pays for snapping (PERF-004). A preview makes
 * a new project, so the tool evaluates it and indexes its snap targets again
 * before the next move can snap: `snapIndex` in `tool.ts`. Each iteration here
 * is one such move — a vertex nudged, or a small piece carried — evaluation
 * included, because a move pays for both.
 *
 * Two guides cross every outline, as the guides added in 3.10 do in real use.
 */

/** One workload, three ways. See `measure` in packages/geometry/src/geometry.bench.ts. */
function measure(bench: Bench, slug: string, fn: () => unknown): Promise<unknown> {
  const mode = process.env['LEATHERCAD_BENCH'];
  const file = `./bench/${slug}.json`;
  return mode === 'compare'
    ? bench.compare(bench('now', fn), bench.from('baseline', file))
    : bench('now', mode === 'baseline' ? { writeResult: file } : {}, fn).run();
}

/**
 * `tracedOutline(points)` from `packages/domain/src/workloads.ts` — an outline,
 * its stitch line and holes — which a package cannot import, with its first
 * vertex moved `nudgeMm` outward as a point drag would.
 */
function tracedPart(id: string, points: number, nudgeMm: number): Part {
  const outline = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    const r = 290 + (i === 0 ? nudgeMm : 0);
    return { x: 300 + r * Math.cos(angle), y: 300 + r * Math.sin(angle) };
  });
  const features: Feature[] = [
    {
      id: `${id}-cut`,
      kind: 'cut-contour',
      role: 'outer',
      name: 'Outline',
      visible: true,
      locked: false,
      source: { kind: 'path', path: PathOps.polyline(outline, true) },
    },
    {
      id: `${id}-stitch`,
      kind: 'stitch-line',
      name: 'Stitch line',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: `${id}-cut`,
        op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
      },
    },
    {
      id: `${id}-holes`,
      kind: 'stitch-hole-set',
      name: 'Stitch holes',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: `${id}-stitch`,
        op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
      },
    },
  ];
  return { id, name: 'Traced', quantity: 1, features };
}

/** A 60 × 40 mm tab at `x`, its outline only. */
function tabPart(x: number): Part {
  return {
    id: 'tab',
    name: 'Tab',
    quantity: 1,
    features: [
      {
        id: 'tab-cut',
        kind: 'cut-contour',
        role: 'outer',
        name: 'Outline',
        visible: true,
        locked: false,
        source: {
          kind: 'shape',
          shape: {
            type: 'rect',
            origin: { x, y: 280 },
            width: 60,
            height: 40,
            radii: uniformRadii(4),
            rotation: 0,
          },
        },
      },
    ],
  };
}

const project = (parts: Part[]): Project => ({
  id: 'p',
  name: 'Traced',
  settings: DEFAULT_SETTINGS,
  parts,
  guides: [
    { id: 'guide-v', origin: { x: 150, y: 0 }, angleRad: Math.PI / 2 },
    { id: 'guide-d', origin: { x: 0, y: 0 }, angleRad: Math.PI / 4 },
  ],
});

/** A different nudge each move, as a drag makes: never the same project twice. */
function dragStep(next: (step: number) => Project): () => unknown {
  let step = 0;
  return () => buildSnapIndex(evaluate(next((step = (step + 1) % 1000))));
}

for (const points of [250, 500, 1000]) {
  test(`drag a vertex of a ${points}-point traced outline: evaluate and index snaps`, ({ bench }) =>
    measure(
      bench,
      `snap-drag-traced-${points}`,
      dragStep((step) => project([tracedPart('traced', points, step / 100)])),
    ));
}

// The traced part is the same object every move, so evaluation reuses it and
// only the tab's snap targets are new.
const still = tracedPart('traced', 1000, 0);
test('carry a tab across a 1000-point traced outline: evaluate and index snaps', ({ bench }) =>
  measure(
    bench,
    'snap-drag-beside-traced',
    dragStep((step) => project([still, tabPart(step / 10)])),
  ));
