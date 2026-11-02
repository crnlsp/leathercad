#!/usr/bin/env node
/**
 * `node tools/perf-design.mjs` — how the Design board draws, in the real Electron app (PERF-008).
 *
 * Build first (`pnpm build`): it drives `apps/desktop/out`, or the `apps/desktop` of another
 * checkout given as `--app`. Two modes:
 *
 *   node tools/perf-design.mjs time [label]   painting callbacks while hovering and panning,
 *                                             with the whole project framed and at 100 %
 *   node tools/perf-design.mjs pixels [label] a fingerprint of the canvas at every step of a
 *                                             pan along the project, at three zooms, with a
 *                                             feature hovered and selected: diff two runs to
 *                                             see that a change did not move a pixel
 *
 * `--project <file.lcp>` names the project; the default is `fixtures/perf/strap-5800.lcp`, the
 * audit's 5.8 m strap of 3,028 holes. The window is 1600 × 1000.
 *
 * A callback is counted when it painted, which a paint shows by clearing the canvas. For each it
 * records the JavaScript time and the canvas's draw calls — `stroke`, `fill` and `fillText` —
 * which say how much of the drawing was sent to the canvas, whatever the machine. The time covers
 * the JavaScript that draws, not the GPU or the frame that reaches the screen.
 *
 * Electron draws nothing for a window the desktop covers, and then waits: run it under Xvfb, in
 * the pinned Playwright container, as `tools/perf-retention.mjs` says.
 */
/* global CanvasRenderingContext2D, document, performance */
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args.splice(at, 2)[1] ?? fallback);
};
const appDir = resolve(option('--app', resolve(root, 'apps/desktop')));
const project = resolve(option('--project', resolve(root, 'fixtures/perf/strap-5800.lcp')));
const [mode = 'time', label = mode] = args;
if (mode !== 'time' && mode !== 'pixels') {
  console.error(
    'usage: node tools/perf-design.mjs time|pixels [label] [--project file.lcp] [--app dir]',
  );
  process.exit(2);
}

const app = await electron.launch({
  args: [
    '.',
    project,
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
  ],
  cwd: appDir,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'lc-perf-')),
    XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'lc-perf-state-')),
  },
});
const window = await app.firstWindow();
await window.getByTestId('part-count').waitFor();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
await window.waitForTimeout(500);
// The board repaints once its typeface has loaded: not before that.
await window.evaluate(() => document.fonts.ready);
await window.evaluate(() => {
  const w = window;
  w.__paints = [];
  let painted = false;
  let calls = 0;
  const proto = CanvasRenderingContext2D.prototype;
  const clear = proto.clearRect;
  proto.clearRect = function (...a) {
    painted = true;
    return clear.apply(this, a);
  };
  for (const name of ['stroke', 'fill', 'fillText']) {
    const draw = proto[name];
    proto[name] = function (...a) {
      calls++;
      return draw.apply(this, a);
    };
  }
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) =>
    raf((t) => {
      painted = false;
      calls = 0;
      const start = performance.now();
      cb(t);
      if (painted) w.__paints.push({ ms: performance.now() - start, calls });
    });
});
await window.getByTestId('tool-select').click();

const canvas = window.getByTestId('editor-canvas');
const box = await canvas.boundingBox();
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

const zoom = async () =>
  Number(((await window.getByTestId('zoom-level').textContent()) ?? '').replace(/\D/g, ''));
const reset = () => window.evaluate(() => (window.__paints = []));

async function fit() {
  await window.getByTestId('zoom-fit').click();
  await window.mouse.move(box.x + 5, box.y + box.height - 5);
  await window.waitForTimeout(300);
}
async function zoomTo(percent) {
  await window.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 40 && (await zoom()) < percent; i++) {
    await window.mouse.wheel(0, -150);
    await window.waitForTimeout(60);
  }
  await window.waitForTimeout(200);
}
/** A middle-button drag, which pans the board whatever the tool. */
async function pan(dx, dy, steps) {
  await window.mouse.move(centre.x, centre.y);
  await window.mouse.down({ button: 'middle' });
  await window.mouse.move(centre.x + dx, centre.y + dy, { steps });
  await window.mouse.up({ button: 'middle' });
}
/** Zigzags over the canvas, so the pointer crosses every line there is. */
async function sweep() {
  await window.mouse.move(box.x + 40, box.y + 40);
  const rows = Math.floor((box.height - 120) / 28);
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
  const paints = await window.evaluate(() => window.__paints);
  const ms = paints.map((p) => p.ms).sort((a, b) => a - b);
  const calls = paints.map((p) => p.calls).sort((a, b) => a - b);
  const at = (list, f) =>
    list.length === 0 ? NaN : list[Math.min(list.length - 1, Math.floor(f * list.length))];
  const result = {
    label,
    name,
    paints: paints.length,
    p50: at(ms, 0.5),
    p95: at(ms, 0.95),
    callsMedian: at(calls, 0.5),
    callsMax: at(calls, 1),
  };
  console.log(
    [
      label,
      name.padEnd(12),
      `paints=${String(paints.length).padStart(3)}`,
      `p50=${result.p50.toFixed(2).padStart(6)} ms`,
      `p95=${result.p95.toFixed(2).padStart(6)} ms`,
      `draw calls median=${String(result.callsMedian).padStart(5)} max=${String(result.callsMax)}`,
    ].join('  '),
  );
  console.log(JSON.stringify(result));
}

async function hash(name) {
  await window.waitForTimeout(120);
  const url = await canvas.evaluate((c) => c.toDataURL());
  console.log(name, createHash('sha256').update(url).digest('hex').slice(0, 16));
}

if (mode === 'time') {
  for (const percent of [0, 100]) {
    await fit();
    if (percent > 0) await zoomTo(percent);
    const shown = `${String(await zoom())} %`;
    await reset();
    await sweep();
    await report(`hover @${shown}`);
    await reset();
    await pan(-300, -60, 60);
    await report(`pan @${shown}`);
  }
} else {
  await fit();
  await hash('fit');
  for (const [name, percent, stepPx, steps] of [
    ['low', 25, 120, 12],
    ['mid', 100, 160, 16],
    ['close', 400, 200, 16],
  ]) {
    await fit();
    await zoomTo(percent);
    await hash(`${name}: start`);
    for (let i = 0; i < steps; i++) {
      await pan(-stepPx, i % 2 === 0 ? 40 : -40, 2);
      await hash(`${name}: pan ${String(i)}`);
      if (i % 3 === 1) {
        // The pointer down a line through the middle, hovering whatever is under it, and a
        // click there: the same places in every run, so two runs' fingerprints compare.
        for (let k = 0; k <= 16; k++) {
          await window.mouse.move(centre.x, centre.y - 80 + k * 10);
          await hash(`${name}: pan ${String(i)} pointer ${String(k)}`);
        }
        await window.mouse.click(centre.x, centre.y);
        await hash(`${name}: pan ${String(i)} clicked`);
        await window.keyboard.press('Escape');
        await window.mouse.move(box.x + 5, box.y + box.height - 5);
      }
    }
  }
}
// A plain kill leaves Electron waiting a minute and a half for Playwright's debugger to disconnect.
app.process().kill('SIGKILL');
process.exit(0);
