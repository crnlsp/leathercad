import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp, openSample } from './launchApp.js';
import { openSettings } from './openSettings.js';

/**
 * 9.26: a hole set knows its iron's tooth. The maker says in My tools that an
 * iron has round prongs; a hole set made with it shows the round tooth in
 * Properties, and a laser cut with the stitch-holes layer carries a circle of
 * the prong's diameter at every hole, read back from the file.
 */
test('a round iron’s holes are cut as circles of its prong in a laser SVG (9.26)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-9.26-'));
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-9.26-config-'));
  const svg = join(dir, 'round.svg');
  const { app, window } = await openApp({
    env: { XDG_CONFIG_HOME: configHome },
    size: [1400, 860],
  });

  try {
    // My tools: a round iron of my own, made the default.
    await openSettings(window);
    await window.getByTestId('settings-tab-tools').click();
    const pane = window.getByTestId('settings-pane-tools');
    await pane.getByTestId('add-iron').click();
    const name = pane.locator('[data-testid^="iron-name-"]').last();
    await name.fill('Round prong 3.85');
    await name.press('Enter');
    const row = pane.locator('tbody tr').last();
    const pitch = row.getByLabel('Pitch of Round prong 3.85');
    await pitch.fill('3.85');
    await pitch.press('Enter');
    await row.getByLabel('Teeth of Round prong 3.85').selectOption('round');
    await row.getByRole('radio').check();
    await window.getByTestId('settings-close').click();

    // Holes along the sample's outer stitching, from that iron.
    await openSample(window);
    await window.getByTestId('feature-row-outer-stitch').click();
    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-holes').click();
    await expect(panel.getByTestId('iron-preset').locator('option:checked')).toHaveText(
      'Round prong 3.85',
    );
    await expect(panel.getByTestId('tooth-shape')).toHaveValue('round');
    await expect(panel.getByRole('textbox', { name: /^Diameter/ })).toHaveValue('1.2');
    await expectNoViolations(window, 'a hole set’s tooth in Properties');
    const holes = Number(await panel.getByTestId('hole-count').textContent());
    expect(holes).toBeGreaterThan(20);

    // A typed slit is one step, and undo gives the round tooth back.
    await panel.getByTestId('tooth-shape').selectOption('slit');
    await expect(panel.getByTestId('tooth-lean')).toHaveValue('standard');
    await window.getByTestId('undo').click();
    await expect(panel.getByTestId('tooth-shape')).toHaveValue('round');

    // The laser cut, with its holes.
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, svg);
    await window.getByTestId('export-more').click();
    await window.getByTestId('export-svg').click();
    await window.getByTestId('export-intent-laser-cut').check();
    await window.getByTestId('export-layer-stitch-holes').check();
    await window.getByTestId('export-go').click();
    await expect.poll(() => existsSync(svg), { timeout: 10_000 }).toBe(true);

    // Every hole of the new set, a circle 1.2 mm across; the sample's own
    // hole sets, whose iron was never said, keep their 1 mm centre marks.
    const radii = [...readFileSync(svg, 'utf8').matchAll(/<circle [^>]*r="([\d.]+)"/g)].map(
      ([, r]) => r,
    );
    expect(radii.filter((r) => r === '0.6')).toHaveLength(holes);
    expect(radii.every((r) => r === '0.6' || r === '0.5')).toBe(true);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
