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

test('no feature name in Parts breaks inside a word, at any window width (Q5)', async () => {
  // Names wrap rather than truncate (F.6), but in the narrower layout the
  // column left beside the toggles was narrower than "mirrored", so the name
  // read "Cut-out mirrore / d". The sample's names are the ones a maker meets
  // first. A word broken across lines has one client rect per line.
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

    const brokenWords = (): Promise<string[]> =>
      window.evaluate(() => {
        const broken: string[] = [];
        for (const name of document.querySelectorAll('.feature-name')) {
          const text = name.firstChild;
          if (text === null || text.nodeType !== Node.TEXT_NODE) continue;
          for (const word of (text.textContent ?? '').matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(text, word.index);
            range.setEnd(text, word.index + word[0].length);
            if (range.getClientRects().length > 1) broken.push(word[0]);
          }
        }
        return broken;
      });

    // Each width band the frame steps through: wide, the step at 1280, the
    // Properties overlay below 1024, and the Parts overlay below 900.
    for (const width of [1440, 1200, 1000, 880]) {
      await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(size, 640);
      }, width);
      await expect.poll(() => window.evaluate(() => window.innerWidth)).toBe(width);
      if (width < 900) {
        await window.getByTestId('toggle-parts').click();
        await expect(window.getByTestId('parts-list')).toBeVisible();
      }
      await expect.poll(brokenWords, { message: `at ${String(width)} px` }).toEqual([]);
    }
  } finally {
    await closeApp(app);
  }
});
