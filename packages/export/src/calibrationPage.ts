import { EPS_LENGTH, type Mm } from '@leathercad/core';
import { polyline, type Vec2 } from '@leathercad/geometry';

import { DEFAULT_MARGINS, type PaperSize } from './paper.js';
import type { ExportPath, ExportText } from './scene.js';
import { APP_NAME, BLOCK, ink, words } from './sheetInk.js';

/**
 * The page a printer is calibrated from (7.5, docs/printing.md §8.2), as it
 * lies on upright paper — the way every page goes to the printer (7.6b) — in
 * millimetres from its bottom-left, Y up.
 *
 * Two lines a maker measures with a steel rule: one across the paper, one
 * along it, because a printer's error along the feed and across the scan come
 * from different parts and differ (§8.2). Each is as long as the paper allows
 * in whole centimetres, up to 200 mm: length is what shows a few tenths of a
 * percent. Printed without any correction, so what is measured is the
 * printer's own.
 */
export interface CalibrationPage {
  /** How long the lines are drawn: `x` the horizontal one, across the paper; `y` the vertical one. */
  readonly drawnMm: { readonly x: Mm; readonly y: Mm };
  readonly paths: readonly ExportPath[];
  readonly texts: readonly ExportText[];
}

/** The longest a line is drawn, as §8.2 has it, and the unit it is drawn in. */
const LONGEST_MM = 200;
const STEP_MM = 10;
/** A tick at every centimetre; longer at every five, and at the ends a maker measures between. */
const TICK_MM = 2;
const LONG_TICK_MM = 4;
/** The horizontal line below the top margin, under the words; the vertical one below that. */
const ACROSS_BELOW_TOP_MM = 20;
const DOWN_BELOW_ACROSS_MM = 16;

/**
 * What the page says. English, like everything printed (ADR 0018), and only
 * what a maker holding it needs: what it is, and what to do with it.
 */
const TEXT = {
  title: 'LeatherCAD printer calibration',
  titleSizeMm: 4,
  instructions: [
    'Print at 100 % / Actual size. Measure each line end to end',
    'with a steel rule, then enter both lengths in LeatherCAD.',
  ],
  sizeMm: 3,
  footerSizeMm: 2,
  lineGapMm: 1.5,
} as const;

/** Where the two lines lie on `paper`: each by its start — left end, bottom end — and length. */
function linesOn(paper: PaperSize) {
  const m = DEFAULT_MARGINS;
  const longest = (room: Mm): Mm =>
    Math.min(LONGEST_MM, Math.floor((room + EPS_LENGTH) / STEP_MM) * STEP_MM);
  const across = { x: m.left, y: paper.heightMm - m.top - ACROSS_BELOW_TOP_MM };
  const downTop = across.y - DOWN_BELOW_ACROSS_MM;
  const downMm = longest(downTop - m.bottom);
  return {
    across,
    acrossMm: longest(paper.widthMm - m.left - m.right),
    down: { x: m.left, y: downTop - downMm },
    downMm,
  };
}

/** How long the calibration page draws its lines on `paper`: what the maker's readings are against. */
export function calibrationLengths(paper: PaperSize): CalibrationPage['drawnMm'] {
  const { acrossMm, downMm } = linesOn(paper);
  return { x: acrossMm, y: downMm };
}

export function calibrationPage(paper: PaperSize, now: Date): CalibrationPage {
  const m = DEFAULT_MARGINS;
  const left = m.left;
  const top = paper.heightMm - m.top;
  const { across, acrossMm, down, downMm } = linesOn(paper);

  const texts: ExportText[] = [];
  const hanging = { baseline: 'top' } as const;
  texts.push(words(TEXT.title, TEXT.titleSizeMm, { x: left, y: top }, hanging));
  let y = top - TEXT.titleSizeMm - TEXT.lineGapMm;
  for (const line of TEXT.instructions) {
    texts.push(words(line, TEXT.sizeMm, { x: left, y }, hanging));
    y -= TEXT.sizeMm + TEXT.lineGapMm;
  }

  // Across the top, below the words, its ticks hanging under it.
  const paths: ExportPath[] = [line(across, { x: across.x + acrossMm, y: across.y })];
  for (let mm = 0; mm <= acrossMm; mm += STEP_MM) {
    const tick = mm % 50 === 0 || mm === acrossMm ? LONG_TICK_MM : TICK_MM;
    paths.push(line({ x: across.x + mm, y: across.y - tick }, { x: across.x + mm, y: across.y }));
  }
  texts.push(
    words(
      `Horizontal line: ${String(acrossMm)} mm`,
      TEXT.sizeMm,
      { x: left + 10, y: across.y - 6 },
      hanging,
    ),
  );

  // Down the left side, below that, its ticks to the right of it.
  paths.push(line(down, { x: down.x, y: down.y + downMm }));
  for (let mm = 0; mm <= downMm; mm += STEP_MM) {
    const tick = mm % 50 === 0 || mm === downMm ? LONG_TICK_MM : TICK_MM;
    paths.push(line({ x: down.x, y: down.y + mm }, { x: down.x + tick, y: down.y + mm }));
  }
  texts.push(
    words(
      `Vertical line: ${String(downMm)} mm`,
      TEXT.sizeMm,
      { x: left + 8, y: down.y + downMm / 2 },
      { baseline: 'middle' },
    ),
  );

  const date = now.toISOString().slice(0, 10);
  texts.push(
    words(
      `${date} · ${APP_NAME}`,
      TEXT.footerSizeMm,
      { x: paper.widthMm - m.right, y: m.bottom },
      { align: 'right', baseline: 'bottom' },
    ),
  );

  return { drawnMm: { x: acrossMm, y: downMm }, paths, texts };
}

function line(a: Vec2, b: Vec2): ExportPath {
  return ink(polyline([a, b]), BLOCK);
}
