import { expect, test } from '@playwright/test';

import { openSample, withApp } from './launchApp.js';
import { expectPieces, expectSelected, pieceCount } from './counts.js';

/** Slice 8.8b-2: Ctrl+D (⌘D on macOS) does what the menu's Duplicate does. */

test('the platform modifier and D duplicate the selected piece, one undo step (8.8b)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    const before = (await pieceCount(window))!;

    await window.getByTestId('part-heading-pocket').click();
    const canvas = window.getByTestId('editor-canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.focus();
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.keyboard.press('ControlOrMeta+D');

    await expectPieces(window, String(before + 1));
    await expectSelected(window, '1', 'pieces');
    await expect(window.getByTestId('print-problems')).toHaveAttribute('data-state', 'clear');

    await window.getByTestId('undo').click();
    await expectPieces(window, String(before));
  });
});

test('with every piece selected it duplicates them all, one undo step (8.8b)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    const before = (await pieceCount(window))!;

    // Select every piece, the board's own key (3.14).
    const canvas = window.getByTestId('editor-canvas');
    await canvas.focus();
    await window.keyboard.press('ControlOrMeta+A');
    await expectSelected(window, String(before), 'pieces');

    await window.keyboard.press('ControlOrMeta+D');

    await expectPieces(window, String(before * 2));
    await expectSelected(window, String(before), 'pieces');
    await expect(window.getByTestId('print-problems')).toHaveAttribute('data-state', 'clear');

    await window.getByTestId('undo').click();
    await expectPieces(window, String(before));
  });
});
