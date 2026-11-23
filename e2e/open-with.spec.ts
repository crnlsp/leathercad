import { copyFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { drawAPanel, launchApp } from './launchApp.js';
import { expectPieces } from './counts.js';

/**
 * Slice 8.5: a `.lcp` double-clicked in the file manager starts the app with
 * its path on the command line, and the app opens it — and may save it back,
 * since the maker chose it in their file manager.
 */

const ROOT = resolve(import.meta.dirname, '..');

test('a project named on the command line opens, and saves back where it came from', async () => {
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Wallet from Files.lcp');
  copyFileSync(resolve(ROOT, 'fixtures/projects/bifold-wallet.lcp'), project);
  const before = statSync(project).mtimeMs;

  const app = await launchApp({
    args: [project],
    env: { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-')) },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('project-menu')).toBeVisible();

    await expectPieces(window, '3');
    await expect(window.getByTestId('project-name').locator('..')).toHaveAttribute(
      'title',
      /Wallet from Files/,
    );

    // An edit to save — not a rename, which renames the file too (8.12).
    await drawAPanel(window, { parts: '4' });
    // The button, not Ctrl+S: a key typed in a text field stays in it.
    await window.keyboard.press('Control+S');
    await expect(window.getByTestId('announce-save')).toHaveText('Saved');
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    expect(statSync(project).mtimeMs).toBeGreaterThan(before);
  } finally {
    await closeApp(app);
  }
});
