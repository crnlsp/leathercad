import { expect, test } from '@playwright/test';

import { drawAPanel, withApp } from './launchApp.js';
import { expectPieces } from './counts.js';

/**
 * QA U11: after drawing, Escape leaves the drawing tool for Select, so a click
 * on empty board no longer starts another shape. Halfway through a shape the
 * first press cancels it and the second leaves the tool; shapes drawn one
 * after another need no Escape between them.
 */

test('Escape on an idle drawing tool returns to Select, and a click then draws nothing (QA U11)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await drawAPanel(window, { left: 400, parts: '2' });
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/active/);

    await window.keyboard.press('Escape');
    await expect(window.getByTestId('tool-select')).toHaveClass(/active/);
    await expect(window.getByTestId('tool-rectangle')).not.toHaveClass(/active/);

    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.click(box.x + 650, box.y + 450);
    await window.mouse.click(box.x + 700, box.y + 500);
    await expectPieces(window, '2');
  });
});

test('Escape halfway through a shape cancels it first, and leaves the tool on the second (QA U11)', async () => {
  await withApp(async (window) => {
    await window.getByTestId('tool-circle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    // A click on the centre: the rim is still to come.
    await window.mouse.click(box.x + 300, box.y + 250);

    await window.keyboard.press('Escape');
    await expect(window.getByTestId('tool-circle')).toHaveClass(/active/);
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('tool-select')).toHaveClass(/active/);
    await expectPieces(window, '0');
  });
});
