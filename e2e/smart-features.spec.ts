import { expect, test, type Locator, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

/**
 * Smart Features in the app (docs/smart-features.md §6): only what needs the
 * interface. Which diagnostics each design gets is settled by the scenarios in
 * tests/smart-features; here, that drawing asks for no purpose, that *Holds*
 * appears where it applies, and that a stated requirement's warning comes and
 * goes in Properties and Problems as the maker edits.
 */

async function drawRectangles(window: Page, corners: readonly [number, number, number, number][]) {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.getByTestId('tool-rectangle').click();
  for (const [x0, y0, x1, y1] of corners) {
    await window.mouse.move(box.x + x0, box.y + y0);
    await window.mouse.down();
    await window.mouse.move(box.x + x1, box.y + y1, { steps: 5 });
    await window.mouse.up();
  }
}

async function enter(field: Locator, value: string) {
  await field.fill(value);
  await field.press('Enter');
  await expect(field).toHaveValue(value);
}

test('SF-UI1 · shapes drawn with no purpose are asked for none and told nothing', async () => {
  const { app, window } = await openApp({ size: [1440, 900] });
  try {
    await drawRectangles(window, [
      [80, 120, 260, 240],
      [320, 120, 500, 240],
      [80, 300, 260, 420],
      [320, 300, 500, 420],
    ]);
    await expect(window.getByTestId('part-count')).toHaveText('4');
    const panel = window.getByTestId('property-panel');
    const verdict = window.getByTestId('problems-verdict');
    await expect(verdict).toHaveText('Nothing to fix.');

    // The last one drawn is selected: its size and place, nothing about purpose.
    await expect(panel.getByLabel('Width')).toBeVisible();
    await expect(panel.getByTestId('pocket-reading')).toHaveCount(0);
    await expect(panel.getByTestId('pocket-requirement')).toHaveCount(0);

    // Stitched all round with holes: still nothing to say, and nothing to ask.
    const step = window.getByTestId('selection-bar-step');
    await step.click();
    await expect(step).toHaveAttribute('data-step', 'holes');
    await expect(panel.getByTestId('pocket-requirement')).toHaveCount(0);
    await step.click();
    await expect(verdict).toHaveText('Nothing to fix.');
    await expect(panel.getByTestId('pocket-requirement')).toHaveCount(0);
    await expectNoViolations(window, 'shapes with no purpose');
  } finally {
    await closeApp(app);
  }
});

test('SF-UI2 · a pocket said to hold a card warns while it is too narrow, and undo and redo follow', async () => {
  const { app, window } = await openApp({ size: [1440, 900] });
  try {
    const panel = window.getByTestId('property-panel');
    const parts = window.getByTestId('parts-list');
    const verdict = window.getByTestId('problems-verdict');
    // The drawer's rows; Properties lists the selection's problems with the same rows.
    const listed = window.getByTestId('problems-panel').getByTestId('problem-row');

    // A pocket as the card holder's is made: 100 × 60, its top corners
    // rounded 3 mm so the stitching ends 3 mm below the opening, stitched 3 mm
    // in on three sides, open at the top (corners 3 to 2). With square top
    // corners its end holes would sit on the cut edge (SF-D1).
    await drawRectangles(window, [[80, 120, 380, 320]]);
    await enter(panel.getByLabel('Width'), '100');
    await enter(panel.getByLabel('Height'), '60');
    await enter(panel.getByRole('textbox', { name: '↖ mm' }), '3');
    await enter(panel.getByRole('textbox', { name: '↗ mm' }), '3');
    const step = window.getByTestId('selection-bar-step');
    await step.click();
    await enter(panel.getByLabel('Edge margin'), '3');
    await panel.getByTestId('stitch-run').selectOption('between');
    await panel.getByLabel('From corner', { exact: true }).selectOption({ label: 'Corner 3' });
    await panel.getByLabel('To corner', { exact: true }).selectOption({ label: 'Corner 2' });
    await expect(step).toHaveAttribute('data-step', 'holes');
    await step.click();
    await expect(verdict).toHaveText('Nothing to fix.');

    // Said to hold a card with 2 mm of ease: 94 mm across is enough.
    await parts.getByText('Stitch line', { exact: true }).click();
    await expect(panel.getByTestId('pocket-width')).toHaveText('94 mm');
    await panel.getByTestId('pocket-holds').selectOption('id-1');
    await enter(panel.getByRole('textbox', { name: 'Ease' }), '2');
    await expect(panel.getByTestId('feature-problems')).toHaveCount(0);
    await expect(verdict).toHaveText('Nothing to fix.');

    // Narrowed to 90: 84 mm across for 87.60 needed, said once, where it is.
    await parts.getByText('Outline', { exact: true }).click();
    await enter(panel.getByLabel('Width'), '90');
    await expect(verdict).toHaveText('1 warning');
    await parts.getByText('Stitch line', { exact: true }).click();
    const problems = panel.getByTestId('feature-problems');
    await expect(problems).toContainText('Pocket too narrow');
    await expect(problems).toContainText('a payment card with 2.00 mm of ease needs 87.60 mm');
    await window.getByTestId('problems-toggle').click();
    await expect(listed).toHaveCount(1);
    await expectNoViolations(window, 'a pocket too narrow for its card');

    // Undo takes the narrowing back, and its warning with it; redo returns both.
    await window.getByTestId('undo').click();
    await expect(verdict).toHaveText('Nothing to fix.');
    await expect(listed).toHaveCount(0);
    await window.getByTestId('redo').click();
    await expect(verdict).toHaveText('1 warning');
    await expect(listed).toHaveCount(1);
  } finally {
    await closeApp(app);
  }
});
