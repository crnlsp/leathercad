import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

import { loadProject, readManifest } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

const cardHolder = resolve(import.meta.dirname, '../fixtures/projects/card-holder.lcp');

test('mark a seam every 6th pair from Properties, in one undo step, and save it (9.13)', async () => {
  const saved = join(mkdtempSync(join(tmpdir(), 'leathercad-marks-')), 'Marked.lcp');
  copyFileSync(cardHolder, saved);
  const { app, window } = await openApp({ args: [saved], size: [1440, 1000] });
  try {
    await window.getByTestId('feature-row-pocket-holes').click();
    const panel = window.getByTestId('seam-panel');
    const left = panel.getByTestId('seam-row').nth(0);
    await expect(left).toContainText('Pocket');
    await expect(left.getByTestId('seam-marked')).toHaveCount(0);

    await left.getByTestId('seam-edit').click();
    await panel.getByTestId('seam-marks').selectOption('every');
    const step = panel.getByRole('textbox', { name: 'Mark every' });
    await expect(step).toHaveValue('5');
    await step.fill('6');
    await step.press('Enter');
    await expectNoViolations(window, 'alignment marks in the seam panel');
    await window.screenshot({ path: test.info().outputPath('marks-preview.png') });
    await panel.getByTestId('seam-commit').click();
    await expect(left.getByTestId('seam-marked')).toHaveText('Marked every 6 pairs');

    await window.getByTestId('undo').click();
    await expect(left.getByTestId('seam-marked')).toHaveCount(0);
    await window.getByTestId('redo').click();
    await expect(left.getByTestId('seam-marked')).toHaveText('Marked every 6 pairs');

    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    const bytes = readFileSync(saved);
    expect(readManifest(bytes).formatVersion).toBe(13);
    expect(loadProject(bytes).project.seams?.[0]).toMatchObject({
      id: 'pocket-left-seam',
      marks: { kind: 'every', n: 6 },
    });
  } finally {
    await window.screenshot({ path: test.info().outputPath('marks-final.png') });
    await closeApp(app);
  }
});
