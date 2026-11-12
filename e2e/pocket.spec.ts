import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
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

test('a pocket says whether its card goes in, with the maker’s own ease (9.14b)', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-pocket-'));
  const launch = (name: string) =>
    openApp({
      args: [resolve(`fixtures/projects/${name}.lcp`)],
      env: { XDG_CONFIG_HOME: configHome },
      size: [1440, 900],
    });
  const holdACard = async (window: Page) => {
    const row = window.getByTestId('feature-row-pocket-stitch');
    if (!(await row.isVisible())) await window.getByTestId('toggle-parts').click();
    await row.click();
    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('pocket-holds').selectOption('id-1');
    return panel;
  };

  const bifold = await launch('bifold-wallet');
  try {
    const { window } = bifold;
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-tools').click();
    const ease = window.getByTestId('setting-pocket-ease').getByRole('textbox');
    await ease.fill('4');
    await ease.press('Enter');
    await window.getByTestId('settings-close').click();

    const panel = await holdACard(window);
    // The first requirement takes its ease from My tools.
    await expect(panel.getByRole('textbox', { name: 'Ease' })).toHaveValue('4');
    const problems = panel.getByTestId('feature-problems');
    await expect(problems).toContainText('Pocket too narrow');
    await expect(problems).toContainText('a payment card with 4.00 mm of ease needs 89.60 mm');
    await expect(panel.getByTestId('pocket-proud')).toHaveText(
      'What it holds goes 3.02 mm below the opening.',
    );
    await expect(problems).not.toContainText('Pocket too shallow');

    // Held fully, the card still fits: 57 mm below the opening for a 53.98 mm card,
    // and the ease is room across the pocket, not under it (D22).
    const fully = panel.getByTestId('pocket-fully');
    await fully.check();
    await expect(fully).toBeChecked();
    await expect(problems).toContainText('Pocket too narrow');
    await expect(problems).not.toContainText('Pocket too shallow');

    // Each change is one undo step; undoing them all leaves the pocket as it shipped.
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('ControlOrMeta+z');
    await expect(fully).not.toBeChecked();
    await window.keyboard.press('ControlOrMeta+z');
    await expect(panel.getByTestId('pocket-holds')).toHaveValue('none');
    await expect(problems).toHaveCount(0);
  } finally {
    await closeApp(bifold.app);
  }

  const cardHolder = await launch('card-holder');
  try {
    const panel = await holdACard(cardHolder.window);
    await expect(panel.getByRole('textbox', { name: 'Ease' })).toHaveValue('4');
    // 99.0 mm across: the card goes in. It stands proud, as a card holder means it to (D15).
    await expect(panel.getByTestId('pocket-proud')).toHaveText(
      'What it holds stands 9.63 mm above the opening.',
    );
    const problems = panel.getByTestId('feature-problems');
    await expect(problems).toHaveCount(0);

    // Asked to hold it fully, the card holder says plainly that it cannot.
    await panel.getByTestId('pocket-fully').check();
    await expect(problems).toContainText('Pocket too shallow');
    await expect(problems).toContainText('a payment card needs 53.98 mm to go in fully');
    await expectNoViolations(cardHolder.window, 'a pocket that says what it holds');
  } finally {
    await closeApp(cardHolder.app);
  }
});
