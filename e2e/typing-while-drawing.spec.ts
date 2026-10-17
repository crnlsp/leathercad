import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';

/**
 * U.16, R-13: typing the size while the rectangle is being drawn. `105` Tab
 * `75` Tab `8` Enter makes a 105 × 75 mm outline with 8 mm corners, in one undo
 * step; the shape's numbers are the value chips (U.14), a hint under it says
 * what the keys do, and Properties mirrors Width, Height and Corner.
 */

async function withApp(run: (window: Page, app: ElectronApplication) => Promise<void>) {
  const app = await launchApp();
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await run(window, app);
  } finally {
    await closeApp(app);
  }
}

const chip = (window: Page, name: 'width' | 'height' | 'corner') =>
  window.getByTestId(`value-chip-${name}`);
const field = (window: Page, name: 'width' | 'height' | 'corner') =>
  chip(window, name).locator('input');

/** Picks the Rectangle tool and clicks the first corner a little in from the board's corner. */
async function firstCorner(window: Page): Promise<{ x: number; y: number }> {
  await window.getByTestId('tool-rectangle').click();
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  const corner = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.6 };
  await window.mouse.move(corner.x, corner.y);
  await window.mouse.click(corner.x, corner.y);
  await window.mouse.move(corner.x + 120, corner.y - 80);
  return corner;
}

test('105 Tab 75 Tab 8 Enter makes a 105 × 75 outline with 8 mm corners, one undo step (U.16)', async () => {
  await withApp(async (window) => {
    await firstCorner(window);

    // The readout is the chips, with a hint under the shape.
    await expect(window.getByTestId('value-chips')).toBeVisible();
    await expect(chip(window, 'width')).toBeVisible();
    const hint = window.getByTestId('value-chip-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Tab');
    await expect(hint).toContainText('makes it');
    await expect(hint).toContainText('cancels');
    await expect(window.getByTestId('tool-notice')).toHaveCount(0);

    await window.keyboard.type('105');
    await expect(field(window, 'width')).toBeFocused();
    await expect(field(window, 'width')).toHaveValue('105');
    await window.keyboard.press('Tab');
    await expect(field(window, 'height')).toBeFocused();
    await window.keyboard.type('75');
    await window.keyboard.press('Tab');
    await expect(field(window, 'corner')).toBeFocused();
    await window.keyboard.type('8');

    // Properties mirrors what is typed while the shape is drawn.
    await expect(window.getByTestId('drawing-width')).toHaveText('105.0 mm');
    await expect(window.getByTestId('drawing-height')).toHaveText('75.0 mm');

    await window.keyboard.press('Enter');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('value-chip-hint')).toHaveCount(0);

    // The outline is selected, with its sizes as typed.
    const panel = window.getByTestId('property-panel');
    await expect(panel.getByLabel('Width')).toHaveValue('105');
    await expect(panel.getByLabel('Height')).toHaveValue('75');
    await expect(field(window, 'corner')).toHaveValue('8.0');

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await expect(window.getByTestId('undo')).toBeDisabled();
  });
});

test('typing before any click starts the rectangle at the pointer; Esc gives it up (U.16)', async () => {
  await withApp(async (window) => {
    await window.getByTestId('tool-rectangle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    // The board has the keys, as after a click on it or Esc out of a field.
    await window.getByTestId('editor-canvas').focus();

    await window.keyboard.type('40');
    await expect(field(window, 'width')).toBeFocused();
    await window.keyboard.press('Tab');
    await window.keyboard.type('25');
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('property-panel').getByLabel('Width')).toHaveValue('40');

    // Esc in a chip cancels the shape: no second part.
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.type('10');
    await expect(window.getByTestId('value-chip-hint')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('value-chip-hint')).toHaveCount(0);
    await expect(window.getByTestId('part-count')).toHaveText('1');
  });
});

test('a corner the shape would not draw is refused, saying why, and Enter takes what fits (U.16)', async () => {
  await withApp(async (window) => {
    await firstCorner(window);
    await window.keyboard.type('60');
    await window.keyboard.press('Tab');
    await window.keyboard.type('20');
    await window.keyboard.press('Tab');
    await window.keyboard.type('15');
    await window.keyboard.press('Enter');
    // Still drawing: the chip stays open, with the reason.
    await expect(window.getByTestId('value-chip-note')).toContainText('half the height (10.0)');
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(field(window, 'corner')).toHaveValue('10.0');
  });
});

test('a rectangle can still be dragged, and sized by the chips after (U.16)', async () => {
  await withApp(async (window) => {
    await window.getByTestId('tool-rectangle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    const from = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 };
    await window.mouse.move(from.x, from.y);
    await window.mouse.down();
    await window.mouse.move(from.x + 150, from.y + 90, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await chip(window, 'width').click();
    await field(window, 'width').fill('50');
    await field(window, 'width').press('Enter');
    await expect(window.getByTestId('property-panel').getByLabel('Width')).toHaveValue('50');
  });
});
