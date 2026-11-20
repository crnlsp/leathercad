import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import en from '../apps/desktop/src/locales/en.json' with { type: 'json' };
import { closeApp } from './closeApp.js';
import { drawAPanel, launchApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * A file that is not a project is refused in the interface's words, never in
 * the loader's (X30, U.24h): "Not a readable .lcp archive: invalid zip data"
 * was persist's English, shown as it was, in every language.
 */
test('an unreadable file is refused in the app’s words, and the open project stays', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lc-unreadable-'));
  const file = join(directory, 'Not a project.lcp');
  writeFileSync(file, 'not a zip archive');
  const app = await launchApp({ startScreen: true });
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('start-screen')).toBeVisible();
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);

    // On the start screen, with no project open.
    await window.getByTestId('start-open').click();
    await expect(window.getByTestId('file-error')).toHaveText(en.file.notArchive);

    // Over a project being worked on, which stays as it was.
    await window.getByTestId('start-new').click();
    await drawAPanel(window, { parts: '1' });
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('file-error')).toHaveText(en.file.notArchive);
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(1);
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.screenshot({ path: test.info().outputPath('unreadable-refusal.png') });
  } finally {
    await closeApp(app);
    rmSync(directory, { recursive: true, force: true });
  }
});
