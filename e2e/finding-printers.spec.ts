import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { ONE_PRINTER, fakeCups } from './fakeCups.js';
import { launchApp } from './launchApp.js';

test.skip(process.platform === 'win32', 'no CUPS on Windows: the preview saves a PDF instead');

/**
 * Asking CUPS for its printers takes a second or two. Until it answers, the
 * Print dialog says it is looking, rather than showing an empty Printer and a
 * Print button that is disabled for no stated reason.
 */
test('the Print dialog says it is looking for printers until they are found', async () => {
  const cups = fakeCups(`sleep 2\n${ONE_PRINTER}`);
  const app = await launchApp({ env: { PATH: `${cups.bin}:${process.env['PATH'] ?? ''}` } });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');

    await window.getByTestId('print').click();
    const dialog = window.getByTestId('print-preview');
    await expect(dialog.getByTestId('print-finding-printers')).toHaveText('Looking for printers…');
    await expect(dialog.getByTestId('print-printer')).toHaveValue('LeatherCAD_Test');
    await expect(dialog.getByTestId('print-finding-printers')).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});
