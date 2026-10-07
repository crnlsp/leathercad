import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';
import { openPrintTest } from './printTest.js';
import { expectPrintTestTrue, measureVectorFile, readDxf, readSvg } from './vectorFiles.js';

/**
 * 6.2 and 6.5: the print test, exported as an SVG and as a DXF through the app
 * and measured in the file — the panel 100.0 mm, its 25 holes 3.875 mm apart,
 * the strap 275.0 mm.
 *
 * The same fixture, the same measurements as `print-verification.spec.ts`
 * makes on the PDF, but read out of the file's numbers rather than a page's
 * ink: what a laser's software would find. The file is the drawing in the
 * model's own coordinates, so the three pieces the print test lays on top of one
 * another at the board's origin are on top of one another in it, and each is
 * measured by what it is.
 */

test('the print test exports to an SVG that measures true in millimetres', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-6.2-'));
  const svg = join(dir, 'print-test.svg');
  const app = await launchApp();

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    await openPrintTest(app, window, svg);

    // The menu beside Export PDF: SVG is there, and it is the one thing in it.
    await window.getByTestId('export-more').click();
    await expect(window.getByTestId('export-svg')).toBeVisible();
    await expect(window.getByTestId('export-svg')).not.toHaveAttribute('aria-disabled', 'true');
    await window.getByTestId('export-svg').click();

    await expect.poll(() => existsSync(svg), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    // Nothing left off, nothing to check: the file is the drawing whole.
    await expect(window.getByTestId('export-notice')).toHaveCount(0);

    const { facts, primitives } = readSvg(svg);
    await test.info().attach('facts', {
      body: JSON.stringify(facts, null, 2),
      contentType: 'application/json',
    });

    // A page in millimetres, with a viewBox of the same numbers, and no transform.
    expect(facts.viewBox).toBe(`0 0 ${String(facts.widthMm)} ${String(facts.heightMm)}`);
    expect(facts.widthMm).toBeCloseTo(275, 3);
    expect(facts.hasTransform).toBe(false);
    expect(facts.hasFont).toBe(false);
    expect(facts.hasCarriageReturn).toBe(false);
    expect(facts.groups).toEqual(['cut', 'stitch', 'stitch-holes', 'annotation']);

    const measured = measureVectorFile(primitives);
    await test.info().attach('measurements', {
      body: JSON.stringify(measured, null, 2),
      contentType: 'application/json',
    });
    expectPrintTestTrue(measured);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the print test exports to a DXF that measures true in millimetres', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-6.5-'));
  const dxf = join(dir, 'print-test.dxf');
  const app = await launchApp();

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    await openPrintTest(app, window, dxf);

    await window.getByTestId('export-more').click();
    await expect(window.getByTestId('export-dxf')).toBeVisible();
    await expect(window.getByTestId('export-dxf')).not.toHaveAttribute('aria-disabled', 'true');
    await window.getByTestId('export-dxf').click();

    await expect.poll(() => existsSync(dxf), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    await expect(window.getByTestId('export-notice')).toHaveCount(0);

    const { facts, primitives } = readDxf(dxf);
    await test.info().attach('facts', {
      body: JSON.stringify(facts, null, 2),
      contentType: 'application/json',
    });

    // R12, and said to be millimetres and metric where an importer looks.
    expect(facts.version).toBe('AC1009');
    expect(facts.units).toBe(4);
    expect(facts.measurement).toBe(1);
    expect(facts.crLfOnly).toBe(true);
    expect(facts.ascii).toBe(true);
    // The layers are the SVG's groups.
    expect(facts.layers).toEqual(['cut', 'stitch', 'stitch-holes', 'annotation']);

    const measured = measureVectorFile(primitives);
    await test.info().attach('measurements', {
      body: JSON.stringify(measured, null, 2),
      contentType: 'application/json',
    });
    expectPrintTestTrue(measured);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the export menu offers nothing to export when nothing is drawn, and says why', async () => {
  const app = await launchApp();
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    await window.getByTestId('export-more').click();
    const svg = window.getByTestId('export-svg');
    await expect(svg).toHaveAttribute('aria-disabled', 'true');
    const dxf = window.getByTestId('export-dxf');
    await expect(dxf).toHaveAttribute('aria-disabled', 'true');
    // Two items refused for one reason say it once, under the last of them (8.8), and the
    // first points to it.
    await expect(dxf).toContainText('Nothing to export yet');
    await expect(svg).toHaveAttribute('aria-describedby', 'export-dxf-why');
  } finally {
    await closeApp(app);
  }
});

for (const format of ['svg', 'dxf'] as const) {
  test(`${format.toUpperCase()} says what did not make it into the file, as the PDF says what is not on paper`, async () => {
    // Nothing blocks, but a feature that failed to build is not in the file, and
    // a maker cutting from it has no way to know it was ever meant to be there.
    const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-omitted-'));
    const file = join(dir, `omitted.${format}`);
    const app = await launchApp();

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState('domcontentloaded');
      await expect(window.getByTestId('app-version')).not.toBeEmpty();
      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      }, file);

      const box = (await window.getByTestId('editor-canvas').boundingBox())!;
      await window.getByTestId('tool-rectangle').click();
      await window.mouse.move(box.x + 250, box.y + 250);
      await window.mouse.down();
      await window.mouse.move(box.x + 550, box.y + 450, { steps: 5 });
      await window.mouse.up();

      const panel = window.getByTestId('property-panel');
      await panel.getByTestId('add-stitch-line').click();
      await window.getByTestId('parts-list').getByText('Stitch line').click();
      const inset = panel.locator('label', { hasText: /^Edge margin/ }).locator('input');
      await inset.fill('60');
      await inset.press('Enter');

      await window.getByTestId('export-more').click();
      await window.getByTestId(`export-${format}`).click();
      await expect.poll(() => existsSync(file), { timeout: 10_000 }).toBe(true);

      const notice = window.getByTestId('export-notice');
      await expect(notice).toBeVisible();
      await expect(notice.getByTestId('export-omitted')).toContainText('Stitch line');
      await expect(notice.getByTestId('export-omitted')).toContainText('not in the file');
      await expect(notice.getByTestId('export-counts')).toContainText('in the file');
      await expect(notice).toContainText(
        `${format.toUpperCase()} exported, with something to check`,
      );
      await expect(notice).not.toContainText('PDF');
      await expect(notice.getByTestId('export-tiled')).toHaveCount(0);

      // What did build is in it: the outline, and not the stitch line that failed.
      const layers = format === 'svg' ? readSvg(file).facts.groups : readDxf(file).facts.layers;
      expect(layers).toEqual(['cut', 'annotation']);
    } finally {
      await closeApp(app);
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
