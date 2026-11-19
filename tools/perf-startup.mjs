#!/usr/bin/env node
/**
 * PERF-018: the packaged app's startup and idle cost.
 *   node tools/perf-startup.mjs [label] [--runs 5] [--idle 60] [--executable <path>]
 *   node tools/perf-startup.mjs [label] --plain [--runs 5] --executable <path>
 *
 * Package first: `pnpm package:e2e`, the unpacked app with the one fuse Playwright needs (the
 * inspector); `--executable` names another. Each launch is a fresh profile opening a copy of the
 * sample wallet, with the update check pointed at a closed port. The first launch is **cold**: on
 * Linux every file of the app is dropped from the page cache first (`dd iflag=nocache`, no root
 * needed — the system's own libraries stay cached); elsewhere it is only the first launch of the
 * run, which the record says. The rest are warm. Each reports, from the moment before the
 * process is started:
 *
 *   firstFrame   the renderer's first paint (`first-paint`, read after the fact, so exact)
 *   version      the status bar showing the app's version: the project open and the bridge up
 *                (polled each frame, so up to a frame late)
 *   rss          every process's resident memory 10 s after the version shows, summed, by type
 *   cpu          every process's CPU time over the next `--idle` seconds, as a share of one core
 *   frames       animation callbacks and board paints in the same idle window
 *
 * `--plain` starts the binary without Playwright — no inspector, so it runs the shipped fuses —
 * with `--remote-debugging-port`, and reads only the first paint over the DevTools protocol: how
 * far the instrumented launch is from the shipped one (PERF-018's *Find out first*).
 *
 * On Linux run it as `pnpm hidden-screen node tools/perf-startup.mjs`, never on the desktop.
 */
/* global document */
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { cpus, loadavg, release, tmpdir, type } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { _electron as electron, chromium } from '@playwright/test';

import { installFrameCounter } from '../e2e/frameCount.ts';
import { packagedExecutable } from '../e2e/packagedApp.ts';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args.splice(at, 2)[1];
};
const executable = resolve(option('--executable', packagedExecutable()));
const runs = Number(option('--runs', '5'));
const idleSeconds = Number(option('--idle', '60'));
const plain = args.includes('--plain');
const label = args.find((a) => !a.startsWith('--')) ?? 'run';
const VERSION = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8')).version;

/** Linux: drops the app's own files from the page cache, so the next launch reads the disk. */
function evict(dir) {
  if (process.platform !== 'linux') return false;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    if (statSync(file).size > 0) execFileSync('dd', [`if=${file}`, 'iflag=nocache', 'count=0'], { stdio: 'ignore' });
  }
  return true;
}

function profile() {
  const home = mkdtempSync(join(tmpdir(), 'lc-perf-startup-'));
  const project = join(home, 'Wallet.lcp');
  copyFileSync(resolve(root, 'fixtures/projects/bifold-wallet.lcp'), project);
  return {
    home,
    project,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: join(home, 'config'),
      XDG_STATE_HOME: join(home, 'state'),
      LEATHERCAD_RELEASES_URL: 'http://127.0.0.1:9/',
    },
  };
}

/** The renderer's first paint, as a wall-clock time. */
const firstPaint = (page) =>
  page.waitForFunction(
    () => {
      const paint = performance.getEntriesByName('first-paint')[0];
      return paint === undefined ? false : performance.timeOrigin + paint.startTime;
    },
    undefined,
    { polling: 50, timeout: 60_000 },
  );

const metrics = (app) =>
  app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().map((m) => ({
      type: m.type,
      kib: m.memory.workingSetSize,
      cpu: m.cpu.cumulativeCPUUsage ?? 0,
    })),
  );

async function instrumented(cache) {
  const { home, project, env } = profile();
  const started = Date.now();
  const app = await electron.launch({
    executablePath: executable,
    args: [project],
    // The unpacked app's chrome-sandbox is not setuid; the packaged smoke test says why.
    chromiumSandbox: false,
    env,
  });
  try {
    const window = await app.firstWindow();
    const shown = await (
      await window.waitForFunction(
        (version) =>
          document.querySelector('[data-testid="app-version"]')?.textContent === version &&
          performance.timeOrigin + performance.now(),
        VERSION,
        { polling: 'raf', timeout: 60_000 },
      )
    ).jsonValue();
    const paint = await (await firstPaint(window)).jsonValue();
    await window.waitForTimeout(Math.max(0, shown + 10_000 - Date.now()));
    const settled = await metrics(app);
    const counts = await installFrameCounter(window);
    const before = await metrics(app);
    await window.waitForTimeout(idleSeconds * 1000);
    const after = await metrics(app);
    const frames = await counts.evaluate((c) => ({ ...c }));
    const rss = {};
    for (const m of settled) rss[m.type] = (rss[m.type] ?? 0) + m.kib / 1024;
    const cpuSeconds = (list) => list.reduce((sum, m) => sum + m.cpu, 0);
    return {
      cache,
      firstFrameMs: Math.round(paint - started),
      versionMs: Math.round(shown - started),
      rssMiB: Number(Object.values(rss).reduce((a, b) => a + b, 0).toFixed(1)),
      rssByTypeMiB: Object.fromEntries(Object.entries(rss).map(([k, v]) => [k, Number(v.toFixed(1))])),
      // cumulativeCPUUsage is CPU seconds since each process started.
      idleCpuPercent: Number(
        (((cpuSeconds(after) - cpuSeconds(before)) / idleSeconds) * 100).toFixed(2),
      ),
      idleSeconds,
      idleFrames: frames,
    };
  } finally {
    // As in the other perf tools: a plain close waits for the debugger to let go.
    app.process().kill('SIGKILL');
    rmSync(home, { recursive: true, force: true, maxRetries: 5 });
  }
}

async function uninstrumented(cache) {
  const { home, project, env } = profile();
  const started = Date.now();
  const child = spawn(executable, ['--no-sandbox', '--remote-debugging-port=0', project], {
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    const endpoint = await new Promise((done, fail) => {
      let text = '';
      child.stderr.on('data', (chunk) => {
        text += chunk;
        const found = /DevTools listening on (ws:\/\/\S+)/.exec(text);
        if (found) done(found[1]);
      });
      child.once('exit', (code) => fail(new Error(`exited ${code} before DevTools:\n${text}`)));
    });
    const browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.waitForEvent('page'));
    const paint = await (await firstPaint(page)).jsonValue();
    return { cache, firstFrameMs: Math.round(paint - started) };
  } finally {
    child.kill('SIGKILL');
    rmSync(home, { recursive: true, force: true, maxRetries: 5 });
  }
}

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();
console.log(
  JSON.stringify({
    label,
    mode: plain ? 'plain' : 'instrumented',
    executable: relative(root, executable),
    version: VERSION,
    commit: git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain') ? ' + changes' : ''),
    cpu: `${cpus()[0]?.model.trim()} × ${cpus().length}`,
    os: `${type()} ${release()} ${process.arch}`,
    load: loadavg().map((l) => l.toFixed(2)).join(' '),
  }),
);
for (let run = 0; run < runs; run++) {
  const cache = run > 0 ? 'warm' : evict(dirname(executable)) ? 'cold' : 'first';
  const result = await (plain ? uninstrumented : instrumented)(cache);
  console.log(JSON.stringify({ label, run: run + 1, ...result }));
}
process.exit(0);
