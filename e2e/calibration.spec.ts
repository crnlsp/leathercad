import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { ONE_PRINTER, fakeCups } from './fakeCups.js';
import { expectNoViolations, launchApp } from './launchApp.js';
import { inkOn, measurePrintTest, openPrintTest } from './printTest.js';

/**
 * 7.5: calibrating a printer from the Print Preview (docs/printing.md §8.2).
 *
 * The fake CUPS of the print tests (`fakeCups.ts`) takes the calibration page
 * and then a corrected print, and what `lp` kept is measured: the page is
 * printed as drawn, and the print after it is larger by exactly what the
 * maker's readings said the printer takes off. Nothing reaches a real printer,
 * so nothing here says a real one prints true.
 */

test.skip(process.platform === 'win32', 'no CUPS on Windows: the preview saves a PDF instead');

/** Each page as poppler reads it: its size in points, and its /Rotate. */
function pagesOf(pdf: string): string[] {
  const info = execFileSync('pdfinfo', ['-f', '1', '-l', '999', pdf], { encoding: 'utf8' });
  const sizes = [...info.matchAll(/^Page\s+\d+ size:\s+(\S+ x \S+)/gm)].map((m) => m[1]!);
  const turns = [...info.matchAll(/^Page\s+\d+ rot:\s+(\d+)/gm)].map((m) => m[1]!);
  return sizes.map((size, i) => `${size} pt, rotated ${turns[i] ?? '?'}`);
}

test('a printer calibrated in the preview prints corrected, and says so, until the correction is removed', async () => {
  const cups = fakeCups(ONE_PRINTER);
  const config = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  const printers = join(config, 'leathercad', 'printers.json');
  const app = await launchApp({
    env: { PATH: `${cups.bin}:${process.env['PATH'] ?? ''}`, XDG_CONFIG_HOME: config },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await openPrintTest(app, window, join(cups.bin, 'unused.pdf'));

    await window.getByTestId('print').click();
    const preview = window.getByTestId('print-preview');
    await expect(preview.getByTestId('print-corrected')).toHaveCount(0);
    await preview.getByTestId('print-calibrate').click();

    // The page goes to this printer on the project's paper, alone, as drawn.
    const step = preview.getByTestId('calibration');
    await expect(step.getByRole('heading')).toHaveText('Calibrate LeatherCAD_Test');
    await expect(step).toContainText(
      'a horizontal line 190 mm long and a vertical line 200 mm long',
    );
    // The page looked at is the calibration page, not the project's sheets (X25),
    // and the dialog's Cancel is the one way out of the step.
    await expect(preview.getByTestId('print-thumb')).toHaveCount(0);
    const page = preview.getByTestId('print-page').locator('canvas');
    await expect(page).toHaveAttribute('data-page', '1');
    await expect.poll(() => page.evaluate(inkOn)).toBeGreaterThan(100);
    await expect(preview.getByRole('button', { name: 'Cancel' })).toHaveCount(1);
    await expect(preview.getByTestId('print-submit')).toHaveCount(0);
    // Nothing measured yet, nothing to save (X24).
    const across = step.getByLabel('Horizontal line, drawn 190 mm');
    const along = step.getByLabel('Vertical line, drawn 200 mm');
    await expect(across).toHaveValue('');
    await expect(along).toHaveValue('');
    await expect(step.getByTestId('calibration-save')).toBeDisabled();
    await expect(step.getByTestId('calibration-result')).toHaveCount(0);
    await expectNoViolations(window, 'the calibration step, empty (R15)');

    // Cancel leaves the step for the preview, as Escape does.
    await preview.getByRole('button', { name: 'Cancel' }).click();
    await expect(step).toHaveCount(0);
    await expect(preview.getByTestId('print-calibrate')).toBeFocused();
    await expect(preview.getByTestId('print-thumb')).toHaveCount(3);
    await preview.getByTestId('print-calibrate').click();

    // Sent from the keys, the focus stays in the step (X19). Back in the step,
    // its page is written again before it can be sent.
    await expect(step.getByTestId('calibration-print')).toBeEnabled();
    await step.getByTestId('calibration-print').focus();
    await window.keyboard.press('Enter');
    await expect(step.getByTestId('calibration-sent')).toHaveText(
      'Sent to LeatherCAD_Test as job LeatherCAD_Test-7.',
    );
    expect(readFileSync(cups.args, 'utf8').trim().split('\n')).toEqual([
      '-d',
      'LeatherCAD_Test',
      '-t',
      'LeatherCAD printer calibration',
      '-n',
      '1',
      '-P',
      '1',
      '-o',
      'media=A4',
      '-o',
      'print-scaling=none',
      '-o',
      'fit-to-page=false',
    ]);
    expect(pagesOf(cups.job)).toEqual(['595.276 x 841.89 pt, rotated 0']);

    await expect(step.getByRole('heading')).toBeFocused();

    // A reading 3 % short is a print setting, and is refused (§8.2).
    await across.fill('184');
    await across.press('Enter');
    await along.fill('200');
    await along.press('Enter');
    await expect(step.getByTestId('calibration-too-far')).toContainText(
      'That much is almost always a print setting, not the printer.',
    );
    await expect(step.getByTestId('calibration-save')).toBeDisabled();

    // A printer half a percent short across the paper, and an eighth long along it.
    await across.fill('189.05');
    await across.press('Enter');
    await along.fill('200.25');
    await along.press('Enter');
    await expect(step.getByTestId('calibration-result')).toHaveText(
      'Sheets sent to this printer will be scaled +0.50% across the paper and -0.12% along it.',
    );
    await step.getByTestId('calibration-save').click();
    await expect(step).toHaveCount(0);
    await expect(preview.getByTestId('print-corrected')).toHaveText(
      'Corrected for this printer: scaled +0.50% across the paper and -0.12% along it.',
    );
    // Not "No scaling" over a print that is scaled.
    await expect(preview.getByTestId('print-no-scaling')).toContainText('100 %, then corrected');

    // Stored for this printer, in the configuration directory — not the project.
    expect(JSON.parse(readFileSync(printers, 'utf8'))).toEqual({
      version: 1,
      corrections: { LeatherCAD_Test: { x: 190 / 189.05, y: 200 / 200.25 } },
    });

    // Print sends the corrected sheets: the gauge 0.5 % longer across.
    const submit = preview.getByTestId('print-submit');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(preview.getByTestId('print-result')).toHaveText(
      'Sent to LeatherCAD_Test as job LeatherCAD_Test-7.',
    );
    const measured = measurePrintTest(cups.job);
    for (const gauge of measured.gauges) {
      expect(Math.abs(gauge.widthMm - (100 * 190) / 189.05)).toBeLessThan(0.2);
    }
    expect(Math.abs(measured.panel.edgeMm - (100 * 190) / 189.05)).toBeLessThan(0.2);

    // Removed, it is gone from the file and the preview.
    await preview.getByTestId('print-remove-correction').click();
    await expect(preview.getByTestId('print-corrected')).toHaveCount(0);
    await expect(preview.getByTestId('print-no-scaling')).toContainText('No scaling');
    expect(JSON.parse(readFileSync(printers, 'utf8'))).toEqual({ version: 1, corrections: {} });
  } finally {
    await closeApp(app);
    rmSync(cups.bin, { recursive: true, force: true });
    if (existsSync(config)) rmSync(config, { recursive: true, force: true });
  }
});
