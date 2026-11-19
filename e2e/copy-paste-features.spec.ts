import { expect, test, type Page } from '@playwright/test';

import { openSample, withApp } from './launchApp.js';

/**
 * Slice 8.8b-4: features copied into a piece, and duplicated and stepped
 * inside one. On the sample bifold the lining has a 64 × 3 mm card slot, the
 * feature `lining-slot`, and its mirror across the lining's fold.
 */

const featureCount = async (window: Page): Promise<number> =>
  Number(await window.getByTestId('feature-count').textContent());

const position = (window: Page) =>
  window.getByTestId('property-panel').getByTestId('position-fields');
const field = (window: Page, name: string) => position(window).getByLabel(name);

/** The selection's bottom edge, as Properties shows it — with a typographic minus. */
const bottom = async (window: Page): Promise<number> =>
  Number((await field(window, 'Bottom').inputValue()).replace('\u2212', '-'));

async function type(window: Page, name: string, text: string): Promise<void> {
  const input = field(window, name);
  await input.fill(text);
  await input.press('Enter');
}

/** A board key, with the pointer over the board, where the key belongs. */
async function boardKey(window: Page, key: string): Promise<void> {
  const canvas = window.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.focus();
  await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await window.keyboard.press(key);
}

test('three card slots stepped 15 mm down the lining: duplicate, move 15 mm, Ctrl+D (8.8b)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    const features = await featureCount(window);
    await window.getByTestId('feature-row-lining-slot').click();
    const first = await bottom(window);

    // Duplicated into the lining, on top of the slot, and selected.
    await boardKey(window, 'ControlOrMeta+D');
    await expect(window.getByTestId('feature-count')).toHaveText(String(features + 1));
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect.poll(() => bottom(window)).toBe(first);

    await type(window, 'Right', '0');
    await type(window, 'Up', '-15');
    await position(window).getByTestId('move-by').click();
    await expect.poll(() => bottom(window)).toBe(first - 15);

    // The third lands 15 mm further, and is one undo step.
    await boardKey(window, 'ControlOrMeta+D');
    await expect(window.getByTestId('feature-count')).toHaveText(String(features + 2));
    await expect.poll(() => bottom(window)).toBe(first - 30);
    await expect(window.getByTestId('file-notice')).toHaveCount(0);
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('feature-count')).toHaveText(String(features + 1));
  });
});

test('a slot copied from the lining pastes into the selected piece, and into no piece is refused (8.8b)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    const features = await featureCount(window);
    await window.getByTestId('feature-row-lining-slot').click({ button: 'right' });
    await expect(window.getByTestId('context-copy-pieces')).toHaveText(/Copy feature/);
    await window.getByTestId('context-copy-pieces').click();

    // Into the card pocket, picked by its heading.
    await window.getByTestId('part-heading-pocket').click();
    await boardKey(window, 'ControlOrMeta+V');
    await expect(window.getByTestId('feature-count')).toHaveText(String(features + 1));
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.getByTestId('selected-count')).toHaveText('1');

    // With nothing selected there is no piece to paste into: said, nothing pasted.
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('selected-count')).toHaveText('0');
    await boardKey(window, 'ControlOrMeta+V');
    await expect(window.getByTestId('file-notice')).toContainText('Choose a piece to paste into');
    await expect(window.getByTestId('feature-count')).toHaveText(String(features + 1));
  });
});

test('a stitch line copied without its outline is said to paste as drawn, before pasting (8.8b)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    await window.getByTestId('feature-row-outer-stitch').click();
    await boardKey(window, 'ControlOrMeta+C');
    await expect(window.getByTestId('file-notice')).toContainText(
      'Stitch line in Outer follows something you did not copy',
    );
  });
});
