import { resolve } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * Slice 8.5a: the application menu is LeatherCAD's own, and each item runs the
 * handler its keyboard shortcut runs. The shipped build has no Reload and no
 * developer tools; that is checked on the packaged app, where it is true.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

async function launch(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  return { app, window };
}

/** Chooses `label` from the top-level menu `menu`, as a click would. */
async function choose(app: ElectronApplication, menu: string, label: string): Promise<void> {
  await app.evaluate(
    ({ Menu }, [top, item]) => {
      const found = Menu.getApplicationMenu()
        ?.items.find((entry) => entry.label === top)
        ?.submenu?.items.find((entry) => entry.label === item);
      if (found === undefined) throw new Error(`no ${top} › ${item}`);
      found.click();
    },
    [menu, label] as const,
  );
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

test('the menu is the app’s own, and its items do what their keys do', async () => {
  const { app, window } = await launch();
  try {
    const top = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.items.map((entry) => entry.label),
    );
    expect(top).toEqual(['File', 'Edit', 'View', 'Tools', 'Paper', 'Help']);

    await drawAPanel(window);

    // Edit › Undo and Redo are the document's history.
    await choose(app, 'Edit', 'Undo');
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await choose(app, 'Edit', 'Redo');
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // File › New asks about unsaved work, exactly as Ctrl+N does (5.3a).
    const dialog = window.getByTestId('unsaved-dialog');
    await choose(app, 'File', 'New');
    await expect(dialog).toContainText('new project');
    await dialog.getByTestId('unsaved-cancel').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // The shortcut is shown in the menu but not registered there, so Ctrl+N
    // runs once — one question, not two stacked.
    await window.keyboard.press('Control+n');
    await expect(dialog).toHaveCount(1);
    await dialog.getByTestId('unsaved-discard').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await expect(dialog).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

test('Help › Third-Party Notices shows the licences of what the app ships (8.6b)', async () => {
  const { app } = await launch();
  try {
    const opened = app.waitForEvent('window');
    await choose(app, 'Help', 'Third-Party Notices');
    const notices = await opened;
    await notices.waitForLoadState('domcontentloaded');
    // The file the build wrote from its own bundles: the renderer's packages,
    // main's, and the vendored typeface, each with its licence text.
    const text = (await notices.locator('body').textContent()) ?? '';
    expect(text).toContain('LeatherCAD — third-party notices');
    for (const name of ['react 19', 'zod 4', 'electron-log 5', 'IBM Plex Sans']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('SIL OPEN FONT LICENSE');
  } finally {
    await closeApp(app);
  }
});

test('Tools, zoom and the paper work from the menu as from the window (8.4b)', async () => {
  const { app, window } = await launch();
  try {
    // A tool from the menu is the tool its key chooses.
    await choose(app, 'Tools', 'Circle');
    await expect(window.getByTestId('tool-circle')).toHaveClass(/active/);
    await choose(app, 'Tools', 'Rectangle');
    await drawAPanel(window);

    // Zoom changes which millimetre is under a fixed point off the centre, and
    // fitting brings it back.
    await choose(app, 'Tools', 'Select');
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    const scale = async (): Promise<string> => {
      await window.mouse.move(board.x + 60, board.y + 60);
      await window.mouse.move(board.x + 61, board.y + 61);
      return (await window.getByTestId('cursor-readout').textContent()) ?? '';
    };
    await choose(app, 'View', 'Fit to Pattern');
    const fitted = await scale();
    await choose(app, 'View', 'Zoom In');
    await expect.poll(scale).not.toBe(fitted);
    await choose(app, 'View', 'Fit to Pattern');
    await expect.poll(scale).toBe(fitted);
    // The keys the menu shows do the same.
    await window.keyboard.press('Control+Equal');
    await expect.poll(scale).not.toBe(fitted);
    await window.keyboard.press('Control+0');
    await expect.poll(scale).toBe(fitted);

    // The Paper menu says what the paper list says, and choosing from it is
    // the same one undoable edit.
    const paperItems = () =>
      app.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu()
            ?.items.find((entry) => entry.label === 'Paper')
            ?.submenu?.items.map((entry) => ({ label: entry.label, checked: entry.checked })) ?? [],
      );
    await expect
      .poll(async () => (await paperItems()).find((p) => p.checked)?.label)
      .toBe(await window.getByTestId('paper').locator('option:checked').textContent());
    const landscape = (await paperItems()).find((p) => p.label.includes('A4, landscape'))!;
    await choose(app, 'Paper', landscape.label);
    await expect(window.getByTestId('paper')).toHaveValue('A4 landscape');
    await expect
      .poll(async () => (await paperItems()).find((p) => p.checked)?.label)
      .toBe(landscape.label);
    await choose(app, 'Edit', 'Undo');
    await expect(window.getByTestId('paper')).toHaveValue('A4 portrait');
  } finally {
    await closeApp(app);
  }
});
