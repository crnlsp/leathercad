import { expect, test } from '@playwright/test';

import { openSample, withApp } from './launchApp.js';

/** Slice 8.8b-2: Ctrl+D (⌘D on macOS) does what the menu's Duplicate does. */

test('the platform modifier and D duplicate the selected piece, one undo step (8.8b)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    const before = Number(await window.getByTestId('part-count').textContent());

    await window.getByTestId('part-heading-pocket').click();
    const canvas = window.getByTestId('editor-canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.focus();
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.keyboard.press('ControlOrMeta+D');

    await expect(window.getByTestId('part-count')).toHaveText(String(before + 1));
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await expect(window.getByTestId('problem-count')).toHaveCount(0);

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText(String(before));
  });
});

test('with every piece selected it duplicates them all, one undo step (8.8b)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    const before = Number(await window.getByTestId('part-count').textContent());

    // Select every piece, the board's own key (3.14).
    const canvas = window.getByTestId('editor-canvas');
    await canvas.focus();
    await window.keyboard.press('ControlOrMeta+A');
    await expect(window.getByTestId('selected-count')).toHaveText(String(before));

    await window.keyboard.press('ControlOrMeta+D');

    await expect(window.getByTestId('part-count')).toHaveText(String(before * 2));
    await expect(window.getByTestId('selected-count')).toHaveText(String(before));
    await expect(window.getByTestId('problem-count')).toHaveCount(0);

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText(String(before));
  });
});
