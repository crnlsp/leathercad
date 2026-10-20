import { expect, test, type ElectronApplication } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { readoutAt } from './cursorReadout.js';
import { drawAPanel, openApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * Slice 8.7: Linux and Windows have no application menu — the project bar
 * holds its actions, Settings and Help — and the window answers the keys the
 * menu's roles used to give. The shipped build's missing developer tools are
 * checked on the packaged app, where it is true.
 */

/**
 * A key as the operating system delivers it, through the window's input,
 * where the main process hears it (`before-input-event`). Playwright's own
 * key presses reach the page and skip that step.
 */
async function pressInWindow(
  app: ElectronApplication,
  keyCode: string,
  modifiers: readonly ('control' | 'shift')[] = [],
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [keyCode, modifiers]) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: [...modifiers] });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: [...modifiers] });
    },
    [keyCode, modifiers] as const,
  );
}

test('there is no application menu off macOS (8.7)', async () => {
  test.skip(process.platform === 'darwin', 'macOS keeps the platform’s own menu');
  const { app } = await openApp();
  try {
    expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)).toBe(true);
  } finally {
    await closeApp(app);
  }
});

test('Ctrl+Q asks about unsaved work before it quits (8.7)', async () => {
  test.skip(process.platform === 'darwin', 'the app menu quits on macOS');
  const { app, window } = await openApp();
  try {
    await drawAPanel(window, { parts: '1' });
    await pressInWindow(app, 'Q', ['control']);
    const dialog = window.getByTestId('unsaved-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('unsaved-save')).toBeFocused();
    await dialog.getByTestId('unsaved-cancel').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});

test('F11 toggles full screen (8.7)', async () => {
  const { app } = await openApp();
  try {
    const full = (): Promise<boolean> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen());
    await pressInWindow(app, 'F11');
    await expect.poll(full).toBe(true);
    await pressInWindow(app, 'F11');
    await expect.poll(full).toBe(false);
  } finally {
    await closeApp(app);
  }
});

test('copy and paste work in a text field with no menu (8.7)', async () => {
  // Chromium's own editing keys: nothing of the app's, and no menu role.
  const { app, window } = await openApp();
  try {
    await fromProjectMenu(window, 'rename');
    const name = window.getByTestId('project-name-input');
    await name.fill('Wallet');
    await name.press('ControlOrMeta+a');
    await name.press('ControlOrMeta+c');
    await name.press('End');
    await name.press('ControlOrMeta+v');
    await expect(name).toHaveValue('WalletWallet');
  } finally {
    await closeApp(app);
  }
});

test('the zoom keys zoom, and Shift+1 fits the pattern again (8.4b, U.4)', async () => {
  // Zoom changes which millimetre is under a fixed point off the centre, and
  // fitting brings it back. The menu that also zoomed is gone; the keys stay.
  // Ctrl+0 fitted until U.4, and is true size now (e2e/zoom.spec.ts).
  const { app, window } = await openApp();
  try {
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('tool-select').click();
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    // The millimetre under one fixed point, at the current zoom.
    const scale = (): Promise<string> => readoutAt(window, board.x + 60, board.y + 60);
    await window.keyboard.press('Shift+Digit1');
    const fitted = await scale();
    await window.keyboard.press('Control+Equal');
    await expect.poll(scale).not.toBe(fitted);
    await window.keyboard.press('Shift+Digit1');
    await expect.poll(scale).toBe(fitted);
    await window.keyboard.press('Control+Minus');
    await expect.poll(scale).not.toBe(fitted);
  } finally {
    await closeApp(app);
  }
});
