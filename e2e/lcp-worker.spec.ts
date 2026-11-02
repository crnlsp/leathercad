import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { drawAPanel, freshStateHome, openApp, withApp } from './launchApp.js';

/**
 * PERF-009: a project is made into its file in a worker, so saving a large
 * one, or writing its recovery copy, no longer stops the window.
 *
 * Forty traced outlines of 500 points each (`fixtures/perf/traced-40x500.lcp`,
 * the audit's path-heavy project) took the window's thread 100–140 ms to
 * encode, with nothing painted and no click answered, for each save and each
 * copy. The window falls back to encoding on its own thread when no worker
 * can be had, so that a save is never lost to a missing one; these are what
 * would see a worker that does not start in the built app.
 */

const PROJECT = resolve(import.meta.dirname, '../fixtures/perf/traced-40x500.lcp');

/** Counts the files the `.lcp` worker makes: each answer from a worker started from its script. */
async function countEncoded(window: Page): Promise<void> {
  await window.evaluate(() => {
    const w = window as unknown as { Worker: typeof Worker; __encoded: number };
    const Native = w.Worker;
    w.__encoded = 0;
    w.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (/lcpWorker-/.test(String(url))) {
          this.addEventListener('message', () => (w.__encoded += 1));
        }
      }
    };
  });
}

const encoded = (window: Page) =>
  window.evaluate(() => (window as unknown as { __encoded: number }).__encoded);

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-lcp-worker-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('a large project is saved by the worker, and opens again as it was saved', async () => {
  const file = join(dir, 'Traced.lcp');
  copyFileSync(PROJECT, file);
  const before = statSync(file).size;

  const { app, window } = await openApp({ args: [file] });
  try {
    await expect(window.getByTestId('part-count')).toHaveText('40');
    await countEncoded(window);
    await drawAPanel(window, { parts: '41' });

    await window.keyboard.press('Control+s');

    await expect.poll(() => statSync(file).size).not.toBe(before);
    expect(await encoded(window)).toBe(1);
  } finally {
    await closeApp(app);
  }

  await withApp(
    async (window) => {
      await expect(window.getByTestId('part-count')).toHaveText('41');
    },
    { args: [file] },
  );
});

test('a large project’s recovery copy is made by the worker', async () => {
  const state = freshStateHome();
  const file = join(dir, 'Traced.lcp');
  copyFileSync(PROJECT, file);
  const recovery = join(state, 'leathercad', 'recovery');
  const copies = () =>
    existsSync(recovery) ? readdirSync(recovery).filter((name) => name.endsWith('.lcp')) : [];

  // A copy every quarter second, so the test need not wait a minute for one.
  const { app, window } = await openApp({
    args: [file],
    state,
    env: { LEATHERCAD_RECOVERY_INTERVAL_MS: '250' },
  });
  try {
    await expect(window.getByTestId('part-count')).toHaveText('40');
    await countEncoded(window);
    await drawAPanel(window, { parts: '41' });

    await expect.poll(copies).toHaveLength(1);
    expect(await encoded(window)).toBeGreaterThanOrEqual(1);
  } finally {
    await closeApp(app);
    rmSync(state, { recursive: true, force: true });
  }
});
