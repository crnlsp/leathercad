import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, type ElectronApplication, type Page } from '@playwright/test';

/**
 * The automated half of 7.7: an exported print test, measured on the page.
 *
 * `fixtures/projects/print-test.lcp` is exported through the app — the button a
 * maker presses — and the PDF that lands on disk is rasterised by poppler, an
 * implementation independent of ours, and measured in pixels. Nothing here
 * reads the project's coordinates: every number comes from ink on a page, the
 * way a steel rule would find it.
 *
 * What it cannot measure is the printer, its driver and the paper. That is the
 * physical half, recorded by a person in `docs/print-verification-log.md`.
 */

export const PRINT_TEST = resolve(import.meta.dirname, '../fixtures/projects/print-test.lcp');

/** 254 dpi: ten pixels to the millimetre. */
const DPI = 254;
const PX_PER_MM = DPI / 25.4;

/** Anything noticeably darker than paper, so the thin grey annotation lines count. */
const INK = 200;

interface Gray {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

/**
 * A straight stroke found on the page, in millimetres.
 *
 * `at` is its centre across the stroke; `from` and `to` its outer ends along
 * it, caps and joins included. `length` is centre-line: a stroke's ink reaches
 * half its width past each end of the line it draws — at a cap, or at the
 * corner of the outline it belongs to — so the extent less one width is the
 * line itself.
 */
export interface Stroke {
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly thickness: number;
  readonly length: number;
}

export interface PrintTestMeasurements {
  readonly pages: number;
  /** Per page: the 50 mm square, centre-line to centre-line. */
  readonly squares: ReadonlyArray<{ readonly widthMm: number; readonly heightMm: number }>;
  /** Per page: the 100 mm ruler's baseline. */
  readonly rulersMm: readonly number[];
  readonly panel: {
    /** The panel's bottom edge, which the dimension measures. */
    readonly edgeMm: number;
    /** Between the centre-lines of its two straight sides. */
    readonly widthMm: number;
    /** The dimension line printed under it. */
    readonly dimensionLineMm: number;
    /** From the edge down to the dimension line. */
    readonly dimensionOffsetMm: number;
    /** Hole markers on the straight run along the bottom. */
    readonly holes: number;
    /** (last − first) / gaps, from the markers' centres. */
    readonly spacingMm: number;
    /** The largest difference between one gap and the spacing. */
    readonly worstGapErrorMm: number;
  };
  readonly strap: {
    /** Strap end to join line on the first sheet, plus join line to strap end on the second. */
    readonly lengthMm: number;
    /** How far the strap runs past the join on each sheet: the overlap a maker lays down. */
    readonly pastJoinMm: readonly [number, number];
    /** How far each sheet's registration cross is off its join line. */
    readonly crossOffJoinMm: readonly [number, number];
    /** The cross's height above the strap's bottom edge, on each sheet. */
    readonly crossAboveEdgeMm: readonly [number, number];
    /** The strap's width, on each sheet. */
    readonly widthMm: readonly [number, number];
  };
}

/**
 * Opens the print test in a running app and exports it the way a maker does:
 * Open, then Export PDF, to the project's own paper. The dialogs answer with
 * the fixture and `pdf`, and the system viewer is not launched.
 */
export async function exportPrintTest(
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
    { project: PRINT_TEST, pdf },
  );

  await window.getByTestId('open').click();
  // A drawing left from an earlier test is not this one's to keep. Wait for
  // whichever comes first — the question, or the project opened — rather than
  // glancing once before the question has had time to appear.
  const discard = window.getByTestId('unsaved-discard');
  const opened = window.getByTestId('part-count').filter({ hasText: /^3$/ });
  await expect(discard.or(opened)).toBeVisible();
  if (await discard.isVisible()) await discard.click();
  await expect(window.getByTestId('part-count')).toHaveText('3');

