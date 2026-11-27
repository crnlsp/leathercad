import { expect, test } from '@playwright/test';

import { boardMap } from './boardMap.js';
import { withSample } from './launchApp.js';
import { resizeWindow } from './windowSize.js';
import { openSettings } from './openSettings.js';

/**
 * U.25: the window's rules that hold across every surface — a dialog keeps
 * the keys when its focus is lost (X19), the board says what is selected
 * (X21), a shrinking window keeps the selection in view (X34), and Settings
 * grows with the window (X37).
 */

test('a dialog whose focus fell to the page keeps the window’s keys, and Escape closes it (X19)', async () => {
  await withSample(async (window) => {
    const tabs = window.getByTestId('tab-strip').getByRole('tab');
    const before = await tabs.count();
    await openSettings(window);
    const dialog = window.getByTestId('settings-dialog');
    await expect(dialog).toBeVisible();
    // As a button disabled under the focus leaves it: on the page itself.
    await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect
      .poll(() => window.evaluate(() => document.activeElement === document.body))
      .toBe(true);

    await window.keyboard.press('ControlOrMeta+n');
    // Proving no tab opened behind the dialog: nothing to wait for but time.
    await window.waitForTimeout(300);
    await expect(tabs).toHaveCount(before);
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        window.evaluate(() => document.activeElement?.closest('[aria-modal="true"]') !== null),
      )
      .toBe(true);

    await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await window.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test('the board says what is selected, politely (X21)', async () => {
  await withSample(async (window) => {
    const said = window.getByTestId('announce-selection');
    await expect(said).toHaveText('');
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('ControlOrMeta+a');
    await expect(said).toHaveText(/^3 pieces selected: .+/);
    await expect(window.getByTestId('announcer')).toHaveAttribute('aria-live', 'polite');
    await expect(window.getByTestId('parts-count')).toHaveText('3 pieces');
  });
});

test('shrinking the window keeps the selected piece in view (X34)', async () => {
  await withSample(
    async (window, app) => {
      await window.getByTestId('feature-row-outer-outline').click();
      await window.getByTestId('editor-canvas').focus();
      await window.keyboard.press('Shift+Digit2');
      await expect(window.getByTestId('selection-bar')).toBeVisible();

      await resizeWindow(app, window, 860, 600);
      // The outer is 200 × 95 mm from the origin: both corners on the board.
      const toWindow = await boardMap(window);
      const board = await window.getByTestId('editor-canvas').boundingBox();
      expect(board).not.toBeNull();
      if (board === null) return;
      for (const corner of [toWindow({ x: 0, y: 0 }), toWindow({ x: 200, y: 95 })]) {
        expect(corner.x).toBeGreaterThanOrEqual(board.x);
        expect(corner.x).toBeLessThanOrEqual(board.x + board.width);
        expect(corner.y).toBeGreaterThanOrEqual(board.y);
        expect(corner.y).toBeLessThanOrEqual(board.y + board.height);
      }
    },
    { size: [1440, 900] },
  );
});

test('Settings is taller where the window allows (X37)', async () => {
  await withSample(
    async (window, app) => {
      await openSettings(window);
      const dialog = window.getByTestId('settings-dialog');
      expect((await dialog.boundingBox())?.height).toBe(720);
      await window.getByTestId('settings-close').click();

      await resizeWindow(app, window, 860, 600);
      await openSettings(window);
      expect((await dialog.boundingBox())?.height).toBe(600 - 64);
    },
    { size: [1440, 900] },
  );
});
