#!/usr/bin/env node
/**
 * PERF-014: idle frame callbacks and board paints, not a CPU/battery estimate.
 * Build first, then run under Xvfb in the pinned Playwright/Poppler container:
 *   node tools/perf-frames.mjs [label] [--app dir] [--seconds 10] [--runs 3]
 * The retained 5.8 m strap opens at 1600 × 1000. Design and Sheets each settle
 * for one second after fonts load, then take three ten-second samples. The
 * counter never schedules a frame of its own during a sample. JSON includes
 * runtime metadata and canvas fingerprints for comparing before/after output.
 */
/* global document */
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import { _electron as electron } from '@playwright/test';

import { installFrameCounter } from '../e2e/frameCount.ts';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args.splice(at, 2)[1];
};
const appDir = resolve(option('--app', resolve(root, 'apps/desktop')));
const seconds = Number(option('--seconds', '10'));
const runs = Number(option('--runs', '3'));
const label = args[0] ?? 'run';
const app = await electron.launch({
  args: [
    '.',
    resolve(root, 'fixtures/perf/strap-5800.lcp'),
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
  ],
  cwd: appDir,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'lc-frames-')),
    XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'lc-frames-state-')),
    LEATHERCAD_RELEASES_URL: 'http://127.0.0.1:9/',
  },
});
try {
  const window = await app.firstWindow();
  await window.getByTestId('app-version').waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000),
  );
  await window.evaluate(() => document.fonts.ready);
  const counts = await installFrameCounter(window);
  console.log(
    JSON.stringify({ label, runtime: await app.evaluate(() => process.versions), seconds, runs }),
  );
  for (const view of ['design', 'sheets']) {
    await window.getByTestId(`view-${view}`).click();
    await window.getByTestId('status-bar').hover();
    await window.waitForTimeout(1000);
    for (let sample = 1; sample <= runs; sample++) {
      await counts.evaluate((c) => {
        c.callbacks = 0;
        c.paints = 0;
      });
      await window.waitForTimeout(seconds * 1000);
      const result = await counts.evaluate((c) => ({ ...c }));
      console.log(JSON.stringify({ label, view, sample, seconds, ...result }));
    }
    const pixels = await window.getByTestId('editor-canvas').evaluate((c) => c.toDataURL());
    console.log(
      JSON.stringify({ label, view, sha256: createHash('sha256').update(pixels).digest('hex') }),
    );
  }
} finally {
  // As in the other perf tools: debugger teardown otherwise waits for quit.
  app.process().kill('SIGKILL');
}
