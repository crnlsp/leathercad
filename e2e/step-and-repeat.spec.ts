import { expect, test, type Page } from '@playwright/test';

import { drawAPanel, withApp } from './launchApp.js';

/**
 * Slice 8.8b-3: Ctrl+D right after a duplicate that was then moved repeats
 * that move on the new copy — pieces stepped 15 mm down, each 15 mm further
 * than the last.
 */

const position = (window: Page) =>
  window.getByTestId('property-panel').getByTestId('position-fields');
const field = (window: Page, name: string) => position(window).getByLabel(name);

async function type(window: Page, name: string, text: string): Promise<void> {
  const input = field(window, name);
  await input.fill(text);
  await input.press('Enter');
}

/** Ctrl+D with the pointer over the board, where the key belongs. */
async function duplicate(window: Page): Promise<void> {
  const canvas = window.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.focus();
  await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await window.keyboard.press('ControlOrMeta+D');
}

/** Moves the selection 15 mm down with Move by, typed. */
async function moveDown(window: Page): Promise<void> {
  await type(window, 'Right', '0');
  await type(window, 'Up', '-15');
  await position(window).getByTestId('move-by').click();
}

const bottomOf = async (window: Page): Promise<number> =>
  Number(await field(window, 'Bottom').inputValue());

test('duplicate, move 15 mm down, Ctrl+D: the third piece is 15 mm below the second (8.8b)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await window.locator('[data-testid^="feature-row-"]').first().click();
    const first = await bottomOf(window);

    await duplicate(window);
    await expect(window.getByTestId('part-count')).toHaveText('2');
    await moveDown(window);
    const second = await bottomOf(window);
    expect(second).toBeCloseTo(first - 15, 9);

    await duplicate(window);
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(field(window, 'Bottom')).toHaveValue(String(second - 15));

    // Again: each is 15 mm further, and one undo step.
    await duplicate(window);
    await expect(window.getByTestId('part-count')).toHaveText('4');
    await expect(field(window, 'Bottom')).toHaveValue(String(second - 30));
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
  });
});

test('an undo in between makes Ctrl+D an ordinary duplicate again (8.8b)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await window.locator('[data-testid^="feature-row-"]').first().click();

    await duplicate(window);
    await expect(window.getByTestId('part-count')).toHaveText('2');
    await moveDown(window);
    const moved = await bottomOf(window);

    await window.getByTestId('undo').click();
    await window.getByTestId('redo').click();
    await expect(field(window, 'Bottom')).toHaveValue(String(moved));
    await duplicate(window);
    await expect(window.getByTestId('part-count')).toHaveText('3');
    // Placed clear of the drawing as ever, in line with the piece it copies.
    await expect(field(window, 'Bottom')).toHaveValue(String(moved));
  });
});
