import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, type ElectronApplication, type Page } from '@playwright/test';

import {
  INK,
  PX_PER_MM,
  gaugeOn,
  horizontalStrokes,
  pageCount,
  render,
  verticalStrokes,
  type Gray,
} from './printTest.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * R11's second print test, measured on the page the way `printTest.ts` measures
 * the first: `fixtures/projects/paper-check-assembly.lcp` exported through the
 * app, rasterised by poppler, and every number read off ink.
 *
 * On A4 portrait it is six sheets: the hole row, the assembly map, and a 300 ×
 * 300 mm panel taped 2 × 2 — sheet 3 top left, 4 top right, 5 bottom left, 6
 * bottom right.
 */

export const PRINT_TEST_ASSEMBLY = resolve(
  import.meta.dirname,
  '../fixtures/projects/paper-check-assembly.lcp',
);

export interface AssemblyMeasurements {
  readonly pages: number;
  readonly gauges: ReadonlyArray<{ readonly widthMm: number; readonly heightMm: number }>;
  readonly holeRow: {
    /** Each hole's circle, centre-line to centre-line. */
    readonly diametersMm: readonly number[];
    /** Centre of the first hole to centre of the last. */
    readonly firstToLastMm: number;
    readonly gapsMm: readonly number[];
  };
  readonly map: {
    /** The longest straight stroke on the map: the panel's outline, drawn smaller. */
    readonly longestStrokeMm: number;
  };
  readonly panel: {
    /** Left edge to right edge, each measured from the join line, summed across sheets 3 and 4. */
    readonly widthMm: number;
    /** Top edge to bottom edge, the same, down sheets 3 and 5. */
    readonly heightMm: number;
  };
}

export function measurePrintTestAssembly(pdf: string): AssemblyMeasurements {
  const pages = pageCount(pdf);
  const images = Array.from({ length: pages }, (_, i) => render(pdf, i + 1));
  const [rowSheet, map, topLeft, topRight, bottomLeft] = images as [
    Gray,
    Gray,
    Gray,
    Gray,
    Gray,
    Gray,
  ];

  const tl = tile(topLeft);
  const tr = tile(topRight);
  const bl = tile(bottomLeft);
  const mapLong = horizontalStrokes(map, 20).filter((s) => s.at < map.height / PX_PER_MM - 25);

  return {
    pages,
    gauges: images.map(gaugeOn),
    holeRow: holeRow(rowSheet),
    map: { longestStrokeMm: Math.max(...mapLong.map((s) => s.length)) },
    panel: {
      // Cut on the join, laid over the next sheet's: the edge to the join, plus
      // the join to the far edge.
      widthMm: tl.joinX - tl.leftEdge + (tr.rightEdge - tr.joinX),
      heightMm: tl.joinY - tl.topEdge + (bl.bottomEdge - bl.joinY),
    },
  };
}

/**
 * A tile's panel edges and its two join lines. The horizontal join is the row
 * its 6 mm dashes (and the crosses on them) share; the vertical join is where
 * the one cross off that row sits.
 */
function tile(image: Gray) {
  const inPattern = (at: number) => at < image.height / PX_PER_MM - 25;
  const arms = horizontalStrokes(image, 4)
    .filter((s) => s.to - s.from > 5 && s.to - s.from < 7 && s.at < image.height / PX_PER_MM - 15)
    .map((s) => ({ x: (s.from + s.to) / 2, y: s.at }));
  const joinY = arms.find((a) => arms.filter((b) => Math.abs(b.y - a.y) < 0.3).length > 2)!.y;
  const cross = arms.filter((a) => Math.abs(a.y - joinY) > 0.3);
  expect(cross, 'the cross on the vertical join').toHaveLength(1);

  const across = horizontalStrokes(image, 110).filter((s) => inPattern(s.at));
  const down = verticalStrokes(image, 100);
  return {
    joinX: cross[0]!.x,
    joinY,
    topEdge: Math.min(...across.map((s) => s.at)),
    bottomEdge: Math.max(...across.map((s) => s.at)),
    leftEdge: Math.min(...down.map((s) => s.at)),
    rightEdge: Math.max(...down.map((s) => s.at)),
  };
}

/**
 * The hole row on sheet 1: the outline's top and bottom edges bound the strip,
 * and in each column between them the first and the last run of ink are a
 * circle's top and bottom. At a circle's centre column they are a diameter
 * apart; the dashed marking line through the centres sits between them.
 */
