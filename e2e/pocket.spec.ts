import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { resizeWindow } from './windowSize.js';
import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

for (const size of [
  [1440, 900],
  [860, 600],
] as const) {
  test(`pocket measurements are clear and fit at ${size[0]} × ${size[1]} (9.14a)`, async () => {
    const { app, window } = await openApp({
      args: [resolve('fixtures/projects/card-holder.lcp')],
      size,
    });
    try {
      await resizeWindow(app, window, size[0], size[1]);
      const select = async (id: string) => {
        const row = window.getByTestId('feature-row-' + id);
        if (!(await row.isVisible())) await window.getByTestId('toggle-parts').click();
        await row.click();
        const toggle = window.getByTestId('toggle-properties');
        if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
      };
      await select('pocket-stitch');
      const reading = window.getByTestId('pocket-reading');
      await expect(reading.getByTestId('pocket-width')).toHaveText('99 mm');
      await expect(reading.getByTestId('pocket-depth')).toHaveText('41.35 mm');
      await expect(reading).toContainText('the pocket opening may extend above it');
      await expect(reading).toContainText('Leather thickness and stitching tension');
      expect(await reading.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await window.getByTestId('editor-canvas').focus();
      await window.keyboard.press('Shift+Digit2');
      for (let i = 0; i < 15; i++) {
        const previous = await window.getByTestId('zoom-level').innerText();
        if (Number.parseInt(previous, 10) <= 30) break;
        // Properties overlays the bottom-right zoom buttons at the minimum width.
        await window.keyboard.press('ControlOrMeta+-');
        await expect(window.getByTestId('zoom-level')).not.toHaveText(previous);
      }
      const summary = window.getByTestId('pocket-summary');
      await expect(summary).toBeVisible();
      await expect(summary.getByTestId('pocket-width')).toHaveText('99 mm');
      await expect(summary.getByTestId('pocket-depth')).toHaveText('41.35 mm');
      expect(
        await window
          .getByTestId('selection-bar')
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await select('pocket-holes');
      await expect(reading.getByTestId('pocket-depth')).toHaveText('41.35 mm');
      await select('outer-stitch');
      await expect(reading).toHaveCount(0);
      await select('pocket-stitch');
      await expectNoViolations(window, 'pocket stitching measurements');
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win === undefined) throw new Error('window required');
        return (await win.webContents.capturePage()).toPNG().toString('base64');
      });
      writeFileSync(test.info().outputPath('pocket.png'), Buffer.from(png, 'base64'));
      expect(await window.title()).not.toContain('•');
    } finally {
      await closeApp(app);
    }
  });
}