  await window.getByTestId('export-pdf').click();
  await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
  await expect(window.getByTestId('file-error')).toHaveCount(0);
  // The strap is too long for the sheet, and the maker is told it is tiled.
  await expect(window.getByTestId('export-tiled')).toContainText('Strap');
}

/** Rasterises and measures an exported print test. */
export function measurePrintTest(pdf: string): PrintTestMeasurements {
  const pages = pageCount(pdf);
  const images = Array.from({ length: pages }, (_, i) => render(pdf, i + 1));

  const squares = images.map(squareOn);
  const rulersMm = images.map((image) => rulerOn(image).length);

  // The panel and the pocket share the first sheet; the strap is tiled over the
  // two after it, first column first.
  const panel = panelOn(images[0]!);
  const [left, right] = [images[1]!, images[2]!];
  const strap = strapAcross(left, right);

  return { pages, squares, rulersMm, panel, strap };
}

/**
 * The tolerances a 7.7 export must meet.
 *
 * A fifth of a millimetre is a pixel either side plus a stroke's anti-aliased
 * edge: tighter than a steel rule reads, and far tighter than the 3 mm a
 * 97 % "fit to page" would take off a 100 mm line.
 */
export function expectAccurate(measured: PrintTestMeasurements): void {
  const close = (actual: number, expected: number, tolerance: number, what: string) =>
    expect(Math.abs(actual - expected), `${what}: ${actual.toFixed(3)} mm`).toBeLessThan(tolerance);

  expect(measured.pages, 'sheets').toBe(3);
  measured.squares.forEach((square, i) => {
    close(square.widthMm, 50, 0.2, `square width, sheet ${String(i + 1)}`);
    close(square.heightMm, 50, 0.2, `square height, sheet ${String(i + 1)}`);
  });
  measured.rulersMm.forEach((ruler, i) => close(ruler, 100, 0.2, `ruler, sheet ${String(i + 1)}`));

  const { panel, strap } = measured;
  close(panel.edgeMm, 100, 0.2, 'panel edge');
  close(panel.widthMm, 100, 0.2, 'panel width');
  close(panel.dimensionLineMm, 100, 0.2, 'dimension line');
  close(panel.dimensionOffsetMm, 8, 0.2, 'dimension offset');

  // The straight run along the panel's bottom: 25 holes, 24 gaps, evenly
  // spaced. 93 mm of stitch line between two corner holes, at a 3.85 mm iron,
  // comes out at 3.875 mm — the run's own spacing, measured, not the average
  // the property panel shows for the whole hole set.
  expect(panel.holes, 'holes on the straight run').toBe(25);
  close(panel.spacingMm, 3.875, 0.01, 'hole spacing');
  expect(panel.worstGapErrorMm, 'evenness of the gaps').toBeLessThan(0.15);

  close(strap.lengthMm, 250, 0.3, 'strap, both halves');
  strap.pastJoinMm.forEach((past, i) =>
    expect(past, `strap past the join, sheet ${String(i + 2)}`).toBeGreaterThan(3),
  );
  strap.crossOffJoinMm.forEach((off, i) =>
    expect(off, `cross off its join, sheet ${String(i + 2)}`).toBeLessThan(0.2),
  );
  close(
    strap.crossAboveEdgeMm[0],
    strap.crossAboveEdgeMm[1],
    0.2,
    'the cross, against the strap, sheet 2 then sheet 3',
  );
  strap.widthMm.forEach((width, i) => close(width, 25, 0.2, `strap width, sheet ${String(i + 2)}`));
}

// ── Pages ────────────────────────────────────────────────────────────────────

function pageCount(pdf: string): number {
  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  return Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
}

