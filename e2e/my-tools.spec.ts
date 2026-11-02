import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { openApp, openSample } from './launchApp.js';

/**
 * U.13, R-15: Settings › My tools. The maker's irons are what a hole set's
 * Iron menu lists, one of them the default a new hole set takes; the stitch
 * margin and the leather's thickness are what the app makes new stitch lines,
 * allowances and folds with. Each new thing keeps its own copy, so a hole set
 * keeps its iron's name after the iron is renamed or deleted.
 */

const launch = (configHome: string) =>
  openApp({ env: { XDG_CONFIG_HOME: configHome }, size: [1400, 860] });

async function myTools(window: Page): Promise<ReturnType<Page['getByTestId']>> {
  await window.getByTestId('settings').click();
  await window.getByTestId('settings-tab-tools').click();
  return window.getByTestId('settings-pane-tools');
}

const ironRows = (pane: ReturnType<Page['getByTestId']>) =>
  pane.locator('[data-testid^="iron-name-"]');

test('a maker’s own iron becomes the default a new hole set takes, and is kept across a restart (U.13)', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-tools-'));
  const first = await launch(configHome);
  try {
    const { window } = first;
    const pane = await myTools(window);
    // A first launch lists the irons the menu offered before My tools.
    await expect(ironRows(pane).first()).toHaveValue('KS Blade 3.85 mm');

    await pane.getByTestId('add-iron').click();
    const name = ironRows(pane).last();
    await expect(name).toBeFocused();
    await name.fill('Diamond 3.38');
    await name.press('Enter');
    const row = pane.locator('tbody tr').last();
    const pitch = row.getByLabel('Pitch of Diamond 3.38');
    await pitch.fill('3.38');
    await pitch.press('Enter');
    await row.getByRole('radio').check();
    await window.getByTestId('settings-close').click();

    await openSample(window);
    await window.getByTestId('feature-row-outer-stitch').click();
    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-holes').click();
    const iron = panel.getByTestId('iron-preset');
    await expect(iron.locator('option:checked')).toHaveText('Diamond 3.38');
    await expect(panel.getByRole('textbox', { name: /^Pitch/ })).toHaveValue('3.38');
  } finally {
    await closeApp(first.app);
  }

  const second = await launch(configHome);
  try {
    const pane = await myTools(second.window);
    const row = pane.locator('tbody tr').last();
    await expect(row.getByTestId(/^iron-name-/)).toHaveValue('Diamond 3.38');
    await expect(row.getByRole('radio')).toBeChecked();
  } finally {
    await closeApp(second.app);
  }
});

test('a hole set keeps its iron’s name after the iron is renamed or deleted (U.13)', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-tools-'));
  const { app, window } = await launch(configHome);
  try {
    await openSample(window);
    await window.getByTestId('feature-row-outer-stitch').click();
    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-holes').click();
    const iron = panel.getByTestId('iron-preset');
    await expect(iron.locator('option:checked')).toHaveText('KS Blade 3.85 mm');

    // Rename the default from its menu: the caret goes to its name.
    const pane = await myTools(window);
    await pane.getByTestId('iron-menu-ks-3.85').click();
    await window.getByTestId('rename-iron-ks-3.85').click();
    const name = pane.getByTestId('iron-name-ks-3.85');
    await expect(name).toBeFocused();
    await name.fill('Diamond 3.85');
    await name.press('Enter');
    await window.getByTestId('settings-close').click();

    // The set was made with "KS Blade 3.85 mm", and still says so; the
    // renamed iron is offered beside it.
    await expect(iron.locator('option:checked')).toHaveText('KS Blade 3.85 mm');
    await expect(iron.locator('option', { hasText: 'Diamond 3.85' })).toHaveCount(1);

    // Deleting every iron leaves Custom, and a new set the project's pitch.
    const again = await myTools(window);
    while ((await ironRows(again).count()) > 0) {
      const id = (await ironRows(again).first().getAttribute('data-testid'))!.slice(
        'iron-name-'.length,
      );
      await again.getByTestId(`iron-menu-${id}`).click();
      await window.getByTestId(`delete-iron-${id}`).click();
    }
    await expect(again.getByTestId('no-irons')).toBeVisible();
    await window.getByTestId('settings-close').click();
    await window.getByTestId('feature-row-outer-stitch').click();
    await panel.getByTestId('add-stitch-holes').click();
    await expect(iron.locator('option:checked')).toHaveText('Custom');
    await expect(panel.getByRole('textbox', { name: /^Pitch/ })).toHaveValue('3.85');
  } finally {
    await closeApp(app);
  }
});

test('a new stitch line, allowance and fold take the maker’s margin and leather (U.13)', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-tools-'));
  const { app, window } = await launch(configHome);
  try {
    const pane = await myTools(window);
    const margin = pane.getByTestId('setting-margin').getByRole('textbox');
    await margin.fill('5');
    await margin.press('Enter');
    const thickness = pane.getByTestId('setting-thickness').getByRole('textbox');
    await expect(thickness).toHaveValue('');
    await thickness.fill('1.4');
    await thickness.press('Enter');
    // Escape on an edit cancels the edit, not Settings.
    await thickness.fill('9');
    await thickness.press('Escape');
    await expect(window.getByTestId('settings-dialog')).toBeVisible();
    await expect(thickness).toHaveValue('1.4');
    await window.getByTestId('settings-close').click();

    await openSample(window);
    const panel = window.getByTestId('property-panel');
    await window.getByTestId('feature-row-outer-outline').click();
    await panel.getByTestId('add-stitch-line').click();
    await expect(panel.getByLabel('Edge margin')).toHaveValue('5');

    // A fold drawn on the selected piece carries the thickness.
    await window.getByTestId('feature-row-outer-outline').click();
    await window.getByTestId('tool-line').click();
    await window.getByTestId('draw-as-fold').click();
    await expect(window.getByTestId('draw-as-fold')).toHaveAttribute('aria-pressed', 'true');
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    const y = box.y + box.height / 2;
    await window.mouse.click(box.x + box.width * 0.45, y);
    await window.mouse.click(box.x + box.width * 0.55, y);
    await expect(panel.getByLabel('Thickness')).toHaveValue('1.4');
  } finally {
    await closeApp(app);
  }
});
