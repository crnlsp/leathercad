import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { withApp } from './launchApp.js';
import { inkOn } from './printTest.js';

/**
 * PERF-002: the PDF is written in a worker, so a long pattern does not freeze
 * the window, and a file nobody wants any more is never delivered.
 *
 * The long strap (5.8 m, 33 A4 sheets) took the renderer's main thread about
 * half a second to write, with no frame painted and no click answered. These
 * run the real app, built, with the PDF worker loading from app://leathercad
 * under its content security policy. That the file is still 1:1 is measured by
 * `print-verification.spec.ts` and the packaged smoke test, which export the
 * print test through the same worker and rasterise it with poppler.
 */

const STRAP = resolve(import.meta.dirname, '../fixtures/perf/strap-5800.lcp');

/** Records every PDF writer the page starts: when it was ended, and whether it ever answered. */
async function watchWriters(window: Page): Promise<void> {
  await window.evaluate(() => {
    const w = window as unknown as {
      Worker: typeof Worker;
      __writers: Array<{ ended: boolean; replies: number }>;
    };
    const Native = w.Worker;
    w.__writers = [];
    w.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        // pdf.js starts workers of its own, from another file.
        if (!/pdfWorker-/.test(String(url))) return;
        const record = { ended: false, replies: 0 };
        w.__writers.push(record);
        this.addEventListener('message', () => (record.replies += 1));
        const terminate = this.terminate.bind(this);
        this.terminate = () => {
          record.ended = true;
          terminate();
        };
      }
    };
  });
}

const writers = (window: Page) =>
  window.evaluate(
    () =>
      (window as unknown as { __writers: Array<{ ended: boolean; replies: number }> }).__writers,
  );

test('the window keeps painting while the long strap is exported', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-pdf-worker-'));
  const pdf = join(dir, 'strap.pdf');
  try {
    await withApp(
      async (window, app) => {
        await expect(window.getByTestId('part-count')).toHaveText('1');
        await app.evaluate(({ dialog, shell }, target) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
          shell.openPath = async () => '';
        }, pdf);

        // The longest time between two animation frames from the click to the
        // file: the longest the window could not paint or answer a click.
        await window.evaluate(() => {
          const w = window as unknown as { __gap: number; __watching: boolean };
          w.__gap = 0;
          w.__watching = true;
          let last = performance.now();
          const frame = (now: number): void => {
            w.__gap = Math.max(w.__gap, now - last);
            last = now;
            if (w.__watching) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });

        await window.getByTestId('export-pdf').click();
        await expect.poll(() => existsSync(pdf), { timeout: 30_000 }).toBe(true);
        await expect(window.getByTestId('export-notice')).toBeVisible();
        const gap = await window.evaluate(() => {
          const w = window as unknown as { __gap: number; __watching: boolean };
          w.__watching = false;
          return w.__gap;
        });

        // About 510–560 ms before the worker, measured with tools/perf-pdf.mjs;
        // a few milliseconds with it. The bound leaves room for a loaded runner
        // and still fails if the main thread writes the file again.
        expect(gap, `longest gap between frames: ${gap.toFixed(0)} ms`).toBeLessThan(200);
        expect(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' })).toMatch(/Pages:\s+33\b/);
      },
      { args: [STRAP] },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('closing the Print Preview mid-write ends the writer, and nothing is delivered', async () => {
  await withApp(
    async (window) => {
      await expect(window.getByTestId('part-count')).toHaveText('1');
      await watchWriters(window);

      await window.getByTestId('print').click();
      await expect.poll(async () => (await writers(window)).length).toBe(1);
      await window.keyboard.press('Escape');
      await expect(window.getByTestId('print-preview')).toHaveCount(0);
      await expect.poll(async () => (await writers(window))[0]?.ended).toBe(true);

      // Proving something did not happen: a writer left running would answer
      // within a second (about half a second of work), so wait that long.
      await window.waitForTimeout(1500);
      expect(await writers(window)).toEqual([{ ended: true, replies: 0 }]);
      await expect(window.getByTestId('print-preview')).toHaveCount(0);
      await expect(window.getByTestId('file-error')).toHaveCount(0);
    },
    { args: [STRAP] },
  );
});

test('changing the paper mid-write ends that writer, and only the new plan is shown', async () => {
  await withApp(
    async (window) => {
      await expect(window.getByTestId('part-count')).toHaveText('1');
      await watchWriters(window);

      await window.getByTestId('print').click();
      await expect.poll(async () => (await writers(window)).length).toBe(1);
      await window.getByTestId('print-paper').selectOption('A3');

      const preview = window.getByTestId('print-preview');
      await expect(preview.getByTestId('print-summary')).toContainText('of A3');
      const sheets = Number(
        /(\d+) sheets/.exec((await preview.getByTestId('print-summary').textContent()) ?? '')?.[1],
      );
      expect(sheets).toBeGreaterThan(1);
      expect(sheets).toBeLessThan(33);

      // The PDF drawn is the A3 plan's: its sheets, with ink on the first.
      await expect(preview.getByTestId('print-thumb')).toHaveCount(sheets);
      await expect
        .poll(() => preview.getByTestId('print-page').locator('canvas').evaluate(inkOn))
        .toBeGreaterThan(1000);

      const all = await writers(window);
      expect(all[0], 'the writer for A4 was ended before it answered').toEqual({
        ended: true,
        replies: 0,
      });
      expect(all.at(-1)?.replies, 'the writer for A3 answered once').toBe(1);
    },
    { args: [STRAP] },
  );
});

test('a writer that cannot start is reported, and no file is left behind', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-pdf-worker-'));
  const pdf = join(dir, 'never.pdf');
  try {
    await withApp(
      async (window, app) => {
        await expect(window.getByTestId('part-count')).toHaveText('1');
        await app.evaluate(({ dialog, shell }, target) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
          shell.openPath = async () => '';
        }, pdf);
        await window.evaluate(() => {
          window.Worker = class {
            constructor() {
              throw new Error('blocked');
            }
          } as unknown as typeof Worker;
        });

        await window.getByTestId('export-pdf').click();

        const error = window.getByTestId('file-error');
        await expect(error).toContainText('The PDF couldn’t be written');
        await expect(error).toContainText('Nothing was saved.');
        expect(existsSync(pdf)).toBe(false);
        expect(readdirSync(dir)).toEqual([]);
      },
      { args: [STRAP] },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
