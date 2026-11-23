import { expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { expectNoViolations, launchApp, withApp } from './launchApp.js';
import { chooseSvg } from './svgPatterns.js';
import { expectFeatures, expectPieces } from './counts.js';

/**
 * 9.20b: an SVG pattern imported through its preview — the pieces, their size
 * and scale, what the drawing left out — as one undo step, into the open
 * project or a new one. The file is parsed by the renderer's own parser
 * (ADR 0023), which only the real app has.
 */

const dialog = (window: Page) => window.getByTestId('svg-import-dialog');
const tabs = (window: Page) => window.getByTestId('tab-strip').getByRole('tab');

async function importSvg(window: Page): Promise<void> {
  await window.getByTestId('project-menu').click();
  await window.getByTestId('import-svg').click();
  await expect(dialog(window)).toBeVisible();
}

test('a card holder imports as one piece with its cut-out and a marking, its holes reported, at true size, one undo step (9.20b)', async () => {
  await withApp(async (window, app) => {
    await chooseSvg(app, 'cardHolder');
    await importSvg(window);

    await expect(dialog(window).getByRole('heading')).toHaveText('Import cardHolder');
    await expect(dialog(window).getByTestId('svg-import-size')).toHaveText('100.0 × 60.0 mm');
    await expect(dialog(window)).toContainText('From the file’s own units');
    await expect(dialog(window).getByTestId('svg-import-pieces')).toHaveText('1 piece');
    await expect(dialog(window).getByTestId('svg-import-contents')).toHaveText(
      '1 cut-out and 1 marking',
    );
    await expect(dialog(window).getByTestId('svg-import-holes')).toContainText(
      '12 small circles in a row, 1.2 mm across',
    );
    await expect(dialog(window).getByTestId('svg-import-left-out')).toContainText(
      '1 piece of text',
    );
    await expectNoViolations(window, 'the SVG import preview');

    await dialog(window).getByTestId('svg-import-open').click();
    await expect(dialog(window)).toHaveCount(0);
    await expectPieces(window, '1');
    await expectFeatures(window, '3');
    await expect(window.getByTestId('parts-list')).toContainText('cardHolder');
    await expect(window.getByTestId('print-problems')).toHaveAttribute('data-state', 'clear');
    // Into an empty project it stays where the file drew it: its top-left
    // corner at the origin, so 60 mm tall below it, Y up.
    const position = window.getByTestId('property-panel').getByTestId('position-fields');
    await window.getByTestId('parts-list').locator('[data-testid^="feature-row-"]').first().click();
    await expect(position.getByLabel('Left')).toHaveValue('0');
    await expect(position.getByLabel('Bottom')).toHaveValue('−60');

    await window.getByTestId('undo').click();
    await expectPieces(window, '0');
  });
});

test('layers named fold and stitch decide over the shape rule, and Import can start a new project (9.20b)', async () => {
  // From the start screen: no project is open to import into.
  const app = await launchApp({ startScreen: true });
  try {
    const window = await app.firstWindow();
    await chooseSvg(app, 'layered');
    await importSvg(window);
    await expect(dialog(window).getByTestId('svg-import-open')).toHaveCount(0);
    await expect(dialog(window).getByTestId('svg-import-contents')).toHaveText(
      '1 stitch line and 1 fold',
    );
    await dialog(window).getByTestId('svg-import-new').click();

    await expect(tabs(window)).toHaveCount(1);
    await expectPieces(window, '1');
    await expect(window.getByTestId('parts-list')).toContainText('Stitch line');
    await expect(window.getByTestId('parts-list')).toContainText('Fold (valley)');
    await window.getByTestId('undo').click();
    await expectPieces(window, '0');
  } finally {
    await closeApp(app);
  }
});

test('a drawing with no unit asks how many pixels to the inch, and imports nothing until told (9.20b)', async () => {
  await withApp(async (window, app) => {
    await chooseSvg(app, 'unitless');
    await importSvg(window);
    await expect(dialog(window).getByTestId('svg-import-open')).toBeDisabled();
    await expect(dialog(window).getByTestId('svg-import-size')).toHaveCount(0);

    await dialog(window).getByTestId('svg-import-density-96').check();
    await expect(dialog(window).getByTestId('svg-import-size')).toHaveText('25.4 × 25.4 mm');
    await dialog(window).getByTestId('svg-import-density-72').check();
    await expect(dialog(window).getByTestId('svg-import-size')).toHaveText('33.9 × 33.9 mm');

    await window.keyboard.press('Escape');
    await expect(dialog(window)).toHaveCount(0);
    await expectPieces(window, '0');
  });
});

test('a file that is not an SVG drawing is refused, and nothing changes (9.20b)', async () => {
  await withApp(async (window, app) => {
    await chooseSvg(app, 'broken');
    await window.getByTestId('project-menu').click();
    await window.getByTestId('import-svg').click();
    await expect(window.getByTestId('file-notice')).toContainText(
      'This file could not be read as an SVG drawing.',
    );
    await expectPieces(window, '0');
  });
});
