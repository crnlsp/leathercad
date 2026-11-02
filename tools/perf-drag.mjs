#!/usr/bin/env node
/**
 * `node tools/perf-drag.mjs [label]` — what a drag costs on a traced outline, in the real
 * Electron app (PERF-004).
 *
 * Build first (`pnpm build`): it drives `apps/desktop/out`, on this machine's own display, so
 * numbers compare only with others taken here. `--project <file.lcp>` names the project; the
 * default is `fixtures/perf/traced-500.lcp`. The `traced-<n>.lcp` fixtures are
 * `tracedOutline(n)` from `packages/domain/src/workloads.ts` — an outline of n points, its stitch
 * line and 468 holes — with a vertical guide at x = 150 mm and a diagonal one through the
 * origin, saved. The window is 1600 × 1000, zoomed to about 100 % on the outline's left edge.
 *
 * Two drags with the Select tool, each three runs of 20 moves of 4 px, undone after each run:
 *
 *   piece   the outline pressed 1 mm outside its leftmost point and carried right; the piece
 *           moves whole, and every path in the project is new on every move
 *   guide   the vertical guide pressed at y = 300 mm and carried right; no path changes
 *
 * Each move waits for two animation callbacks before the next, as the audit's did. A move's
 * latency runs from the pointer event to the end of the first animation callback after it that
 * painted: the JavaScript that handles it and draws it, not the GPU or the frame that reaches the
 * screen. Long tasks are the browser's, over 50 ms, anywhere in the run.
 */
/* global CanvasRenderingContext2D, PerformanceObserver, performance, requestAnimationFrame */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = args.indexOf('--project');
const project =
  flag === -1
    ? resolve(root, 'fixtures/perf/traced-500.lcp')
    : resolve(args.splice(flag, 2)[1] ?? '');
const [label = 'drag'] = args;

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
await window.waitForTimeout(800);
await window.evaluate(() => {
  const w = window;
  w.__latency = [];
  w.__long = [];
  let pending = null;
  let painted = false;
  w.addEventListener('pointermove', () => (pending ??= performance.now()), { capture: true });
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...a) {
    painted = true;
    return clear.apply(this, a);
  };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) =>
    raf((t) => {
      painted = false;
      cb(t);
      if (painted && pending !== null) {
        w.__latency.push(performance.now() - pending);
        pending = null;
      }
    });
  new PerformanceObserver((l) => w.__long.push(...l.getEntries().map((e) => e.duration))).observe({
    entryTypes: ['longtask'],
  });
});

const canvas = window.getByTestId('editor-canvas');
const box = await canvas.boundingBox();
const readout = window.getByTestId('cursor-readout');

/** Millimetres under a window point, from the status bar's readout. */
async function mmAt(x, y) {
  await window.getByTestId('status-bar').hover();
  await window.waitForFunction((el) => el.textContent.includes('—'), await readout.elementHandle());
  await window.mouse.move(x, y);
  await window.waitForFunction(
    (el) => !el.textContent.includes('—'),
    await readout.elementHandle(),
  );
  const [mx, my] = ((await readout.textContent()) ?? '')
    .split(' , ')
    // The readout writes a minus sign, U+2212, not a hyphen.
    .map((part) => Number(part.replace('−', '-').replace(/[^\d.-]/g, '')));
  return { x: mx, y: my };
}

/** The view maps millimetres to the window by a scale and an offset on each axis. */
async function calibrate() {
  const a = { x: box.x + 200, y: box.y + 200 };
  const b = { x: box.x + box.width - 200, y: box.y + box.height - 200 };
  const [ma, mb] = [await mmAt(a.x, a.y), await mmAt(b.x, b.y)];
  return (mm) => ({
    x: a.x + ((mm.x - ma.x) * (b.x - a.x)) / (mb.x - ma.x),
    y: a.y + ((mm.y - ma.y) * (b.y - a.y)) / (mb.y - ma.y),
  });
}

// At the fitted view the pick radius reaches from the outline to the holes 3.5 mm inside it,
// and a press there takes the holes, which follow the outline and cannot be carried. About
// 100 % leaves the outline alone under a press 1 mm outside it.
await window.getByTestId('tool-select').click();
const left = (await calibrate())({ x: 9, y: 300 });
await window.mouse.move(left.x, left.y);
const zoom = async () =>
  Number(((await window.getByTestId('zoom-level').textContent()) ?? '').replace(/\D/g, ''));
for (let i = 0; i < 30 && (await zoom()) < 100; i++) {
  await window.mouse.wheel(0, -150);
  await window.waitForTimeout(60);
}
await window.waitForTimeout(300);
const toWindow = await calibrate();

const settle = () =>
  window.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function drag(name, fromMm) {
  const from = toWindow(fromMm);
  const all = [];
  const long = [];
  for (let run = 0; run < 3; run++) {
    await window.mouse.move(from.x, from.y);
    await settle();
    await window.evaluate(() => {
      window.__latency = [];
      window.__long = [];
    });
    await window.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await window.mouse.move(from.x + 4 * i, from.y);
      await settle();
    }
    await window.mouse.up();
    await settle();
    const got = await window.evaluate(() => ({ latency: window.__latency, long: window.__long }));
    all.push(...got.latency);
    long.push(...got.long);
    // A press that caught nothing, or a piece that refused to move, leaves no history.
    if (await window.getByTestId('undo').isDisabled()) throw new Error(`${name}: nothing moved`);
    await window.getByTestId('undo').click();
    await settle();
  }
  all.sort((p, q) => p - q);
  const at = (f) => all[Math.min(all.length - 1, Math.floor(f * all.length))] ?? NaN;
  console.log(
    [
      label,
      name.padEnd(6),
      `moves=${String(all.length).padStart(3)}`,
      `p50=${at(0.5).toFixed(1).padStart(6)} ms`,
      `p95=${at(0.95).toFixed(1).padStart(6)} ms`,
      `max=${at(1).toFixed(1).padStart(6)} ms`,
      `long tasks=${String(long.length)} (${long.reduce((s, d) => s + d, 0).toFixed(0)} ms)`,
    ].join('  '),
  );
}

await drag('piece', { x: 9, y: 300 });
await drag('guide', { x: 150, y: 300 });
await app.close();
