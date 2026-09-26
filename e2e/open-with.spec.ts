import { copyFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * Slice 8.5: a `.lcp` double-clicked in the file manager starts the app with
 * its path on the command line, and the app opens it — and may save it back,
 * since the maker chose it in their file manager.
 */

const ROOT = resolve(import.meta.dirname, '..');
const DESKTOP_DIR = resolve(ROOT, 'apps/desktop');

test('a project named on the command line opens, and saves back where it came from', async () => {
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Wallet from Files.lcp');
  copyFileSync(resolve(ROOT, 'fixtures/projects/bifold-wallet.lcp'), project);
  const before = statSync(project).mtimeMs;

  const app = await electron.launch({
    args: ['.', project],
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-')) },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.getByTestId('file-path')).toContainText('Wallet from Files');

    await window.getByTestId('project-name').fill('Wallet, edited');
    // The button, not Ctrl+S: a key typed in a text field stays in it.
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    expect(statSync(project).mtimeMs).toBeGreaterThan(before);
  } finally {
    await closeApp(app);
  }
});