function render(pdf: string, page: number): Gray {
  const directory = mkdtempSync(join(tmpdir(), 'leathercad-7.7-'));
  try {
    const prefix = join(directory, 'page');
    execFileSync('pdftoppm', [
      '-r',
      String(DPI),
      '-gray',
      '-singlefile',
      '-f',
      String(page),
      '-l',
      String(page),
      pdf,
      prefix,
    ]);
    return parsePgm(readFileSync(`${prefix}.pgm`));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function parsePgm(bytes: Buffer): Gray {
  let offset = 0;
  const token = (): string => {
    while (bytes[offset]! <= 0x20) offset++;
    const start = offset;
    while (bytes[offset]! > 0x20) offset++;
    return bytes.subarray(start, offset).toString('ascii');
  };
  if (token() !== 'P5') throw new Error('expected a binary PGM');
  const width = Number(token());
  const height = Number(token());
  token(); // maxval
  offset++; // the one whitespace byte before the data
  return { width, height, pixels: new Uint8Array(bytes.subarray(offset, offset + width * height)) };
}

/** The page turned on its side, so vertical strokes can be found as horizontal ones. */
function transpose(image: Gray): Gray {
  const pixels = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      pixels[x * image.height + y] = image.pixels[y * image.width + x]!;
    }
  }
  return { width: image.height, height: image.width, pixels };
}

// ── Strokes ──────────────────────────────────────────────────────────────────

/**
 * Horizontal strokes at least `minMm` long.
 *
 * Each row's long runs of ink, joined with the runs in the rows next to them
 * that cover much the same span: one stroke, a few pixels thick. In image rows,
 * which run down the page.
 */
function horizontalStrokes(image: Gray, minMm: number): Stroke[] {
  const minPx = minMm * PX_PER_MM;
  const open: Array<{ rows: number[]; from: number; to: number; lastRow: number }> = [];
  const done: typeof open = [];

  for (let y = 0; y < image.height; y++) {
    const row = y * image.width;
    let start = -1;
    for (let x = 0; x <= image.width; x++) {
      const ink = x < image.width && image.pixels[row + x]! < INK;
      if (ink && start < 0) start = x;
      if (!ink && start >= 0) {
        if (x - start >= minPx) {
          // The same stroke if it covers most of the run on the row above: the
          // rows at a stroke's anti-aliased edges, and those where a rounded
          // corner begins, stop short of the others.
          const near = open.find(
            (s) =>
              s.lastRow === y - 1 &&
              Math.min(s.to, x) - Math.max(s.from, start) >
                0.8 * Math.min(s.to - s.from, x - start),
          );
          if (near === undefined) {
            open.push({ rows: [y], from: start, to: x, lastRow: y });
          } else {
            near.rows.push(y);
            near.from = Math.min(near.from, start);
            near.to = Math.max(near.to, x);
            near.lastRow = y;
          }
        }
        start = -1;
      }
    }
    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i]!.lastRow < y) done.push(...open.splice(i, 1));
    }
  }
  done.push(...open);

  return done.map((s) => {
    const thickness = s.rows.length / PX_PER_MM;
    const at = (s.rows.reduce((a, b) => a + b, 0) / s.rows.length + 0.5) / PX_PER_MM;
    const from = s.from / PX_PER_MM;
    const to = s.to / PX_PER_MM;
    return { at, from, to, thickness, length: to - from - thickness };
  });
}

function verticalStrokes(image: Gray, minMm: number): Stroke[] {
  return horizontalStrokes(transpose(image), minMm);
}

const within = (value: number, low: number, high: number) => value >= low && value <= high;

// ── What is on the page ──────────────────────────────────────────────────────

/** The verification square: two sides and a top and bottom, each about 50 mm. */
function squareOn(image: Gray): { widthMm: number; heightMm: number } {
  const sides = verticalStrokes(image, 40).filter((s) => within(s.length, 45, 55));
  const ends = horizontalStrokes(image, 40).filter((s) => within(s.length, 45, 55));
  expect(sides, 'the square’s two sides').toHaveLength(2);
  expect(ends, 'the square’s top and bottom').toHaveLength(2);
  return {
    widthMm: Math.abs(sides[1]!.at - sides[0]!.at),
    heightMm: Math.abs(ends[1]!.at - ends[0]!.at),
  };
}

