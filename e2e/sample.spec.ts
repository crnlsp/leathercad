import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp, openSample } from './launchApp.js';
import { renameProject } from './projectMenu.js';

/**
 * Slice 8.3: a finished pattern to take apart. Since 8.14 it is the first
 * template — *New project from template…* — and has no button of its own. It
 * opens untitled and clean, so Save asks where and the copy inside the app is
 * never written.
 */

test('the sample wallet opens as a template, clean and untitled, and nowhere else', async () => {
  const app = await launchApp({
    env: { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-')) },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    // No offer of it in the empty Parts panel, nor in Help.
    await expect(window.getByTestId('parts-list')).not.toContainText('sample');
    await window.getByTestId('help-menu').click();
    await expect(window.getByTestId('help-menu-items')).not.toContainText('sample');
    await window.keyboard.press('Escape');

    await openSample(window);
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.getByTestId('project-name')).toHaveText('Bifold wallet');
    const parts = window.getByTestId('parts-list');
    for (const name of ['Outer', 'Lining', 'Card pocket']) await expect(parts).toContainText(name);
    // A sample that shows a problem teaches the wrong thing.
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
    // Untitled, and nothing to save yet.
    await expect(window.getByTestId('file-path')).toHaveCount(0);
    expect(await window.title()).not.toContain('•');

    // Again, over unsaved work: in a tab of its own (8.12), so nothing is
    // asked and nothing is lost.
    await renameProject(window, 'My changes');
    await openSample(window);
    await expect(window.getByTestId('unsaved-dialog')).toHaveCount(0);
    await expect(window.getByTestId('project-name')).toHaveText('Bifold wallet');
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveText([
      'My changes',
      'Bifold wallet',
    ]);
  } finally {
    await closeApp(app);
  }
});

test('no feature name in Parts breaks inside a word, at any window width (Q5)', async () => {
  // Names wrap rather than truncate (F.6), but in the narrower layout the
  // column left beside the toggles was narrower than "mirrored", so the name
  // read "Cut-out mirrore / d". The sample's names are the ones a maker meets
  // first. A word broken across lines has one client rect per line.
  const app = await launchApp({
    env: { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-')) },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await openSample(window);
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

    // Each width band the frame steps through (§5, U.5): wide; below 1280,
    // the rail's keys, Parts at 208 and Properties a strip; and below 900,
    // Parts opened over the board.
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
