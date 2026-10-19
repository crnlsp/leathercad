import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { drawAPanel, openApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * Slice 5.3a: never lose work silently.
 *
 * Before it, three ordinary actions destroyed unsaved work without a word:
 * closing the window, opening another project, and — for want of a *New* —
 * restarting the app to begin again. And an untouched project read "unsaved"
 * from the moment it opened, so a guard built on that would have nagged about
 * a blank page. See the pre-1.0 audit §2.2 and §5.
 */

/** Asks the window to close, as the window manager's close button does. */
async function requestClose(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
}

/** Resolves once the app has quit, however it went. */
async function closed(app: ElectronApplication): Promise<boolean> {
  const process = app.process();
  if (process.exitCode !== null) return true;
  return new Promise((done) => {
    const timer = setTimeout(() => done(false), 10_000);
    process.once('exit', () => {
      clearTimeout(timer);
      done(true);
    });
  });
}

test('an untouched project is not unsaved, and closes without asking', async () => {
  const { app, window } = await openApp();
  try {
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
    await expect(window.getByTestId('status-bar')).not.toContainText('unsaved');

    await requestClose(app);
    expect(await closed(app)).toBe(true);
  } finally {
    await closeApp(app);
  }
});

test('closing with unsaved work asks, and Cancel keeps the work', async () => {
  const { app, window } = await openApp();
  try {
    await drawAPanel(window, { parts: '1' });
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');

    await requestClose(app);
    const dialog = window.getByTestId('unsaved-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Save changes to “Untitled”?');
    await expect(dialog).toContainText('close');
    // The safe choice has the focus, not the destructive one.
    await expect(dialog.getByTestId('unsaved-save')).toBeFocused();

    await dialog.getByTestId('unsaved-cancel').click();
    await expect(dialog).toHaveCount(0);
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // Escape is Cancel too — once the dialog has taken focus, which it does
    // just after it appears; a key pressed in between goes to the window.
    await requestClose(app);
    await expect(dialog.getByTestId('unsaved-save')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // And the maker can still choose to throw it away.
    await requestClose(app);
    await dialog.getByTestId('unsaved-discard').click();
    expect(await closed(app)).toBe(true);
  } finally {
    await closeApp(app);
  }
});

test('New asks first, and starts a clean, empty project', async () => {
  const { app, window } = await openApp();
  try {
    await drawAPanel(window, { parts: '1' });

    await fromProjectMenu(window, 'new');
    const dialog = window.getByTestId('unsaved-dialog');
    await expect(dialog).toContainText('new project');
    await dialog.getByTestId('unsaved-cancel').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // Ctrl+N is the same action, behind the same question.
    await window.keyboard.press('Control+n');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('unsaved-discard').click();

    await expect(window.getByTestId('part-count')).toHaveText('0');
    await expect(window.getByTestId('project-name')).toHaveText('Untitled');
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
    await expect(window.getByTestId('undo')).toBeDisabled();

    // A new, untouched project asks nothing of the next New.
    await fromProjectMenu(window, 'new');
    await expect(dialog).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

test('Save in the question saves first, and a cancelled save cancels the whole action', async () => {
  const file = join(tmpdir(), `leathercad-e2e-unsaved-${Date.now()}.lcp`);
  const { app, window } = await openApp();
  try {
    await drawAPanel(window, { parts: '1' });
    const dialog = window.getByTestId('unsaved-dialog');

    // The maker backs out of the save dialog: nothing is replaced.
    await app.evaluate(({ dialog: native }) => {
      native.showSaveDialog = async () => ({ canceled: true, filePath: '' });
    });
    await fromProjectMenu(window, 'new');
    await dialog.getByTestId('unsaved-save').click();
    await expect(dialog).toHaveCount(0);
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');

    // Now they save it where they choose, and only then does New go ahead.
    await app.evaluate(({ dialog: native }, path) => {
      native.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);
    await fromProjectMenu(window, 'new');
    await dialog.getByTestId('unsaved-save').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    expect(existsSync(file)).toBe(true);

    // A clean project opens another without a question…
    await app.evaluate(({ dialog: native }, path) => {
      native.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);
    await fromProjectMenu(window, 'open');
    await expect(dialog).toHaveCount(0);
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');

    // …and a dirty one asks, with the same question.
    await drawAPanel(window, { left: 350, parts: '2' });
    await fromProjectMenu(window, 'open');
    await expect(dialog).toContainText('Opening another project');
    await dialog.getByTestId('unsaved-cancel').click();
    await expect(window.getByTestId('part-count')).toHaveText('2');

    await window.keyboard.press('Control+o');
    await dialog.getByTestId('unsaved-discard').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
  } finally {
    await closeApp(app);
    rmSync(file, { force: true });
  }
});

test('a reload asks as a close does', async () => {
  // Electron's default menu offers View › Reload (Ctrl+R), which unloads the
  // page exactly as a close does — and threw the work away just as silently.
  const { app, window } = await openApp();
  try {
    await drawAPanel(window, { parts: '1' });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.reload(),
    );
    const dialog = window.getByTestId('unsaved-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('unsaved-cancel').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});

test('undoing back to what was saved is not unsaved', async () => {
  const { app, window } = await openApp();
  try {
    await drawAPanel(window, { parts: '1' });
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');

    await requestClose(app);
    expect(await closed(app)).toBe(true);
  } finally {
    await closeApp(app);
  }
});
