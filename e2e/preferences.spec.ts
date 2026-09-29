import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';

/**
 * Slice 8.2: the app remembers how the maker likes it, and what they worked
 * on last. Each launch here is given the config directory it shares with the
 * next, which is what a restart is.
 */

async function launch(configHome: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await launchApp({ env: { XDG_CONFIG_HOME: configHome } });
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  // The frame is sized for a wide rail, so its remembered state shows.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1400, 860);
  });
  return { app, window };
}

async function drawAPanel(window: Page): Promise<void> {
  await window.getByTestId('tool-rectangle').click();
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.mouse.move(box.x + 150, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(box.x + 300, box.y + 260, { steps: 5 });
  await window.mouse.up();
  await expect(window.getByTestId('part-count')).toHaveText('1');
}

/** The names under the Project menu's *Recent projects* (8.7), as it shows them now. */
async function recentNames(window: Page): Promise<string[]> {
  await window.getByTestId('project-menu').click();
  const names = await window
    .getByRole('group', { name: 'Recent projects' })
    .locator('.menu-label')
    .allTextContents();
  await window.keyboard.press('Escape');
  return names;
}

test('the legend and the tool rail are as the maker left them', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-prefs-'));

  const first = await launch(configHome);
  try {
    await drawAPanel(first.window);
    const toggle = first.window.getByTestId('canvas-legend-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await expect(first.window.getByTestId('tool-rail')).not.toHaveClass(/collapsed/);
    await first.window.getByTestId('rail-toggle').click();
    await expect(first.window.getByTestId('tool-rail')).toHaveClass(/collapsed/);
  } finally {
    await closeApp(first.app);
  }

  const second = await launch(configHome);
  try {
    await expect(second.window.getByTestId('tool-rail')).toHaveClass(/collapsed/);
    await drawAPanel(second.window);
    await expect(second.window.getByTestId('canvas-legend-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  } finally {
    await closeApp(second.app);
  }
});

test('a recent project reopens from the Project menu after a restart (8.7)', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-recent-'));
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Wallet v1.2.lcp');

  const first = await launch(configHome);
  try {
    expect(await recentNames(first.window)).toEqual([]);

    await first.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    await drawAPanel(first.window);
    await first.window.keyboard.press('Control+s');
    await expect(first.window.getByTestId('file-path')).toContainText('Wallet v1.2');
    await expect.poll(() => recentNames(first.window)).toEqual(['Wallet v1.2']);
  } finally {
    await closeApp(first.app);
  }

  const second = await launch(configHome);
  try {
    // Chosen from the menu, not a dialog: the main process grants the path
    // because it is on its own list.
    await expect(second.window.getByTestId('part-count')).toHaveText('0');
    await second.window.getByTestId('project-menu').click();
    await second.window.getByRole('menuitem', { name: /Wallet v1\.2/ }).click();

    await expect(second.window.getByTestId('part-count')).toHaveText('1');
    await expect(second.window.getByTestId('file-path')).toContainText('Wallet v1.2');
    // Saved back where it came from, without a dialog: the grant covers it.
    await second.window.keyboard.press('Control+s');
    await expect(second.window.getByTestId('file-error')).toHaveCount(0);
  } finally {
    await closeApp(second.app);
  }
});

test('Settings opens on General from the gear and Ctrl+, and on Keyboard shortcuts from Ctrl+/ and ? (8.7)', async () => {
  const { app, window } = await launch(mkdtempSync(join(tmpdir(), 'leathercad-e2e-keys-')));
  try {
    const dialog = window.getByTestId('settings-dialog');

    await window.getByTestId('settings').click();
    await expect(window.getByTestId('settings-pane-general')).toBeVisible();
    await expect(window.getByTestId('settings-tab-general')).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('settings-pane-appearance')).toBeVisible();
    // A letter typed in Settings does not change the tool behind it.
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/active/);
    await window.keyboard.press('c');
    await expect(window.getByTestId('tool-circle')).not.toHaveClass(/active/);
    await window.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await window.keyboard.press('Control+,');
    await expect(window.getByTestId('settings-pane-general')).toBeVisible();
    await window.getByTestId('settings-close').click();
    await expect(dialog).toHaveCount(0);

    await window.keyboard.press('Control+/');
    await expect(window.getByTestId('settings-pane-shortcuts')).toContainText('Export PDF');
    await expect(window.getByTestId('settings-pane-shortcuts')).toContainText('Rectangle');
    await window.keyboard.press('Escape');
    await window.keyboard.press('Shift+?');
    await expect(window.getByTestId('settings-pane-shortcuts')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Typing is typing: none of the three opens anything from a text field.
    const name = window.getByTestId('project-name');
    await name.fill('Wallet');
    await name.press('Shift+?');
    await name.press('Control+/');
    await name.press('Control+,');
    await expect(name).toHaveValue('Wallet?');
    await expect(dialog).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

test('a setting applies at once and is kept, and Clear list empties the recent projects (8.7)', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-settings-'));
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Strap.lcp');

  const first = await launch(configHome);
  try {
    // The legend shows only once there is something drawn for it to explain.
    await drawAPanel(first.window);
    await first.window.getByTestId('settings').click();
    await first.window.getByTestId('settings-tab-appearance').click();
    await first.window.getByTestId('setting-legend-open').check();
    await first.window.getByTestId('settings-close').click();
    await expect(first.window.getByTestId('canvas-legend-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await first.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    await first.window.keyboard.press('Control+s');
    await expect.poll(() => recentNames(first.window)).toEqual(['Strap']);
  } finally {
    await closeApp(first.app);
  }

  const second = await launch(configHome);
  try {
    await second.window.getByTestId('settings').click();
    await second.window.getByTestId('settings-tab-appearance').click();
    await expect(second.window.getByTestId('setting-legend-open')).toBeChecked();

    await second.window.getByTestId('settings-tab-general').click();
    const general = second.window.getByTestId('settings-pane-general');
    await expect(general).toContainText('1 is listed now.');
    await general.getByTestId('clear-recent').click();
    await expect(general).toContainText('None are listed now.');
    await expect(general.getByTestId('clear-recent')).toBeDisabled();
    // Closed by its button: the disabled Clear list no longer holds focus.
    await second.window.getByTestId('settings-close').click();
    expect(await recentNames(second.window)).toEqual([]);
  } finally {
    await closeApp(second.app);
  }
});

test('hiding a part lets go of what was selected in it (Q14)', async () => {
  const { window, app } = await launch(mkdtempSync(join(tmpdir(), 'leathercad-e2e-hide-')));
  try {
    await drawAPanel(window);
    await window.getByTestId('tool-select').click();
    await window
      .getByTestId('parts-list')
      .getByRole('button', { name: /Outline/ })
      .click();
    await expect(window.getByTestId('selected-count')).toHaveText('1');

    await window
      .getByTestId('parts-list')
      .locator('[data-testid^="part-visible-"]')
      .first()
      .click();
    await expect(window.getByTestId('selected-count')).toHaveText('0');

    // Delete now has nothing to act on, so the hidden outline is still there.
    await window.getByTestId('editor-canvas').hover();
    await window.keyboard.press('Delete');
    await expect(window.getByTestId('feature-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});
