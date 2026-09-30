import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { readoutAt } from './cursorReadout.js';
import { launchApp } from './launchApp.js';

/**
 * Slice 8.7: Linux and Windows have no application menu — the project bar
 * holds its actions, Settings and Help — and the window answers the keys the
 * menu's roles used to give. The shipped build's missing developer tools are
 * checked on the packaged app, where it is true.
 */

async function launch(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await launchApp();
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  return { app, window };
}

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

async function drawAPanel(window: Page): Promise<void> {
  await window.getByTestId('tool-rectangle').click();
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.mouse.move(box.x + 150, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(box.x + 300, box.y + 260, { steps: 5 });
  await window.mouse.up();
  await expect(window.getByTestId('part-count')).toHaveText('1');
}

test('there is no application menu off macOS (8.7)', async () => {
  test.skip(process.platform === 'darwin', 'macOS keeps the platform’s own menu');
  const { app } = await launch();
  try {
    expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)).toBe(true);
  } finally {
    await closeApp(app);
  }
});

test('Ctrl+Q asks about unsaved work before it quits (8.7)', async () => {
  test.skip(process.platform === 'darwin', 'the app menu quits on macOS');
  const { app, window } = await launch();
  try {
    await drawAPanel(window);
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
  const { app } = await launch();
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
  const { app, window } = await launch();
  try {
    const name = window.getByTestId('project-name');
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

test('the zoom keys zoom, and Ctrl+0 fits the pattern again (8.4b)', async () => {
  // Zoom changes which millimetre is under a fixed point off the centre, and
  // fitting brings it back. The menu that also zoomed is gone; the keys stay.
  const { app, window } = await launch();
  try {
    await drawAPanel(window);
    await window.getByTestId('tool-select').click();
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    // The millimetre under one fixed point, at the current zoom.
    const scale = (): Promise<string> => readoutAt(window, board.x + 60, board.y + 60);
    await window.keyboard.press('Control+0');
    const fitted = await scale();
    await window.keyboard.press('Control+Equal');
    await expect.poll(scale).not.toBe(fitted);
    await window.keyboard.press('Control+0');
    await expect.poll(scale).toBe(fitted);
    await window.keyboard.press('Control+Minus');
    await expect.poll(scale).not.toBe(fitted);
  } finally {
    await closeApp(app);
  }
});