function holeRow(image: Gray): AssemblyMeasurements['holeRow'] {
  const edges = horizontalStrokes(image, 110)
    .filter((s) => s.at < image.height / PX_PER_MM - 25)
    .sort((a, b) => a.at - b.at);
  const [top, bottom] = [edges[0]!, edges.at(-1)!];
  // Only the band the circles are in: the labels above and below them are text, not holes.
  const middle = (top.at + bottom.at) / 2;
  const [y0, y1] = [Math.ceil((middle - 2.6) * PX_PER_MM), Math.floor((middle + 2.6) * PX_PER_MM)];

  const spans: number[] = [];
  for (let x = 0; x < image.width; x++) {
    const runs: number[] = [];
    let start = -1;
    for (let y = y0; y <= y1 + 1; y++) {
      const ink = y <= y1 && image.pixels[y * image.width + x]! < INK;
      if (ink && start < 0) start = y;
      if (!ink && start >= 0) {
        runs.push((start + y) / 2);
        start = -1;
      }
    }
    spans.push(runs.length >= 2 ? (runs.at(-1)! - runs[0]!) / PX_PER_MM : 0);
  }

  // One cluster of columns wider than 3 mm per circle; its widest column is the centre.
  const circles: Array<{ x: number; diameter: number }> = [];
  let from = -1;
  for (let x = 0; x <= spans.length; x++) {
    const tall = x < spans.length && spans[x]! > 3;
    if (tall && from < 0) from = x;
    if (!tall && from >= 0) {
      const columns = spans.slice(from, x);
      const diameter = Math.max(...columns);
      const best = columns.map((d, i) => (d >= diameter - 0.05 ? i : -1)).filter((i) => i >= 0);
      const centre = from + (best[0]! + best.at(-1)!) / 2 + 0.5;
      circles.push({ x: centre / PX_PER_MM, diameter });
      from = -1;
    }
  }

  const gaps = circles.slice(1).map((c, i) => c.x - circles[i]!.x);
  return {
    diametersMm: circles.map((c) => c.diameter),
    firstToLastMm: circles.at(-1)!.x - circles[0]!.x,
    gapsMm: gaps,
  };
}

/** Opens the fixture as a maker does and exports it, to `pdf`; the viewer is not launched. */
export async function exportPrintTestAssembly(
  app: ElectronApplication,
  window: Page,
  pdf: string,
): Promise<void> {
  await app.evaluate(
    ({ dialog, shell }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.project] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.pdf });
      shell.openPath = async () => '';
    },
    { project: PRINT_TEST_ASSEMBLY, pdf },
  );
  await fromProjectMenu(window, 'open');
  await expect(window.getByTestId('part-count')).toHaveText('2');
  await window.getByTestId('export-pdf').click();
  await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
  await expect(window.getByTestId('file-error')).toHaveCount(0);
}

/** Checks I and J to the tolerances of `expectAccurate`, and K's drawing: the map is smaller. */
export function expectAssemblyAccurate(measured: AssemblyMeasurements): void {
  const close = (actual: number, expected: number, tolerance: number, what: string) =>
    expect(Math.abs(actual - expected), `${what}: ${actual.toFixed(3)} mm`).toBeLessThan(tolerance);

  expect(measured.pages, 'sheets: the row, the map, four tiles').toBe(6);
  measured.gauges.forEach((gauge, i) => {
    close(gauge.widthMm, 100, 0.2, `gauge width, sheet ${String(i + 1)}`);
    close(gauge.heightMm, 5, 0.2, `gauge height, sheet ${String(i + 1)}`);
  });

  // I: five 4 mm holes, 25 mm apart, 100 mm first to last.
  const { holeRow, map, panel } = measured;
  expect(holeRow.diametersMm, 'holes in the row').toHaveLength(5);
  holeRow.diametersMm.forEach((d, i) => close(d, 4, 0.2, `hole ${String(i + 1)} diameter`));
  holeRow.gapsMm.forEach((gap, i) => close(gap, 25, 0.2, `gap ${String(i + 1)}`));
  close(holeRow.firstToLastMm, 100, 0.2, 'row, first to last');

  // J: the 300 x 300 panel, assembled on its joins.
  close(panel.widthMm, 300, 0.3, 'panel width, assembled');
  close(panel.heightMm, 300, 0.3, 'panel height, assembled');

  // K: the map is the one drawing on paper smaller than it is; the words
  // (Not to scale ...) are outlines in the PDF, and `sheetInk.test.ts` holds them.
  expect(map.longestStrokeMm, 'the map, drawn smaller than the 300 mm panel').toBeLessThan(250);
}
