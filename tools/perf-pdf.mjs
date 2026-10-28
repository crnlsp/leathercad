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
 * the 5.8 m strap on 33 A4 sheets. Each is done three times.
 */
/* global PerformanceObserver, performance, requestAnimationFrame */
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
const label = args[0] ?? 'run';
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

async function measure(name, act, done) {
  await window.evaluate(() => {
    window.__long = [];
    window.__gap = 0;
    window.__recording = true;
  });
  const start = Date.now();
  await act();
  await done();
  const took = Date.now() - start;
  await window.waitForTimeout(400);
  const { long, gap } = await window.evaluate(() => {
    window.__recording = false;
    return { long: window.__long, gap: window.__gap };
  });
  console.log(
    [
      label,
      name.padEnd(8),
      `click to result=${String(took).padStart(5)} ms`,
      `long tasks=${long.map((d) => d.toFixed(0)).join('+') || 'none'} ms`,
      `largest frame gap=${gap.toFixed(0)} ms`,
    ].join('  '),
  );
}

for (let i = 0; i < 3; i++) {
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
    () => window.getByTestId('print-page').locator('canvas').first().waitFor({ timeout: 60_000 }),
  );
  await window.keyboard.press('Escape');
  await window.getByTestId('print-preview').waitFor({ state: 'detached' });
  await window.waitForTimeout(500);
}
await app.close();
rmSync(out, { recursive: true, force: true });
