import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

import { loadProject, readManifest } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

const cardHolder = resolve(import.meta.dirname, '../fixtures/projects/card-holder.lcp');

/**
 * Q21: the card holder's pocket, cut twice, is made a mirrored pair from
 * Properties. Parts and the production summary say 1 + 1 mirrored, undo takes
 * it back in one step, and the saved file holds the flag in format 15.
 */
test('cut the pocket as a mirrored pair: Parts and the summary say 1 + 1 mirrored (Q21)', async () => {
  const saved = join(mkdtempSync(join(tmpdir(), 'leathercad-pair-')), 'Paired.lcp');
  copyFileSync(cardHolder, saved);
  const { app, window } = await openApp({ args: [saved], size: [1440, 1000] });
  try {
    await window.getByTestId('part-heading-pocket').click();
    const panel = window.getByTestId('property-panel');
    const pair = panel.getByTestId('part-mirrored-pair');
    await expect(pair).toHaveAccessibleName('Cut as a mirrored pair');
    await expect(pair).not.toBeChecked();

    await pair.check();
    await expect(window.getByTestId('part-heading-pocket')).toContainText('1 + 1 mirrored');
    await expectNoViolations(window, 'a mirrored pair in Properties');

    await window.getByTestId('undo').click();
    await expect(pair).not.toBeChecked();
    await expect(window.getByTestId('part-heading-pocket')).toContainText('×2');
    await window.getByTestId('redo').click();
    await expect(pair).toBeChecked();

    // With nothing selected, the summary counts the pair as two to cut.
    await window.keyboard.press('Escape');
    const summary = panel.getByTestId('production-summary');
    await expect(summary.getByTestId('production-pieces')).toHaveText('3pieces');
    await expect(
      summary.getByTestId('production-cut-list').getByRole('img', { name: '1 + 1 mirrored' }),
    ).toBeVisible();
    await expectNoViolations(window, 'a mirrored pair in the production summary');

    await window.keyboard.press('ControlOrMeta+S');
    await expect(window.getByTestId('announce-save')).toHaveText('Saved');
    const bytes = readFileSync(saved);
    expect(readManifest(bytes).formatVersion).toBeGreaterThanOrEqual(15);
    expect(loadProject(bytes).project.parts.find((p) => p.id === 'pocket')).toMatchObject({
      quantity: 2,
      mirroredPair: true,
    });
  } finally {
    await closeApp(app);
    rmSync(dirname(saved), { recursive: true, force: true });
  }
});
