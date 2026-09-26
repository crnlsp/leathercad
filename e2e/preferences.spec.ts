import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * Slice 8.2: the app remembers how the maker likes it, and what they worked
 * on last. Each launch here is given the config directory it shares with the
 * next, which is what a restart is.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

async function launch(configHome: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
  });
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

/** The labels under File › Open Recent, as the menu has them now. */
async function recentLabels(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((entry) => entry.label === 'File');
    const recent = file?.submenu?.items.find((entry) => entry.label === 'Open Recent');
    return (recent?.submenu?.items ?? [])
      .filter((entry) => entry.type !== 'separator')
      .map((entry) => entry.label);
  });
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

test('File › Open Recent reopens a saved project after a restart', async () => {
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-recent-'));
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Wallet v1.2.lcp');

  const first = await launch(configHome);
  try {
    expect(await recentLabels(first.app)).toEqual(['No Recent Projects', 'Clear Recent']);

    await first.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    await drawAPanel(first.window);
    await first.window.keyboard.press('Control+s');
    await expect(first.window.getByTestId('file-path')).toContainText('Wallet v1.2');
    await expect.poll(() => recentLabels(first.app)).toContain(project);
  } finally {
    await closeApp(first.app);
  }

  const second = await launch(configHome);
  try {
    // Chosen from the menu, not a dialog: the main process grants the path
    // because it is on its own list.
    await expect(second.window.getByTestId('part-count')).toHaveText('0');
    await second.app.evaluate(({ Menu }, path) => {
      const file = Menu.getApplicationMenu()?.items.find((entry) => entry.label === 'File');
      const recent = file?.submenu?.items.find((entry) => entry.label === 'Open Recent');
      const item = recent?.submenu?.items.find((entry) => entry.label === path);
      if (item === undefined) throw new Error(`${path} is not on Open Recent`);
      item.click();
    }, project);

    await expect(second.window.getByTestId('part-count')).toHaveText('1');
    await expect(second.window.getByTestId('file-path')).toContainText('Wallet v1.2');
    // Saved back where it came from, without a dialog: the grant covers it.
    await second.window.keyboard.press('Control+s');
    await expect(second.window.getByTestId('file-error')).toHaveCount(0);
  } finally {
    await closeApp(second.app);
  }
});

test('the keyboard shortcut map opens from the menu, from Ctrl+/ and from ?', async () => {
  const { app, window } = await launch(mkdtempSync(join(tmpdir(), 'leathercad-e2e-keys-')));
  try {
    const dialog = window.getByTestId('shortcuts-dialog');

    await app.evaluate(({ Menu }) => {
      const help = Menu.getApplicationMenu()?.items.find((entry) => entry.label === 'Help');
      help?.submenu?.items.find((entry) => entry.label === 'Keyboard Shortcuts')?.click();
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Export PDF');
    await expect(dialog).toContainText('Rectangle');

    // A letter typed while it is open does not change the tool behind it.
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/active/);
    await window.keyboard.press('c');
    await expect(window.getByTestId('tool-circle')).not.toHaveClass(/active/);
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/active/);
    await window.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await window.keyboard.press('Control+/');
    await expect(dialog).toBeVisible();
    await window.getByTestId('shortcuts-close').click();
    await expect(dialog).toHaveCount(0);

    await window.keyboard.press('Shift+?');
    await expect(dialog).toBeVisible();
  } finally {
    await closeApp(app);
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
