import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { drawAPanel, freshStateHome, openApp } from './launchApp.js';

/**
 * Slice 8.11: one LeatherCAD at a time.
 *
 * A `.lcp` double-clicked on Linux or Windows while the app runs starts the
 * app again, with the file on its command line. Before 8.11 that was a second
 * process, with a second window: both wrote preferences.json, the last one
 * winning, and the same project could be open and saved in both. Now the
 * second launch hands its line to the running app and ends.
 */

const ROOT = resolve(import.meta.dirname, '..');
const DESKTOP_DIR = resolve(ROOT, 'apps/desktop');
/** The `electron` package's binary, as Playwright starts it. */
const ELECTRON = createRequire(join(DESKTOP_DIR, 'package.json'))('electron') as string;

/** A copy of the sample wallet, under a name the status bar can show. */
function aProject(): string {
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Wallet from Files.lcp');
  copyFileSync(resolve(ROOT, 'fixtures/projects/bifold-wallet.lcp'), project);
  return project;
}

/** How a second launch ended: its exit code, or the signal that ended it, and what it said. */
interface Ended {
  readonly code: number | null;
  readonly signal: string | null;
  readonly output: string;
}

/**
 * Starts the app again, as a file manager does, against the running one's
 * configuration — the lock is its userData directory's — and resolves with
 * how the second process ended; still running after ten seconds, it is
 * ended, with the code null. Its state directory is its own, so a test can
 * see it wrote nothing.
 */
function launchAgain(args: readonly string[], config: string, state: string): Promise<Ended> {
  // Started as Playwright starts the first, without Chromium's sandbox on
  // Linux: a runner whose SUID helper is not set up aborts with SIGTRAP
  // before the app runs a line. A packaged app's sandbox is not this test's.
  const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : [];
  const second = spawn(ELECTRON, ['.', ...sandbox, ...args], {
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_CONFIG_HOME: config, XDG_STATE_HOME: state },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  second.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  second.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  return new Promise((done) => {
    const timer = setTimeout(() => second.kill(), 10_000);
    second.once('exit', (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, output });
    });
  });
}

/** Ended of itself, at once, with nothing wrong — and if not, why not. */
function expectEndedCleanly(ended: Ended): void {
  expect(ended.code, `signal ${String(ended.signal)}; output:\n${ended.output}`).toBe(0);
}

test('a second launch opens its project in the running window, and ends', async () => {
  const config = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  const { app, window } = await openApp({ env: { XDG_CONFIG_HOME: config } });
  try {
    const state = freshStateHome();
    expectEndedCleanly(await launchAgain([aProject()], config, state));
    // It ended before its log's first line: nothing of it is left behind.
    expect(existsSync(join(state, 'leathercad', 'logs', 'main.log'))).toBe(false);

    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.getByTestId('file-path')).toContainText('Wallet from Files');
    expect(app.windows()).toHaveLength(1);
  } finally {
    await closeApp(app);
  }
});

test('a second launch opens beside unsaved work, in a tab of its own (8.12)', async () => {
  const config = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  const { app, window } = await openApp({ env: { XDG_CONFIG_HOME: config } });
  try {
    await drawAPanel(window, { parts: '1' });
    expectEndedCleanly(await launchAgain([aProject()], config, freshStateHome()));

    // Nothing asked, nothing replaced: the drawing keeps its tab.
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.getByTestId('unsaved-dialog')).toHaveCount(0);
    const tabs = window.getByTestId('tab-strip').getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await tabs.first().click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});

test('a second launch naming no project only ends', async () => {
  const config = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  const { app, window } = await openApp({ env: { XDG_CONFIG_HOME: config } });
  try {
    await drawAPanel(window, { parts: '1' });
    expectEndedCleanly(await launchAgain([], config, freshStateHome()));
    // Nothing was asked and nothing changed.
    await expect(window.getByTestId('unsaved-dialog')).toHaveCount(0);
    await expect(window.getByTestId('part-count')).toHaveText('1');
    expect(app.windows()).toHaveLength(1);
  } finally {
    await closeApp(app);
  }
});

test('a LeatherCAD with a configuration of its own is a LeatherCAD of its own', async () => {
  // How every other end-to-end test gets an app of its own: the lock is the
  // configuration directory's, and each is given one.
  const { app } = await openApp();
  const other = await openApp();
  try {
    expect(other.app.windows()).toHaveLength(1);
  } finally {
    await closeApp(other.app);
    await closeApp(app);
  }
});