/** The ruler: the lowest 100 mm-ish stroke on the page, under the pattern. */
function rulerOn(image: Gray): Stroke {
  const long = horizontalStrokes(image, 80).filter((s) => within(s.length, 90, 110));
  return long.reduce((a, b) => (b.at > a.at ? b : a));
}

/**
 * The outer panel: its bottom edge, the dimension line under it, its sides,
 * and the holes along its bottom.
 *
 * The edge and the dimension line are the one pair of equal ~100 mm strokes a
 * few millimetres apart; the pocket's bottom edge and the ruler have no twin.
 */
function panelOn(image: Gray): PrintTestMeasurements['panel'] {
  const long = horizontalStrokes(image, 80).filter((s) => within(s.length, 90, 110));
  let edge: Stroke | undefined;
  let line: Stroke | undefined;
  for (const a of long) {
    for (const b of long) {
      const below = b.at - a.at;
      if (within(below, 4, 12) && Math.abs(a.from - b.from) < 0.5 && Math.abs(a.to - b.to) < 0.5) {
        edge = a;
        line = b;
      }
    }
  }
  if (edge === undefined || line === undefined) throw new Error('no dimensioned edge on sheet 1');

  // Its straight sides, 30 mm up from that edge: the ink at each end of the
  // row, clear of the stitching inside them.
  const sides = sidesAcross(image, edge.at - 30, [edge.from, edge.to]);

  const centres = holesAbove(image, edge);
  const gaps = centres.slice(1).map((x, i) => x - centres[i]!);
  const spacing = (centres.at(-1)! - centres[0]!) / gaps.length;

  return {
    edgeMm: edge.length,
    widthMm: sides[1] - sides[0],
    dimensionLineMm: line.length,
    dimensionOffsetMm: line.at - edge.at,
    holes: centres.length,
    spacingMm: spacing,
    worstGapErrorMm: Math.max(...gaps.map((gap) => Math.abs(gap - spacing))),
  };
}

/** The centres of the two runs of ink on a row nearest two places along it. */
function sidesAcross(image: Gray, rowMm: number, nearMm: readonly number[]): number[] {
  const y = Math.round(rowMm * PX_PER_MM);
  const runs: number[] = [];
  let start = -1;
  for (let x = 0; x <= image.width; x++) {
    const ink = x < image.width && image.pixels[y * image.width + x]! < INK;
    if (ink && start < 0) start = x;
    if (!ink && start >= 0) {
      runs.push((start + x) / 2 / PX_PER_MM);
      start = -1;
    }
  }
  return nearMm.map((near) => {
    const nearest = runs.reduce((a, b) => (Math.abs(b - near) < Math.abs(a - near) ? b : a));
    expect(Math.abs(nearest - near), 'a side where the edge ends').toBeLessThan(1);
    return nearest;
  });
}

/**
 * The centres of the hole markers on the straight run just inside an edge, in
 * millimetres along it.
 *
 * A marker is a millimetre circle, so a column through it has ink about a
 * millimetre tall. The stitch line's dashes run along the row and are a stroke
 * tall, so columns through them do not count, and a marker comes out as one
 * cluster of columns whatever dash crosses it — its middle is the centre.
 * The run sits where the most markers line up, somewhere up to 8 mm in.
 */
