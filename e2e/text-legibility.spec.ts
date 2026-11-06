import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';
import { closeActiveTab, fromProjectMenu } from './projectMenu.js';

const warning = '[data-code="TEXT_TOO_SMALL_TO_PRINT"]';

async function placeLabel(window: Page): Promise<void> {
  await drawAPanel(window, { parts: '1' });
  await window.getByTestId('tool-text').click();
  await expect(window.getByTestId('tool-text')).toHaveClass(/\bactive\b/);
  const board = await window.getByTestId('editor-canvas').boundingBox();
  if (board === null) throw new Error('The board is not visible');
  await window.mouse.click(board.x + 180, board.y + 210);
  await window.getByTestId('label-text').fill('Fold');
  await expect(window.getByTestId('feature-count')).toHaveText('2');
}

test('small text warns in Properties and Problems, and changing Size clears it undoably (Q34)', async () => {
  await withApp(async (window, app) => {
    await placeLabel(window);
    const properties = window.getByTestId('property-panel');
    const size = properties.getByLabel('Size');
    await size.fill('1.5');
    await size.press('Enter');

    const local = properties.locator(warning);
    await expect(local).toHaveAttribute('data-severity', 'warning');
    await expect(local).toContainText('Text too small to print');
    await expect(local).toContainText('Increase Size in Properties');
    await expect(size).toHaveValue('1.5');
    await window.getByTestId('problems-toggle').click();
    const problems = window.getByTestId('problems-panel');
    const row = problems.locator(warning);
    await expect(row).toHaveCount(1);
    await expect(row.locator('.problem-message')).toHaveText(
      (await local.locator('.problem-message').textContent()) ?? '',
    );
    await row.click();
    await expect(window.getByTestId('label-text')).toHaveValue('Fold');
    await expectNoViolations(window, 'small-text warning in Problems and Properties');

    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window === undefined) throw new Error('The app window is missing');
      return (await window.webContents.capturePage()).toPNG().toString('base64');
    });
    const screenshot = test.info().outputPath('small-text-warning.png');
    writeFileSync(screenshot, Buffer.from(png, 'base64'));
    await test.info().attach('small-text-warning', { path: screenshot, contentType: 'image/png' });

    // Size is an em size: at 2.15 mm, this face's capitals exceed 1.5 mm.
    await size.fill('2.15');
    await size.press('Enter');
    await expect(problems.locator(warning)).toHaveCount(0);
    await expect(properties.locator(warning)).toHaveCount(0);
    await window.getByTestId('undo').click();
    await expect(problems.locator(warning)).toHaveCount(1);
    await expect(size).toHaveValue('1.5');
    await window.getByTestId('redo').click();
    await expect(problems.locator(warning)).toHaveCount(0);
  });
});

test('small text can be saved and reopened with its warning recomputed (Q34)', async () => {
  await withApp(async (window, app) => {
    const file = join(mkdtempSync(join(tmpdir(), 'leathercad-q34-')), 'Small text.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);
    await placeLabel(window);
    const size = window.getByTestId('property-panel').getByLabel('Size');
    await size.fill('1');
    await size.press('Enter');
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    await closeActiveTab(window);
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    await window.getByTestId('problems-toggle').click();
    const row = window.getByTestId('problems-panel').locator(warning);
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(window.getByTestId('label-text')).toHaveValue('Fold');
    await expect(size).toHaveValue('1');
  });
});
