import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';

/**
 * Undo pressed while a piece is still being dragged cancels the drag — and it
 * stays cancelled. Before, every pointer move after it became its own step of
 * history, each applied onto the last, so the piece ran away across the board
 * and took one Undo per mouse event to bring back.
 */
test('undo during a drag cancels it, and the moves after it make no history', async () => {
  const app = await launchApp({
    env: { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-')) },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 300, box.y + 260, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    await window.getByTestId('tool-select').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
    await window.keyboard.press('ControlOrMeta+z');
    await window.mouse.move(box.x + 400, box.y + 300, { steps: 10 });
    await window.mouse.up();

    // The only step of history is still the rectangle itself.
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await expect(window.getByTestId('undo')).toBeDisabled();
  } finally {
    await closeApp(app);
  }
});
