#!/usr/bin/env node
/**
 * `node tools/perf-pdf.mjs [label] [--project file.lcp]` — how long the renderer is blocked while
 * a PDF is written, in the real Electron app (PERF-002).
 *
 * Build first (`pnpm build`): it drives `apps/desktop/out` on this machine, so numbers compare
 * only with others taken here. It does both things a maker does with a PDF:
 *
 *   export   Export PDF: the dialogs answer with a temporary file, which is measured once written
 *   preview  Print: the Print Preview writes the PDF and shows it
 *
 * and reports, from the click until the result is there, the long tasks the page saw (50 ms or
 * more) and the largest gap between two animation frames: the longest the window could not paint
 * or answer a click. `--project` names the project; the default is `fixtures/perf/strap-5800.lcp`,
 * the 5.8 m strap on 33 A4 sheets. Each is done three times; `--preview` does only the preview.
 *
 * For the preview it also reports, over the 3 s from the click, the renderer's main-thread busy
 * time (Chromium's TaskDuration) and how many sheets pdf.js had drawn into the list beside the page
 * (PERF-013): every one of them, before the list drew only the ones near view. And the renderer
 * process's CPU time over those 3 s, which counts the pdf.js worker reading each page as well.
 * Last, twenty previews closed or re-papered at every moment from the click on, and the pdf.js
 * workers still running after them, with the post-GC heap.
 */
/* global PerformanceObserver, document, performance, requestAnimationFrame */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = args.indexOf('--project');
const project =
  flag === -1
    ? resolve(root, 'fixtures/perf/strap-5800.lcp')
    : resolve(args.splice(flag, 2)[1] ?? '');
const previewOnly = args.includes('--preview');
const label = args.find((a) => !a.startsWith('--')) ?? 'run';
const out = mkdtempSync(join(tmpdir(), 'lc-perf-pdf-'));
const pdf = join(out, 'out.pdf');

const app = await electron.launch({
  args: ['.', project],
  cwd: resolve(root, 'apps/desktop'),
  env: {
    ...process.env,
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'lc-perf-')),
    XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'lc-perf-state-')),
  },
});
const window = await app.firstWindow();
await window.getByTestId('part-count').waitFor();
await app.evaluate(({ dialog, shell }, target) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  shell.openPath = async () => '';
}, pdf);
await window.waitForTimeout(500);

