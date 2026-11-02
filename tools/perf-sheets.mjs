#!/usr/bin/env node
/**
 * `node tools/perf-sheets.mjs` — how the Sheets view draws, in the real Electron app (PERF-003).
 *
 * Build first (`pnpm build`): it drives `apps/desktop/out`, on this machine's own
 * display, so numbers compare only with others taken here. Two modes:
 *
 *   node tools/perf-sheets.mjs time [label]   drawing callbacks while hovering and
 *                                             panning at fit, about 30 % and about 100 %
 *   node tools/perf-sheets.mjs pixels [label] a fingerprint of the canvas at every step of a
 *                                             pan along the sheets, with a piece hovered and
 *                                             selected: diff two runs to see that a change
 *                                             did not move a pixel
 *
 * `--project <file.lcp>` names the project; the default is `fixtures/perf/strap-5800.lcp`,
 * the audit's 5.8 m strap of 3,028 holes on 33 A4 sheets (`strap(5800)` in
 * `packages/domain/src/workloads.ts`, saved). The window is 1600 × 1000.
 *
 * A callback is timed when it painted, which a paint shows by clearing the canvas; it
 * covers the JavaScript that draws, not the GPU or the frame that reaches the screen.
 */
/* global CanvasRenderingContext2D, PerformanceObserver, document, performance */
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = args.indexOf('--project');
const project =
  flag === -1
    ? resolve(root, 'fixtures/perf/strap-5800.lcp')
    : resolve(args.splice(flag, 2)[1] ?? '');
const [mode = 'time', label = mode] = args;
if (mode !== 'time' && mode !== 'pixels') {
  console.error('usage: node tools/perf-sheets.mjs time|pixels [label] [--project file.lcp]');
  process.exit(2);
}

const app = await electron.launch({
  args: ['.', project],
  cwd: resolve(root, 'apps/desktop'),
  env: {
    ...process.env,
    XDG_CONFIG_HOME: mkdtempSync(resolve(tmpdir(), 'lc-perf-')),
    XDG_STATE_HOME: mkdtempSync(resolve(tmpdir(), 'lc-perf-state-')),
  },
});
const window = await app.firstWindow();
await window.getByTestId('part-count').waitFor();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
await window.waitForTimeout(500);
await window.evaluate(() => {
  const w = window;
  w.__paints = [];
  w.__long = 0;
  let painted = false;
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...a) {
    painted = true;
    return clear.apply(this, a);
  };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) =>
    raf((t) => {
      painted = false;
      const start = performance.now();
      cb(t);
      if (painted) w.__paints.push(performance.now() - start);
    });
  new PerformanceObserver((l) => (w.__long += l.getEntries().length)).observe({
    entryTypes: ['longtask'],
  });
});
await window.keyboard.press('Control+2');
await window.waitForTimeout(800);

const canvas = window.getByTestId('editor-canvas');
const box = await canvas.boundingBox();
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
/**
 * The first sheet's paper, at the fitted view, where the zoom is anchored so
 * the sheets stay on screen: the leftmost white pixel of the canvas.
 */
async function firstSheet() {
  const [x, y] = await canvas.evaluate((c) => {
    const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const scale = c.width / c.getBoundingClientRect().width;
    for (let px = 0; px < width; px++) {
      for (let py = 0; py < height; py++) {
        const i = (py * width + px) * 4;
        if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) {
          return [(px + 2) / scale, py / scale];
        }
      }
    }
    return [0, 0];
  });
  return { x: box.x + x, y: box.y + y };
}
/** Set at the fitted view, and again each time it is fitted. */
let anchor = await firstSheet();

const zoom = async () =>
  Number(((await window.getByTestId('zoom-level').textContent()) ?? '').replace(/\D/g, ''));
const reset = () =>
  window.evaluate(() => {
    window.__paints = [];
    window.__long = 0;
  });

async function zoomTo(percent) {
  await window.mouse.move(anchor.x, anchor.y);
  for (let i = 0; i < 30 && (await zoom()) < percent; i++) {
    await window.mouse.wheel(0, -150);
    await window.waitForTimeout(60);
  }
  await window.waitForTimeout(200);
}

