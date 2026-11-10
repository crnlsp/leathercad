import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { loadProject } from '../packages/persist/src/index.js';
import { diagnose } from '../packages/domain/src/index.js';
import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

for (const [id, name] of [
  ['card-holder', 'Card holder'],
  ['bifold-wallet', 'Bifold wallet'],
  ['key-fob', 'Key fob'],
  ['coaster', 'Coaster'],
]) {
  test(`${name} opens clean and untitled, saves a copy and exports a PDF (8.14b)`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leathercad-template-build-'));
    const project = join(dir, id + '.lcp');
    const pdf = join(dir, id + '.pdf');
    const { app, window } = await openApp({ size: [1440, 1000] });
    try {
      await fromProjectMenu(window, 'new-template');
      await window.getByTestId('template-builtin:' + id).dblclick();
      await expect(window.getByTestId('project-name')).toHaveText(name);
      await expect(window.getByTestId('file-path')).toHaveCount(0);
      expect(await window.title()).not.toContain('•');
      await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
      if (id === 'card-holder') {
        await window.getByTestId('feature-row-pocket-holes').click();
        await expect(window.getByTestId('seam-row')).toHaveCount(3);
        for (const verdict of await window
          .getByTestId('seam-panel')
          .getByTestId('seam-verdict')
          .all())
          await expect(verdict).toHaveAttribute('data-severity', 'info');
      }
      if (id === 'key-fob') {
        await window.getByTestId('feature-row-strap-rivet-b').click();
        await expect(window.getByTestId('mirrored-badge')).toBeVisible();
      }
      await expectNoViolations(window, 'audited ' + id + ' template');
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const page = BrowserWindow.getAllWindows()[0];
        if (page === undefined) throw new Error('app window required');
        return (await page.webContents.capturePage()).toPNG().toString('base64');
      });
      writeFileSync(test.info().outputPath(id + '.png'), Buffer.from(png, 'base64'));
      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      }, project);
      await fromProjectMenu(window, 'save-as');
      await expect(window.getByTestId('save-state')).toHaveText('Saved');
      expect(diagnose(loadProject(readFileSync(project)).project)).toEqual([]);
      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      }, pdf);
      await window.getByTestId('export-pdf').click();
      await expect.poll(() => existsSync(pdf)).toBe(true);
      expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await closeApp(app);
    }
  });
}

test('partial stitching controls explain a seam refusal, then edit in one undo step', async () => {
  const { app, window } = await openApp({ size: [1440, 1000] });
  try {
    await fromProjectMenu(window, 'new-template');
    await window.getByTestId('template-builtin:card-holder').dblclick();
    await window.getByTestId('feature-row-pocket-stitch').click();
    await expect(window.getByTestId('stitch-run')).toHaveValue('between');
    await expect(window.getByLabel('From corner', { exact: true })).toHaveValue('2');
    await expect(window.getByLabel('To corner', { exact: true })).toHaveValue('1');
    await window.getByTestId('stitch-run').selectOption('whole');
    await expect(window.getByTestId('stitch-run')).toHaveValue('between');
    await expect(window.getByTestId('stitch-run-refusal')).toBeVisible();
    await window.getByTestId('feature-row-pocket-holes').click();
    for (let i = 0; i < 3; i++) await window.getByTestId('seam-unsew').first().click();
    await window.getByTestId('feature-row-pocket-stitch').click();
    await window.getByTestId('stitch-run').selectOption('whole');
    await expect(window.getByTestId('stitch-run')).toHaveValue('whole');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('stitch-run')).toHaveValue('between');
    await expectNoViolations(window, 'partial stitching controls');
  } finally {
    await closeApp(app);
  }
});
