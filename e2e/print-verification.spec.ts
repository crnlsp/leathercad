import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { expectAccurate, exportPrintTest, measurePrintTest } from './printTest.js';

/**
 * 7.7, the automated half: the print test, exported through the app, measured
 * on the page.
 *
 * The project is `fixtures/projects/print-test.lcp` — a rounded panel with its
 * width dimensioned and a stitch line all round, a card pocket with a thumb
 * scoop stitched on three sides, and a 250 mm strap tiled over two sheets. The
 * PDF is the one the Export button writes, and every number below is read off
 * poppler's rendering of it. The same measurement runs against the packaged
 * app in `e2e/packaged/packaged.spec.ts`.
 *
 * Passing is not 7.7. A printer, its driver and a viewer that defaults to
 * "fit to page" all stand between this file and the paper; that half is
 * measured with a steel rule and recorded in `docs/print-verification-log.md`.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

test('the print test measures true on every sheet: square, ruler, dimension, holes and tiles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-7.7-'));
  const pdf = join(dir, 'print-test.pdf');
  const app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    await exportPrintTest(app, window, pdf);
    const measured = measurePrintTest(pdf);
    await test.info().attach('measurements', {
      body: JSON.stringify(measured, null, 2),
      contentType: 'application/json',
    });
    expectAccurate(measured);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
