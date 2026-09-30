import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';

/** Q29: a part picked by its heading is a selection everywhere, not nothing. */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

test('a part picked by its heading is shown, counted and deleted as the part (Q29)', async () => {
  const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-part-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_CONFIG_HOME: fresh(), XDG_STATE_HOME: fresh() },
  });
  try {
    const window = await app.firstWindow();
    window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 300, box.y + 260, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('tool-select').click();

    const heading = window.locator('[data-testid^="part-heading-"]').first();
    await heading.click();

    // Counted as a part, and shown as the part, not as nothing.
    await expect(window.getByTestId('status-counts')).toContainText('1 part selected');
    const panel = window.getByTestId('property-panel');
    await expect(panel.getByTestId('property-header')).toContainText('Panel');
    await expect(panel.getByTestId('part-name')).toHaveValue('Panel');
    await expect(panel.getByText('Perimeter')).toBeVisible();
    await expect(panel.getByTestId('delete-part')).toBeEnabled();

    // The Delete key takes the part whole, as one step of undo.
    await window.keyboard.press('Delete');
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // A duplicate is picked as its part, and shown as it.
    await heading.click();
    await window.locator('[data-testid^="part-menu-"]').first().click();
    await window.locator('[data-testid^="duplicate-part-"]').first().click();
    await expect(window.getByTestId('part-count')).toHaveText('2');
    await expect(panel.getByTestId('part-name')).toHaveValue('Panel copy');
  } finally {
    await closeApp(app);
  }
});

test('Delete in Properties says so when a locked stitch line behind the outline refuses it (Q29)', async () => {
  const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-part-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_CONFIG_HOME: fresh(), XDG_STATE_HOME: fresh() },
  });
  try {
    const window = await app.firstWindow();
    window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 300, box.y + 260, { steps: 5 });
    await window.mouse.up();
    await window.getByTestId('add-stitch-line').click();

    const rows = window.locator('[data-testid^="feature-row-"]');
    await expect(rows).toHaveCount(2);
    // Lock the stitch line, then pick the outline it follows.
    await window.locator('[data-testid^="feature-locked-"]').nth(1).click();
    await rows.nth(0).click();

    const panel = window.getByTestId('property-panel');
    await expect(panel.getByTestId('delete-feature')).toBeDisabled();
    await expect(panel.getByTestId('delete-feature-reason')).toContainText('locked');
  } finally {
    await closeApp(app);
  }
});
