import { DEFAULT_SETTINGS, evaluate, type Project } from '@leathercad/domain';
import { uniformRadii } from '@leathercad/geometry';
import { buildDisplayList, renderToSvgString } from '@leathercad/render';
import { test, type Bench } from 'vitest';

import { exportPdf } from './pdf/writer.js';
import { buildExportScene } from './scene.js';

/**
 * From a resolved project to what reaches the screen and the paper.
 *
 * The screen half runs on every frame that has an edit behind it; the paper
 * half on every export. Both are measured on a long stitched strap. Paginated
 * onto A4, it makes several pages, so the pagination is exercised too.
 */

/** One workload, three ways. See `measure` in packages/geometry/src/geometry.bench.ts. */
function measure(bench: Bench, slug: string, fn: () => unknown): Promise<unknown> {
  const mode = process.env['LEATHERCAD_BENCH'];
  const file = `./bench/${slug}.json`;
  return mode === 'compare'
    ? bench.compare(bench('now', fn), bench.from('baseline', file))
    : bench('now', mode === 'baseline' ? { writeResult: file } : {}, fn).run();
}

const FIXED_NOW = (): Date => new Date('2026-09-23T00:00:00.000Z');

const project: Project = {
  id: 'p',
  name: 'Strap',
  settings: DEFAULT_SETTINGS,
  parts: [
    {
      id: 'part-1',
      name: 'Strap',
      quantity: 1,
      features: [
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
              width: 1200,
              height: 40,
              radii: uniformRadii(6),
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
      ],
    },
  ],
};

const resolved = evaluate(project);
const scene = buildExportScene(resolved, project.name);

const view = { centreMm: { x: 600, y: 20 }, scale: 1, widthPx: 1400, heightPx: 400 };

test('build the display list', ({ bench }) =>
  measure(bench, 'display-list', () => buildDisplayList(resolved)));

test('render the display list as SVG', ({ bench }) =>
  measure(bench, 'svg', () => renderToSvgString(buildDisplayList(resolved), view)));

test('build the export scene', ({ bench }) =>
  measure(bench, 'export-scene', () => buildExportScene(resolved, project.name)));

test('write the PDF', ({ bench }) =>
  measure(bench, 'pdf', () => exportPdf(scene, { now: FIXED_NOW, applicationVersion: 'bench' })));
