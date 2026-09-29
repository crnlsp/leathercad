import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { closeApp } from './closeApp.js';

/** Slice 8.8: the right-click menu, on the board and in Parts. */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

async function launch(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-ctx-')) },
  });
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  return { app, window };
}

/** A 150 × 110 px panel whose left edge is at x = 150 on the canvas. */
async function drawAPanel(window: Page, left: number): Promise<void> {
  await window.getByTestId('tool-rectangle').click();
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.mouse.move(box.x + left, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(box.x + left + 150, box.y + 260, { steps: 5 });
  await window.mouse.up();
}

/** Right-clicks the canvas at a point on it. */
async function rightClick(window: Page, x: number, y: number): Promise<void> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.mouse.click(box.x + x, box.y + y, { button: 'right' });
}

const menu = (window: Page) => window.getByTestId('context-menu');

test('a right-click selects what is under it and offers what it can take (8.8)', async () => {
  const { app, window } = await launch();
  try {
    await drawAPanel(window, 150);
    await window.getByTestId('tool-select').click();

    await rightClick(window, 150, 200);
    await expect(menu(window)).toBeVisible();
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await expect(window.getByTestId('context-duplicate-part')).toBeFocused();

    await window.getByTestId('context-duplicate-part').click();
    await expect(menu(window)).toBeHidden();
    await expect(window.getByTestId('part-count')).toHaveText('2');
  } finally {
    await closeApp(app);
  }
});

test('a right-click inside a selection keeps all of it, and one undo takes the action back (8.8)', async () => {
  const { app, window } = await launch();
  try {
    await drawAPanel(window, 100);
    await drawAPanel(window, 350);
    await window.getByTestId('tool-select').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.click(box.x + 100, box.y + 200);
    await window.keyboard.down('Shift');
    await window.mouse.click(box.x + 350, box.y + 200);
    await window.keyboard.up('Shift');
    await expect(window.getByTestId('selected-count')).toHaveText('2');

    await rightClick(window, 350, 200);
    await expect(window.getByTestId('selected-count')).toHaveText('2');
    await window.getByTestId('context-lock').click();

    const locks = window.locator('[data-testid^="feature-locked-"]');
    await expect(locks.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(locks.nth(1)).toHaveAttribute('aria-pressed', 'true');

    await window.getByTestId('undo').click();
    await expect(locks.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(locks.nth(1)).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await closeApp(app);
  }
});

test('a locked piece is still reached by a right-click on the board, to unlock it (8.8)', async () => {
  const { app, window } = await launch();
  try {
    await drawAPanel(window, 150);
    await rightClick(window, 150, 200);
    await window.getByTestId('context-lock').click();
    await window.getByTestId('tool-select').click();

    await rightClick(window, 150, 200);
    await expect(window.getByTestId('context-lock')).toHaveText(/Unlock/);
    // Locked, so it cannot be flipped or deleted; the menu says so.
    await expect(window.getByTestId('context-delete')).toHaveAttribute('aria-disabled', 'true');
    await window.getByTestId('context-lock').click();

    await expect(window.locator('[data-testid^="feature-locked-"]').first()).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  } finally {
    await closeApp(app);
  }
});

test('Shift+F10 opens the menu about what is selected on the board, wherever focus is (8.8)', async () => {
  const { app, window } = await launch();
  try {
    await drawAPanel(window, 150);
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-select').click();
    await window.mouse.click(box.x + 150, box.y + 200);
    await expect(window.getByTestId('selected-count')).toHaveText('1');

    // Focus is still on the tool just chosen: the canvas cannot take it.
    await window.getByTestId('tool-select').focus();
    await window.keyboard.press('Shift+F10');
    await expect(menu(window)).toBeVisible();
    await expect(window.getByTestId('context-duplicate-part')).toBeFocused();
    await window.keyboard.press('Escape');

    // With nothing selected there is nothing to offer.
    await window.mouse.click(box.x + 20, box.y + 20);
    await window.keyboard.press('Shift+F10');
    await expect(menu(window)).toBeHidden();
  } finally {
    await closeApp(app);
  }
});

test('the menu opens from the keyboard on a Parts row, and Escape gives focus back (8.8)', async () => {
  const { app, window } = await launch();
  try {
    await drawAPanel(window, 150);
    const row = window.locator('[data-testid^="feature-row-"]').first();
    await row.focus();

    await window.keyboard.press('Shift+F10');
    await expect(menu(window)).toBeVisible();
    await expect(window.getByTestId('context-duplicate-part')).toBeFocused();

    await window.keyboard.press('Escape');
    await expect(menu(window)).toBeHidden();
    await expect(row).toBeFocused();
    // Escape closed the menu; it did not also clear the selection.
    await expect(window.getByTestId('selected-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});