await window.evaluate(() => {
  const w = window;
  w.__long = [];
  w.__gap = 0;
  w.__recording = false;
  new PerformanceObserver((l) => {
    if (w.__recording) for (const e of l.getEntries()) w.__long.push(e.duration);
  }).observe({ entryTypes: ['longtask'] });
  let last = performance.now();
  const tick = (t) => {
    if (w.__recording) w.__gap = Math.max(w.__gap, t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const cdp = await window.context().newCDPSession(window);
await cdp.send('Performance.enable');
const busy = async () =>
  (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;

// The window's renderer process, workers included: CPU seconds since it started.
const cpu = () =>
  app.evaluate(({ app: electronApp }) =>
    electronApp
      .getAppMetrics()
      .filter((m) => m.type === 'Tab')
      .reduce((sum, m) => sum + m.cpu.cumulativeCPUUsage, 0),
  );

async function measure(name, act, done, settle = 400) {
  const before = await busy();
  const cpuBefore = await cpu();
  await window.evaluate(() => {
    window.__long = [];
    window.__gap = 0;
    window.__recording = true;
  });
  const start = Date.now();
  await act();
  await done();
  const took = Date.now() - start;
  await window.waitForTimeout(Math.max(400, settle - took));
  const { long, gap } = await window.evaluate(() => {
    window.__recording = false;
    return { long: window.__long, gap: window.__gap };
  });
  const task = (await busy()) - before;
  const used = (await cpu()) - cpuBefore;
  console.log(
    [
      label,
      name.padEnd(8),
      `click to result=${String(took).padStart(5)} ms`,
      `long tasks=${long.map((d) => d.toFixed(0)).join('+') || 'none'} ms`,
      `main thread busy=${(task * 1000).toFixed(0)} ms`,
      `renderer CPU=${(used * 1000).toFixed(0)} ms`,
      `largest frame gap=${gap.toFixed(0)} ms`,
    ].join('  '),
  );
}

for (let i = 0; i < (previewOnly ? 0 : 3); i++) {
  rmSync(pdf, { force: true });
  await measure(
    'export',
    () => window.getByTestId('export-pdf').click(),
    async () => {
      for (let n = 0; n < 1200 && !existsSync(pdf); n++) await window.waitForTimeout(50);
      await window.waitForTimeout(300);
      console.log(`  ${String(statSync(pdf).size)} bytes`);
    },
  );
  await window.getByTestId('export-notice').waitFor();
  await window.keyboard.press('Escape');
  await window.getByTestId('export-notice').waitFor({ state: 'detached' });
}
for (let i = 0; i < 3; i++) {
  await measure(
    'preview',
    () => window.getByTestId('print').click(),
    // Drawn: pdf.js has sized the canvas, which a bare one is not (300 × 150).
    () =>
      window.waitForFunction(
        () => (document.querySelector('[data-testid="print-page"] canvas')?.width ?? 300) !== 300,
        undefined,
        { timeout: 60_000 },
      ),
    3000,
  );
  const thumbs = await window.evaluate(() => {
    const all = [...document.querySelectorAll('[data-testid="print-thumb"]')];
    return {
      sheets: all.length,
      drawn: all.filter((t) => (t.querySelector('canvas')?.width ?? 300) !== 300).length,
    };
  });
  console.log(`  thumbnails drawn ${String(thumbs.drawn)} of ${String(thumbs.sheets)}`);
  await window.keyboard.press('Escape');
  await window.getByTestId('print-preview').waitFor({ state: 'detached' });
  await window.waitForTimeout(500);
}

// PERF-013: twenty previews closed, or their paper changed, at every moment from the click on —
// while the file is written, while pdf.js reads it, while it draws — then the pdf.js workers
// still running and the heap after a garbage collection.
await window.evaluate(() => {
  const w = window;
  const Native = w.Worker;
  w.__pdfjs = { started: 0, ended: 0 };
  w.Worker = class extends Native {
    constructor(url, options) {
      super(url, options);
      if (!/pdf\.worker/.test(String(url))) return;
      w.__pdfjs.started += 1;
      const terminate = this.terminate.bind(this);
      this.terminate = () => {
        w.__pdfjs.ended += 1;
        terminate();
      };
    }
  };
});
const heap = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  return (await cdp.send('Runtime.getHeapUsage')).usedSize / 2 ** 20;
};
const heaps = [await heap()];
for (let i = 0; i < 20; i++) {
  await window.getByTestId('print').click();
  await window.waitForTimeout(i * 50);
  if (i % 2 === 1) {
    await window.getByTestId('print-paper').selectOption('A3');
    await window.waitForTimeout(i * 25);
    await window.getByTestId('print-paper').selectOption('A4');
  }
  await window.keyboard.press('Escape');
  await window.getByTestId('print-preview').waitFor({ state: 'detached' });
  if (i % 10 === 9) {
    await window.waitForTimeout(1000);
    heaps.push(await heap());
  }
}
const workers = await window.evaluate(() => window.__pdfjs);
console.log(
  [
    label,
    'cycles  ',
    `pdf.js workers started=${String(workers.started)} still running=${String(workers.started - workers.ended)}`,
    `post-GC heap ${heaps.map((h) => h.toFixed(1)).join(' → ')} MiB at 0/10/20 cycles`,
  ].join('  '),
);

// Destroyed first: a window left to close itself can keep the app, and this, from ending.
await app.evaluate(({ BrowserWindow }) => {
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
});
await app.close();
rmSync(out, { recursive: true, force: true });
