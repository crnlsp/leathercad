import { rmSync } from 'node:fs';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { openSettings } from './openSettings.js';
import {
  drawAPanel,
  expectNoViolations,
  freshStateHome,
  openApp,
  recoveryCopies,
} from './launchApp.js';
import { expectPieces } from './counts.js';

/**
 * QA2, F1: a part of the window that throws as it draws never takes the
 * window, or the work, with it.
 *
 * QA's 1.7 pass blanked the whole window by typing 1e10 mm into a rectangle's
 * Height: no notice, no Undo, and closing it then quit without the
 * unsaved-changes question and deleted the recovery copy. The typed route is
 * closed by bounding the fields (QA1); these force the failure through the
 * app's test hook instead — an event nothing in the app sends — so they hold
 * whatever throws next.
 */

/** Makes an area throw the next time it draws, through the app's test hook. */
async function failIn(window: Page, area: string): Promise<void> {
  await window.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent('leathercad:fail-render', { detail }));
  }, area);
}

/** Asks the window to close, as the window manager's close button does. */
async function requestClose(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
}

// A copy every quarter second, so a test need not wait a minute for one.
const launch = (state: string) =>
  openApp({ state, env: { LEATHERCAD_RECOVERY_INTERVAL_MS: '250' } });

let state: string;
test.beforeEach(() => {
  state = freshStateHome();
});
test.afterEach(() => {
  rmSync(state, { recursive: true, force: true });
});

test('a panel that fails says so in its place, and the window and the work go on', async () => {
  const { app, window } = await launch(state);
  try {
    await drawAPanel(window, { parts: '1' });
    await failIn(window, 'properties');

    await expect(window.getByTestId('failure-properties')).toBeVisible();
    await expect(window.getByTestId('property-panel')).toHaveCount(0);
    // Everything else is still there, and still works.
    await expect(window.getByTestId('editor-canvas')).toBeVisible();
    await expect(window.getByTestId('tab-strip')).toBeVisible();
    await expect(window.getByTestId('undo')).toBeEnabled();
    await expectPieces(window, '1');
    await expect(window.getByTestId('announce-save')).toHaveText('Unsaved changes');
    await expectNoViolations(window, 'a panel that failed');

    // The maker's next step brings the panel back.
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('failure-properties')).toHaveCount(0);
    await expect(window.getByTestId('property-panel')).toBeVisible();
  } finally {
    await closeApp(app);
  }
});

test('a board that fails says so, and closing still asks about the unsaved work', async () => {
  const { app, window } = await launch(state);
  try {
    await drawAPanel(window, { parts: '1' });
    await failIn(window, 'board');

    await expect(window.getByTestId('failure-board')).toBeVisible();
    await expect(window.getByTestId('undo')).toBeEnabled();

    await requestClose(app);
    const dialog = window.getByTestId('unsaved-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('unsaved-cancel').click();
    await expectPieces(window, '1');
  } finally {
    await closeApp(app);
  }
});

test('a dialog that fails closes with a notice, and leaves the project as it was', async () => {
  const { app, window } = await launch(state);
  try {
    await drawAPanel(window, { parts: '1' });
    await openSettings(window);
    await failIn(window, 'settings');

    const notice = window.getByTestId('failure-settings');
    await expect(notice).toBeVisible();
    await notice.getByTestId('failure-settings-close').click();
    await expect(notice).toHaveCount(0);
    await expectPieces(window, '1');
  } finally {
    await closeApp(app);
  }
});

test('a window that fails whole keeps its recovery copy through the quit, and the next start offers it', async () => {
  const first = await launch(state);
  try {
    await drawAPanel(first.window, { parts: '1' });
    await expect.poll(() => recoveryCopies(state).length).toBe(1);
    await failIn(first.window, 'window');
    await expect(first.window.getByTestId('failure-window')).toBeVisible();
    await expectNoViolations(first.window, 'a window that failed');

    // Its question went with the interface: the close goes straight through,
    // and is not taken for a clean exit. macOS stays running with no window,
    // and `closeApp` quits it.
    const quit = new Promise((done) => first.app.process().once('exit', done));
    await requestClose(first.app);
    if (process.platform !== 'darwin') await quit;
  } finally {
    await closeApp(first.app);
  }
  expect(recoveryCopies(state)).toHaveLength(1);

  const second = await launch(state);
  try {
    const dialog = second.window.getByTestId('recovery-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('recovery-recover').click();
    await expectPieces(second.window, '1');
  } finally {
    await closeApp(second.app);
  }
});
