import { expect, test, type Page } from '@playwright/test';

import { openSample, withApp } from './launchApp.js';

/** Slice 8.8b-1: whole pieces copied in one project and pasted into another. */

const tabs = (window: Page) => window.getByTestId('tab-strip').getByRole('tab');

/** Right-clicks the board at a point on it. */
async function rightClick(window: Page, x: number, y: number): Promise<void> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.mouse.click(box.x + x, box.y + y, { button: 'right' });
}

test('the card pocket copied from the wallet pastes into a new project, one undo step each (8.8b)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    await window.getByTestId('part-heading-pocket').click({ button: 'right' });
    await window.getByTestId('context-copy-pieces').click();
    // Nothing in the pocket points at another piece, so nothing is said.
    await expect(window.getByTestId('file-notice')).toHaveCount(0);

    await window.keyboard.press('Control+N');
    await expect(tabs(window)).toHaveCount(2);
    await expect(window.getByTestId('part-count')).toHaveText('0');

    // The board's own Paste key, with the pointer over the board.
    const canvas = window.getByTestId('editor-canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.focus();
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.keyboard.press('Control+V');

    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('4');
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await expect(window.getByTestId('parts-list')).toContainText('Card pocket');
    await expect(window.getByTestId('problem-count')).toHaveCount(0);

    // And from a right-click on empty board, where the menu is Paste alone.
    await rightClick(window, 40, 40);
    await expect(window.getByTestId('context-menu').getByRole('menuitem')).toHaveCount(1);
    await window.getByTestId('context-paste-pieces').click();
    await expect(window.getByTestId('part-count')).toHaveText('2');

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');

    // The wallet it came from is as it was.
    await tabs(window).first().click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
  });
});
