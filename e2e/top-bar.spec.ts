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
import { fromProjectMenu } from './projectMenu.js';

/**
 * Slice 8.7: the project bar's Project menu, Help and About. Each launch has
 * a config directory of its own, so no test sees another's recent projects.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-bar-'));

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

test('the Project menu opens by mouse and by keyboard, and gives focus back (8.7)', async () => {
  const { app, window } = await launch(fresh());
  try {
    const button = window.getByTestId('project-menu');
    await button.focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('new')).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('open')).toBeFocused();
    await window.keyboard.press('End');
    // An empty recent list: its line is the last thing focus reaches.
    await expect(window.getByRole('menuitem', { name: /appear here/ })).toBeFocused();
    await window.keyboard.press('Home');
    await expect(window.getByTestId('new')).toBeFocused();
    // A letter is the menu's, not the tool rail's.
    await window.keyboard.press('c');
    await expect(window.getByTestId('tool-circle')).not.toHaveClass(/active/);
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('project-menu-items')).toHaveCount(0);
    await expect(button).toBeFocused();

    // And by mouse: a press anywhere else closes it.
    await button.click();
    await expect(window.getByTestId('project-menu-items')).toBeVisible();
    await window.getByTestId('editor-canvas').click({ position: { x: 20, y: 20 } });
    await expect(window.getByTestId('project-menu-items')).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

test('Save as… asks where, and saves there (8.7)', async () => {
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Card holder.lcp');
  const { app, window } = await launch(fresh());
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    await drawAPanel(window);
    await fromProjectMenu(window, 'save-as');
    await expect(window.getByTestId('file-path')).toContainText('Card holder');
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');
  } finally {
    await closeApp(app);
  }
});

test('About says the version, and shows the log folder and the notices (8.7, 8.6b)', async () => {
  const { app, window } = await launch(fresh());
  try {
    const version = (await window.getByTestId('app-version').textContent()) ?? '';
    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-about').click();
    const about = window.getByTestId('about-dialog');
    await expect(about.getByTestId('about-version')).toHaveText(`Version ${version}`);

    // The log folder opens in the file manager: caught here, not opened.
    await app.evaluate(({ shell }) => {
      shell.openPath = async (path: string) => {
        (globalThis as { openedPath?: string }).openedPath = path;
        return '';
      };
    });
    await about.getByTestId('about-log-folder').click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as { openedPath?: string }).openedPath ?? ''))
      .not.toBe('');

    // The file the build wrote from its own bundles: the renderer's packages,
    // main's, and the vendored typeface, each with its licence text.
    const opened = app.waitForEvent('window');
    await about.getByTestId('about-notices').click();
    const notices = await opened;
    await notices.waitForLoadState('domcontentloaded');
    const text = (await notices.locator('body').textContent()) ?? '';
    expect(text).toContain('LeatherCAD — third-party notices');
    for (const name of ['react 19', 'zod 4', 'electron-log 5', 'IBM Plex Sans']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('SIL OPEN FONT LICENSE');
    await notices.close();

    await about.getByTestId('about-close').click();
    await expect(about).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});
