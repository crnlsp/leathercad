import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';
import {
  expectAssemblyAccurate,
  exportPrintTestAssembly,
  measurePrintTestAssembly,
} from './printTestAssembly.js';
import { expectAccurate, exportPrintTest, measurePrintTest } from './printTest.js';

/**
 * 7.7, the automated half: the print test, exported through the app, measured
 * on the page.
 *
 * The project is `fixtures/projects/print-test.lcp` — a rounded panel with its
 * width dimensioned and a stitch line all round, a card pocket with a thumb
 * scoop stitched on three sides, and a 275 mm strap tiled over two sheets. The
 * PDF is the one the Export button writes, and every number below is read off
 * poppler's rendering of it. The same measurement runs against the packaged
 * app in `e2e/packaged/packaged.spec.ts`.
 *
 * Passing is not 7.7. A printer, its driver and a viewer that defaults to
 * "fit to page" all stand between this file and the paper; that half is
 * measured with a steel rule and recorded in `docs/print-verification-log.md`.
 */

test('the print test measures true on every sheet: gauge, dimension, holes and tiles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-7.7-'));
  const pdf = join(dir, 'print-test.pdf');
  const app = await launchApp();

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

/**
 * R11: what 1.6 added to paper - a row of 4 mm holes 25 mm apart, and a 300 mm
 * panel taped 2 x 2 behind an assembly map - measured on the page, as above.
 * The paper half is checks I to M in `docs/print-verification-log.md`.
 */
test('the assembly print test measures true: a hole row, and a panel taped 2 x 2', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-r11-'));
  const pdf = join(dir, 'print-test-assembly.pdf');
  const app = await launchApp();

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    await exportPrintTestAssembly(app, window, pdf);
    const measured = measurePrintTestAssembly(pdf);
    await test.info().attach('measurements', {
      body: JSON.stringify(measured, null, 2),
      contentType: 'application/json',
    });
    expectAssemblyAccurate(measured);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
