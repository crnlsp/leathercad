import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * Slice 8.3: a finished pattern to take apart, from Help or from the empty
 * Parts panel. It opens untitled and clean, so Save asks where and the copy
 * inside the app is never written.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

test('the sample wallet opens from the empty Parts panel and from Help, clean and untitled', async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-')) },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.getByTestId('project-name')).toHaveValue('Bifold wallet');
    const parts = window.getByTestId('parts-list');
    for (const name of ['Outer', 'Lining', 'Card pocket']) await expect(parts).toContainText(name);
    // A sample that shows a problem teaches the wrong thing.
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
    // Untitled, and nothing to save yet.
    await expect(window.getByTestId('file-path')).toHaveCount(0);
    expect(await window.title()).not.toContain('•');

    // From Help, over unsaved work: asked first, like any other open.
    await window.getByTestId('project-name').fill('My changes');
    await app.evaluate(({ Menu }) => {
      const help = Menu.getApplicationMenu()?.items.find((entry) => entry.label === 'Help');
      help?.submenu?.items.find((entry) => entry.label === 'Open Sample Project')?.click();
    });
    const dialog = window.getByTestId('unsaved-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('unsaved-discard').click();
    await expect(window.getByTestId('project-name')).toHaveValue('Bifold wallet');
  } finally {
    await closeApp(app);
  }
});
