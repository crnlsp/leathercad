#!/usr/bin/env node
/**
 * PERF-018: the backlog's two-hour soak on the packaged app.
 *   node tools/perf-soak.mjs [label] [--minutes 120] [--every 10] [--project <file.lcp>]
 *                            [--executable <path>]
 *
 * Package first (`pnpm package:e2e`). One app, one fresh profile, for the whole run. A cycle is
 * what a working session does to the app, back to the start screen each time:
 *
 *   open     a fresh copy of the project (default `fixtures/perf/bag-50.lcp`, fifty straps)
 *   edit     a panel drawn on Design; undo it, redo it
 *   save     Ctrl+S, waited for on disk
 *   views    Sheets, then Design
 *   preview  the Print Preview, until its page is drawn; closed
 *   close    the tab
 *   New      a new project, a panel drawn in it, closed without saving
 *
 * The project is copied again each cycle, so every cycle does the same work. Every `--every`
 * minutes, and once before the first cycle, at the start screen — everything closed — it records
 * the renderer's heap after two full collections, its DOM nodes, documents and listeners, and every
 * process's resident memory: what the app keeps as it is used. A cycle's duration is printed with
 * each sample (the last cycle's, and the median since the last sample) as a sign of slowing.
 *
 * On Linux run it as `pnpm hidden-screen node tools/perf-soak.mjs`, never on the desktop.
 */
/* global document */
import { copyFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { cpus, loadavg, release, tmpdir, type } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import { _electron as electron } from '@playwright/test';

import { packagedExecutable } from '../e2e/packagedApp.ts';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args.splice(at, 2)[1];
};
const executable = resolve(option('--executable', packagedExecutable()));
const source = resolve(option('--project', resolve(root, 'fixtures/perf/bag-50.lcp')));
const minutes = Number(option('--minutes', '120'));
const every = Number(option('--every', '10'));
const label = args.find((a) => !a.startsWith('--')) ?? 'run';

const home = mkdtempSync(join(tmpdir(), 'lc-perf-soak-'));
const project = join(home, 'Soak.lcp');
const app = await electron.launch({
  executablePath: executable,
  args: [
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
  ],
  chromiumSandbox: false,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: join(home, 'config'),
    XDG_STATE_HOME: join(home, 'state'),
    LEATHERCAD_RELEASES_URL: 'http://127.0.0.1:9/',
  },
});
const window = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000),
);
await app.evaluate(({ dialog }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
}, project);
await window.getByTestId('start-screen').waitFor();
const cdp = await window.context().newCDPSession(window);

const byId = (id) => window.getByTestId(id);
const canvas = byId('editor-canvas');
async function drawPanel() {
  const count = byId('part-count');
  const before = await count.textContent();
  await byId('tool-rectangle').click();
  const box = await canvas.boundingBox();
  await window.mouse.move(box.x + 120, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(box.x + 200, box.y + 230, { steps: 3 });
  await window.mouse.up();
  await window.keyboard.press('Escape');
  await window.waitForFunction(
    (was) => document.querySelector('[data-testid="part-count"]')?.textContent !== was,
    before,
  );
}

async function cycle() {
  copyFileSync(source, project);
  await window.keyboard.press('ControlOrMeta+o');
  await byId('part-count').waitFor();

  await drawPanel();
  const drawn = await byId('part-count').textContent();
  await window.keyboard.press('ControlOrMeta+z');
  await window.waitForFunction(
    (was) => document.querySelector('[data-testid="part-count"]')?.textContent !== was,
    drawn,
  );
  await window.keyboard.press('ControlOrMeta+Shift+z');
  await window.waitForFunction(
    (was) => document.querySelector('[data-testid="part-count"]')?.textContent === was,
    drawn,
  );

  const saved = statSync(project).mtimeMs;
  await window.keyboard.press('ControlOrMeta+s');
  while (statSync(project).mtimeMs === saved) await window.waitForTimeout(20);

  await byId('view-sheets').click();
  await window.waitForTimeout(300);
  await byId('view-design').click();

  await byId('print').click();
  await window.waitForFunction(
    () => (document.querySelector('[data-testid="print-page"] canvas')?.width ?? 300) !== 300,
    undefined,
    { timeout: 60_000 },
  );
  await window.keyboard.press('Escape');
  await byId('print-preview').waitFor({ state: 'detached' });

  // Saved a moment ago, so it closes without asking.
  await window.keyboard.press('ControlOrMeta+w');
  await byId('start-screen').waitFor();

  await byId('start-new').click();
  await drawPanel();
  await window.keyboard.press('ControlOrMeta+w');
  await byId('unsaved-discard').click();
  await byId('start-screen').waitFor();
}

async function sample(cycles, durations) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  const processes = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().map((m) => ({ type: m.type, kib: m.memory.workingSetSize })),
  );
  const rss = {};
  for (const p of processes) rss[p.type] = Number(((rss[p.type] ?? 0) + p.kib / 1024).toFixed(1));
  const sorted = [...durations].sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      label,
      minute: Math.round((Date.now() - started) / 60_000),
      cycles,
      heapMiB: Number((usedSize / 2 ** 20).toFixed(2)),
      ...dom,
      processes: processes.length,
      rssMiB: Number(
        Object.values(rss)
          .reduce((a, b) => a + b, 0)
          .toFixed(1),
      ),
      rssByTypeMiB: rss,
      lastCycleMs: durations.at(-1) ?? null,
      medianCycleMs: sorted.length === 0 ? null : sorted[sorted.length >> 1],
      load: loadavg()[0].toFixed(2),
    }),
  );
}

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();
console.log(
  JSON.stringify({
    label,
    project: source.slice(root.length + 1),
    minutes,
    every,
    commit:
      git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain') ? ' + changes' : ''),
    cpu: `${cpus()[0]?.model.trim()} × ${cpus().length}`,
    os: `${type()} ${release()} ${process.arch}`,
    runtime: await app.evaluate(() => process.versions),
  }),
);
const started = Date.now();
let cycles = 0;
let durations = [];
await sample(0, durations);
let next = started + every * 60_000;
try {
  while (Date.now() < started + minutes * 60_000) {
    const begun = Date.now();
    await cycle();
    cycles += 1;
    durations.push(Date.now() - begun);
    if (Date.now() >= next) {
      await sample(cycles, durations);
      durations = [];
      next += every * 60_000;
    }
  }
  await sample(cycles, durations);
} finally {
  app.process().kill('SIGKILL');
  rmSync(home, { recursive: true, force: true, maxRetries: 5 });
}
process.exit(0);