function holesAbove(image: Gray, edge: Stroke): number[] {
  const px = (mm: number) => Math.round(mm * PX_PER_MM);
  const [x0, x1] = [px(edge.from + 1), px(edge.to - 1)];
  const band = px(0.9);
  let best: number[] = [];

  for (let row = px(edge.at - 8); row <= px(edge.at - 1); row++) {
    const clusters: number[] = [];
    let start = -1;
    for (let x = x0; x <= x1; x++) {
      let top = -1;
      let bottom = -1;
      if (x < x1) {
        for (let y = row - band; y <= row + band; y++) {
          if (image.pixels[y * image.width + x]! < INK) {
            if (top < 0) top = y;
            bottom = y;
          }
        }
      }
      // No upper bound: at a corner the next side's dashes run through the
      // marker, centred on it, and the cluster's middle is still its centre.
      const tall = top >= 0 && (bottom - top + 1) / PX_PER_MM >= 0.6;
      if (tall && start < 0) start = x;
      if (!tall && start >= 0) {
        if (within((x - start) / PX_PER_MM, 0.5, 1.6)) clusters.push((start + x) / 2 / PX_PER_MM);
        start = -1;
      }
    }
    if (clusters.length > best.length) best = clusters;
  }

  return best;
}

/**
 * The strap across its two sheets: its ends, its edges, the join line each
 * sheet shares, and the registration cross on it.
 */
function strapAcross(first: Gray, second: Gray): PrintTestMeasurements['strap'] {
  const a = strapOn(first);
  const b = strapOn(second);
  return {
    // Left end to the join on the first sheet; the join to the right end on
    // the second. Laid over each other on that line, they are the strap.
    lengthMm: a.join - a.leftEnd + (b.rightEnd - b.join),
    pastJoinMm: [a.edgesTo - a.join, b.join - b.edgesFrom],
    crossOffJoinMm: [Math.abs(a.cross.x - a.join), Math.abs(b.cross.x - b.join)],
    crossAboveEdgeMm: [a.bottom - a.cross.y, b.bottom - b.cross.y],
    widthMm: [a.bottom - a.top, b.bottom - b.top],
  };
}

function strapOn(image: Gray) {
  // Its top and bottom edges: the two long black strokes on the sheet, cut
  // off by the sheet's printable area, with the strap between them.
  // The ruler's 100 mm is not long enough to be mistaken for one.
  const edges = horizontalStrokes(image, 110).sort((p, q) => p.at - q.at);
  expect(edges, 'the strap’s two edges').toHaveLength(2);
  const [top, bottom] = edges as [Stroke, Stroke];
  const thickness = (top.thickness + bottom.thickness) / 2;

  // The join line: light grey dashes, the column with the most ink on the sheet.
  const columns = new Float64Array(image.width);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.pixels[y * image.width + x]! < 235) columns[x]!++;
    }
  }
  const peak = Math.max(...columns);
  let sum = 0;
  let weight = 0;
  columns.forEach((count, x) => {
    if (count > peak / 2) {
      sum += (x + 0.5) * count;
      weight += count;
    }
  });
  const join = sum / weight / PX_PER_MM;

  // The strap's rounded ends: the furthest ink between its edges, less half a
  // stroke to reach the line itself.
  const [rowFrom, rowTo] = [Math.ceil(top.at * PX_PER_MM), Math.floor(bottom.at * PX_PER_MM)];
  let left = image.width;
  let right = -1;
  for (let y = rowFrom; y <= rowTo; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.pixels[y * image.width + x]! < INK && Math.abs(x / PX_PER_MM - join) > 1) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
      }
    }
  }

  // The cross: a black arm, 6 mm, across the join.
  const arms = horizontalStrokes(image, 4).filter(
    (s) => within(s.to - s.from, 5, 7) && Math.abs((s.from + s.to) / 2 - join) < 1,
  );
  expect(arms, 'the registration cross').toHaveLength(1);
  const cross = { x: (arms[0]!.from + arms[0]!.to) / 2, y: arms[0]!.at };

  return {
    top: top.at,
    bottom: bottom.at,
    join,
    edgesFrom: Math.min(top.from, bottom.from),
    edgesTo: Math.max(top.to, bottom.to),
    leftEnd: left / PX_PER_MM + thickness / 2,
    rightEnd: right / PX_PER_MM - thickness / 2,
    cross,
  };
}
