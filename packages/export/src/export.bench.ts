import { DEFAULT_SETTINGS, evaluate, type Project, type ResolvedProject } from '@leathercad/domain';
import { uniformRadii } from '@leathercad/geometry';
import { buildDisplayList, type Caption } from '@leathercad/render';
import { test, type Bench } from 'vitest';

import {
  DEFAULT_PAGE_SETUP,
  buildExportScene,
  exportDxf,
  exportPdf,
  exportSvg,
  planSheets,
} from './index.js';

/**
 * From a resolved project to what reaches the screen and the files.
 *
 * The screen half runs on every frame that has an edit behind it; the file
 * half on every export. Both are measured on a long stitched strap. Paginated
 * onto A4, it makes several pages, so the pagination is exercised too.
 *
 * The files are the writers that ship, reached through this package's index
 * as the app reaches them. The SVG case once timed the render package's SVG
 * backend, which draws a screen's view and writes no file (Q40).
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

/**
 * The board captions every piece on every frame. The words are the app's
 * (ADR 0018), so these stand in for them; the drawing of them is what counts.
 * Without it the screen half would measure a frame the app never draws (U.2).
 */
const caption = (): Caption => ({ name: 'Strap', detail: '636 holes · 3.85 mm' });

test('build the display list', ({ bench }) =>
  measure(bench, 'display-list', () => buildDisplayList(resolved, { caption })));

/**
 * The same evaluation, as a part edited since: its features a new array. The
 * scene reuses a part's ink while its features are the same array (PERF-001),
 * so without this every round after the first would time a lookup, not the
 * build the baseline recorded.
 */
const edited = (): ResolvedProject => ({
  ...resolved,
  parts: resolved.parts.map((entry) => ({
    ...entry,
    part: { ...entry.part, features: [...entry.part.features] },
  })),
});

test('build the export scene', ({ bench }) =>
  measure(bench, 'export-scene', () => buildExportScene(edited(), project.name)));

test('write the PDF', ({ bench }) =>
  measure(bench, 'pdf', () =>
    exportPdf(planSheets(scene, DEFAULT_PAGE_SETUP), {
      now: FIXED_NOW,
      applicationVersion: 'bench',
    }),
  ));

test('write the SVG', ({ bench }) => measure(bench, 'svg', () => exportSvg(scene)));

test('write the DXF', ({ bench }) => measure(bench, 'dxf', () => exportDxf(scene)));
