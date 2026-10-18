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

/**
 * Types an 8 mm corner on a shape the pointer has room for, then shrinks the
 * shape with the pointer until 8 mm no longer fits: the board has the keys.
 */
async function cornerThenShrink(window: Page): Promise<{ x: number; y: number }> {
  const corner = await firstCorner(window);
  await chip(window, 'corner').click();
  await field(window, 'corner').fill('8');
  // Leaving the chip applies it; the board has the keys again.
  await window.getByTestId('editor-canvas').focus();
  await expect(window.getByTestId('drawing-corner')).toHaveText('8.0 mm');
  const small = { x: corner.x + 12, y: corner.y - 8 };
  await window.mouse.move(small.x, small.y);
  return small;
}

test('a typed corner the pointer has left no room for is refused, never made smaller unsaid (U.16)', async () => {
  await withApp(async (window) => {
    const note = window.getByTestId('value-chip-note');
    const parts = window.getByTestId('part-count');

    // Enter on the board: refused, saying why, with the corner chip open on it.
    await cornerThenShrink(window);
    await window.keyboard.press('Enter');
    await expect(note).toContainText('Corner is larger than half the');
    await expect(parts).toHaveText('0');
    await expect(field(window, 'corner')).toBeFocused();
    await expect(field(window, 'corner')).toHaveValue('8');
    // Only a second Enter, there, takes the corner that fits — one undo step.
    await window.keyboard.press('Enter');
    await expect(parts).toHaveText('1');
    const corner = () => field(window, 'corner').inputValue().then(Number);
    await expect.poll(corner).toBeLessThan(8);
    expect(await corner()).toBeGreaterThan(0);
    await window.getByTestId('undo').click();
    await expect(parts).toHaveText('0');
    await expect(window.getByTestId('undo')).toBeDisabled();

    // A click on the board: refused the same way, and never takes the smaller corner.
    const at = await cornerThenShrink(window);
    await window.mouse.click(at.x, at.y);
    await expect(note).toContainText('Corner is larger than half the');
    await expect(parts).toHaveText('0');
    await expect(field(window, 'corner')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(parts).toHaveText('0');
    await expect(window.getByTestId('value-chip-hint')).toHaveCount(0);

    // Enter in the corner chip, opened on the shrunk shape: its own refusal.
    await cornerThenShrink(window);
    await chip(window, 'corner').click();
    await window.keyboard.press('Enter');
    await expect(note).toContainText('Corner is larger than half the');
    await expect(parts).toHaveText('0');
    await window.keyboard.press('Enter');
    await expect(parts).toHaveText('1');
    // The new outline's own corner, once its chip shows it rather than what was typed.
    await expect
      .poll(async () => Number(await field(window, 'corner').inputValue()))
      .toBeLessThan(8);
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

test('with the keys alone — Tab to the board, R, 105 Tab 75 Enter — the rectangle is made where it can be seen (U.19)', async () => {
  // No pointer has been on the board: the shape starts in its middle, rather
  // than not at all, which left a maker without a mouse no way to draw.
  await withApp(async (window) => {
    const board = window.getByTestId('editor-canvas');
    for (let i = 0; i < 80; i++) {
      await window.keyboard.press('Tab');
      if (await board.evaluate((canvas) => canvas === document.activeElement)) break;
    }
    await expect(board).toBeFocused();
    await window.keyboard.press('KeyR');
    await window.keyboard.type('105');
    await expect(field(window, 'width')).toBeFocused();
    await window.keyboard.press('Tab');
    await window.keyboard.type('75');
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('part-count')).toHaveText('1');

    const panel = window.getByTestId('property-panel');
    await expect(panel.getByLabel('Width')).toHaveValue('105');
    await expect(panel.getByLabel('Height')).toHaveValue('75');
    // Its corner where the board's middle was: inside the board, so in view.
    const box = (await board.boundingBox())!;
    const corner = (await chip(window, 'width').boundingBox())!;
    expect(corner.x).toBeGreaterThan(box.x);
    expect(corner.x + corner.width).toBeLessThan(box.x + box.width);
    expect(corner.y).toBeGreaterThan(box.y);
    expect(corner.y + corner.height).toBeLessThan(box.y + box.height);
  });
});

test('a size typed by the board’s edge goes where Tab says, even when its chip’s line is out of view (U.19)', async () => {
  // Started by the right edge, the pointer gone off to the left: the shape
  // runs left from its corner, the height's side at the edge. Its chip was
  // left out, so Tab went past it, the 75 went nowhere, and Enter made the
  // rectangle as tall as the pointer said.
  await withApp(async (window, app) => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(860, 600));
    await expect.poll(() => window.evaluate(() => innerWidth)).toBe(860);
    const board = window.getByTestId('editor-canvas');
    const box = (await board.boundingBox())!;
    await window.mouse.move(box.x + box.width * 0.94, box.y + box.height * 0.5);
    await board.focus();
    await window.keyboard.press('KeyR');
    await window.keyboard.type('105');
    await window.mouse.move(box.x - 20, box.y + 10, { steps: 5 });
    await window.keyboard.press('Tab');
    await expect(field(window, 'height')).toBeFocused();
    await window.keyboard.type('75');
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.keyboard.press('BracketRight');
    const panel = window.getByTestId('property-panel');
    await expect(panel.getByLabel('Width')).toHaveValue('105');
    await expect(panel.getByLabel('Height')).toHaveValue('75');
  });
});
