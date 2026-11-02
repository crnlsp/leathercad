#!/usr/bin/env node
/**
 * `node tools/perf-save.mjs [label] [--project file.lcp] [--app dir]` — how long the window is
 * stopped while a project is saved, and while its recovery copy is written, in the real Electron
 * app (PERF-009).
 *
 * Build first (`pnpm build`): it drives `apps/desktop/out`, or the `apps/desktop` of another
 * checkout given as `--app`, so a build before a change can run beside one after it. The project
 * is opened from a copy; by default `fixtures/perf/traced-40x500.lcp`, the audit's path-heavy
 * project: forty parts, each a 500-point traced outline in an eight-column layout, its stitch line
 * 3.5 mm in and 468 holes on it, saved. Each run draws a panel, so there is unsaved work, then:
 *
 *   save      Ctrl+S, until the file on disk has changed
 *   recovery  the next recovery copy, the interval shortened to three seconds, until it is on disk
 *
 * three times each. Each starts once the edit has settled, so what it measures is the file and
 * not the panel's evaluation; a copy written before then is let go, and the run edits again. It
 * reports, from the key or the edit's settling until the file, the long tasks the page
 * saw (50 ms or more) and the largest gap between two animation frames: the longest the window
 * could not paint or answer a click. Run it under Xvfb, in the pinned Playwright container, as
 * `tools/perf-retention.mjs` says.
 */
/* global PerformanceObserver, performance, requestAnimationFrame */
import { copyFileSync, existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : resolve(args.splice(at, 2)[1] ?? '');
};
const source = option('--project', resolve(root, 'fixtures/perf/traced-40x500.lcp'));
const appDir = option('--app', resolve(root, 'apps/desktop'));
const label = args[0] ?? 'run';
const file = join(mkdtempSync(join(tmpdir(), 'lc-perf-save-')), 'Project.lcp');
copyFileSync(source, file);
const state = mkdtempSync(join(tmpdir(), 'lc-perf-save-state-'));
const recovery = join(state, 'leathercad', 'recovery');

const app = await electron.launch({
  args: [
    '.',
    file,
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
  ],
  cwd: appDir,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'lc-perf-')),
    XDG_STATE_HOME: state,
    LEATHERCAD_RECOVERY_INTERVAL_MS: '3000',
  },
});
const window = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
await window.getByTestId('part-count').waitFor();
await window.waitForTimeout(1500);

/** Draws a panel, which is unsaved work, beside the last, and waits until the project has it. */
let panels = 0;
async function edit() {
  const count = window.getByTestId('part-count');
  const before = Number(await count.textContent());
  await window.getByTestId('tool-rectangle').click();
  const box = await window.getByTestId('editor-canvas').boundingBox();
  const left = box.x + 100 + 40 * (panels++ % 20);
  await window.mouse.move(left, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(left + 30, box.y + 220, { steps: 3 });
  await window.mouse.up();
  await window.keyboard.press('Escape');
  for (let n = 0; n < 200 && Number(await count.textContent()) === before; n++) {
    await window.waitForTimeout(25);
  }
  if (Number(await count.textContent()) === before) throw new Error('the panel was not drawn');
}

async function watch() {
  await window.evaluate(() => {
    const w = window;
    w.__long = [];
    w.__gap = 0;
    w.__watching = true;
    let last = performance.now();
    const frame = (now) => {
      w.__gap = Math.max(w.__gap, now - last);
      last = now;
      if (w.__watching) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    w.__observer ??= new PerformanceObserver((list) => {
      if (w.__watching) w.__long.push(...list.getEntries().map((e) => e.duration));
    });
    w.__observer.observe({ entryTypes: ['longtask'] });
  });
}

async function report(name, started) {
  const took = Date.now() - started;
  const { long, gap } = await window.evaluate(() => {
    window.__watching = false;
    return { long: window.__long, gap: window.__gap };
  });
  console.log(
    [
      label,
      name.padEnd(8),
      `to file=${String(took).padStart(5)} ms`,
      `long tasks=${long.map((d) => d.toFixed(0)).join('+') || 'none'} ms`,
      `largest frame gap=${gap.toFixed(0)} ms`,
    ].join('  '),
  );
}

const until = async (done) => {
  for (let n = 0; n < 600 && !done(); n++) await window.waitForTimeout(25);
};
const copyTime = () => {
  const name = existsSync(recovery)
    ? readdirSync(recovery).find((n) => n.endsWith('.lcp'))
    : undefined;
  return name === undefined ? 0 : statSync(join(recovery, name)).mtimeMs;
};

for (let i = 0; i < 3; i++) {
  await edit();
  await window.waitForTimeout(1500);
  const before = statSync(file).mtimeMs;
  await watch();
  const started = Date.now();
  await window.keyboard.press('Control+s');
  await until(() => statSync(file).mtimeMs !== before);
  await window.waitForTimeout(200);
  await report('save', started);
}
for (let i = 0; i < 3;) {
  const before = copyTime();
  await edit();
  await window.waitForTimeout(800);
  if (copyTime() !== before) continue;
  await watch();
  const started = Date.now();
  await until(() => copyTime() !== before);
  await window.waitForTimeout(200);
  await report('recovery', started);
  i += 1;
}
await app.evaluate(({ BrowserWindow }) => {
  for (const each of BrowserWindow.getAllWindows()) each.destroy();
});
await app.close();