async function pan(dx, dy, steps = 3) {
  await window.mouse.move(centre.x, centre.y);
  await window.mouse.down();
  await window.mouse.move(centre.x + dx, centre.y + dy, { steps });
  await window.mouse.up();
}

/** Zigzags over the canvas, so the pointer enters and leaves every piece there is. */
async function sweep() {
  await window.mouse.move(box.x + 40, box.y + 40);
  const rows = Math.floor((box.height - 120) / 14);
  for (let r = 0; r < rows; r++) {
    const y = box.y + 60 + ((box.height - 120) * r) / (rows - 1);
    const [a, b] = r % 2 === 0 ? [60, box.width - 60] : [box.width - 60, 60];
    for (let i = 0; i <= 24; i++) {
      await window.mouse.move(box.x + a + ((b - a) * i) / 24, y);
      await window.waitForTimeout(6);
    }
  }
}

async function report(name) {
  await window.waitForTimeout(300);
  const { paints, long } = await window.evaluate(() => ({
    paints: window.__paints.slice().sort((a, b) => a - b),
    long: window.__long,
  }));
  const at = (f) =>
    paints.length === 0 ? NaN : paints[Math.min(paints.length - 1, Math.floor(f * paints.length))];
  console.log(
    [
      label,
      name.padEnd(12),
      `paints=${String(paints.length).padStart(3)}`,
      `p50=${at(0.5).toFixed(1).padStart(6)} ms`,
      `p95=${at(0.95).toFixed(1).padStart(6)} ms`,
      `max=${at(1).toFixed(1).padStart(6)} ms`,
      `long tasks=${String(long)}`,
    ].join('  '),
  );
}

async function hash(name) {
  await window.waitForTimeout(120);
  const url = await canvas.evaluate((c) => c.toDataURL());
  console.log(name, createHash('sha256').update(url).digest('hex').slice(0, 16));
}

if (mode === 'time') {
  for (const percent of [0, 25, 100]) {
    // From the fitted view each time, so the strip is where the zoom is anchored.
    await window.getByTestId('zoom-fit').click();
    await window.waitForTimeout(300);
    anchor = await firstSheet();
    if (percent > 0) await zoomTo(percent);
    const shown = `${String(await zoom())} %`;
    await reset();
    await sweep();
    await report(`hover @${shown}`);
    await reset();
    await pan(-250, -90, 60);
    await report(`pan @${shown}`);
  }
} else {
  // The board repaints once its typeface has loaded: not before that.
  await window.evaluate(() => document.fonts.ready);
  await window.waitForTimeout(300);
  await hash('fit');
  for (const [name, ticks, stepPx, steps] of [
    ['low', 3, 90, 36],
    ['mid', 5, 140, 36],
    ['close', 7, 180, 30],
  ]) {
    await window.getByTestId('zoom-fit').click();
    await window.waitForTimeout(300);
    anchor = await firstSheet();
    await window.mouse.move(anchor.x, anchor.y);
    for (let i = 0; i < ticks; i++) {
      await window.mouse.wheel(0, -150);
      await window.waitForTimeout(30);
    }
    await hash(`${name}: start`);
    for (let i = 0; i < steps; i++) {
      await pan(-stepPx, 0);
      await hash(`${name}: pan ${String(i)}`);
      if (i % 2 === 1) {
        // Hover and select whatever piece is under a line down the middle.
        for (let y = box.y + box.height * 0.1; y < box.y + box.height * 0.8; y += 5) {
          await window.mouse.move(centre.x, y);
          if ((await window.locator('[data-testid="sheets-parts"] button.hovered').count()) > 0) {
            await hash(`${name}: pan ${String(i)} hovered`);
            await window.mouse.click(centre.x, y);
            await hash(`${name}: pan ${String(i)} selected`);
            await window.mouse.move(box.x + 5, box.y + box.height - 5);
            await window.mouse.click(box.x + 5, box.y + box.height - 5);
            break;
          }
        }
      }
    }
  }
}
await app.close();
