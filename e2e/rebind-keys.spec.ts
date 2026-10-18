import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * Changing a key in Settings › Keyboard shortcuts (U.12, §2 *Shortcuts*): the
 * key is heard and shown everywhere at once, a clash is named and swapped or
 * left, Reset puts keys back, and the maker's keys outlast a restart — while
 * a damaged preferences file never stops the app starting. Each launch is
 * given the config directory it shares with the next, which is what a
 * restart is.
 */

const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-keys-'));

async function launch(configHome: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await launchApp({ env: { XDG_CONFIG_HOME: configHome } });
  const window = await app.firstWindow();
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1400, 900);
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

async function openShortcuts(window: Page): Promise<Locator> {
  await window.getByTestId('settings').click();
  await window.getByTestId('settings-tab-shortcuts').click();
  return window.getByTestId('settings-pane-shortcuts');
}

/** *Change* on a command's row, then the keys pressed. */
async function change(window: Page, id: string, keys: string): Promise<void> {
  await window.getByTestId(`change-${id}`).click();
  await expect(window.getByTestId(`change-${id}`)).toHaveAttribute('aria-pressed', 'true');
  await window.keyboard.press(keys);
}

const keysOf = (window: Page, id: string): Locator =>
  window.getByTestId(`shortcut-keys-${id}`).locator('kbd');

const hint = (window: Page, key: string): Locator =>
  window.getByTestId('tool-how-to').locator(`[data-hint="${key}"]`);

/** Records, at the window, whether something before it took each key press. */
async function watchClaims(window: Page): Promise<void> {
  await window.evaluate(() => {
    const seen: string[] = [];
    (globalThis as { claims?: string[] }).claims = seen;
    window.addEventListener('keydown', (event) => {
      seen.push(`${event.code}:${String(event.defaultPrevented)}`);
    });
  });
}
const claims = (window: Page): Promise<string[]> =>
  window.evaluate(() => (globalThis as { claims?: string[] }).claims ?? []);

/** Counts the save dialogs asked for, and saves to `path`. */
async function stubSave(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, file) => {
    const state = globalThis as { saveDialogs?: number };
    state.saveDialogs = 0;
    dialog.showSaveDialog = async () => {
      state.saveDialogs = (state.saveDialogs ?? 0) + 1;
      return { canceled: false, filePath: file };
    };
  }, path);
}
const saveDialogs = (app: ElectronApplication): Promise<number> =>
  app.evaluate(() => (globalThis as { saveDialogs?: number }).saveDialogs ?? 0);

test('a key changed is heard at once, shown on every cap, and its old key is free', async () => {
  const { app, window } = await launch(fresh());
  try {
    await stubSave(app, join(fresh(), 'Card holder.lcp'));
    await drawAPanel(window);
    await openShortcuts(window);
    await expect(keysOf(window, 'save')).toHaveText(['Ctrl+S']);
    await change(window, 'save', 'F5');
    await expect(keysOf(window, 'save')).toHaveText(['F5']);
    await expect(window.getByTestId('change-save')).toBeFocused();
    await expect(window.getByTestId('reset-save')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('settings-dialog')).toHaveCount(0);

    // The bar's cap and its tooltip.
    await expect(window.getByTestId('save').locator('kbd')).toHaveText('F5');
    await window.getByTestId('save').hover();
    // Save's own: Esc gave the keys back to the gear (U.19), whose tooltip
    // shows at once for the keyboard, as R-10 has it.
    await expect(
      window.getByRole('tooltip', { name: /^Save the project/ }).locator('kbd'),
    ).toHaveText('F5');
    await window.mouse.move(5, 400);

    // The old key does nothing; the new one saves.
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(300);
    expect(await saveDialogs(app)).toBe(0);
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');
    await window.keyboard.press('F5');
    await expect(window.getByTestId('file-path')).toContainText('Card holder');
    expect(await saveDialogs(app)).toBe(1);
  } finally {
    await closeApp(app);
  }
});

test('Esc during a change leaves the key and the dialog; Enter and Tab cannot be taken', async () => {
  const { app, window } = await launch(fresh());
  try {
    const pane = await openShortcuts(window);
    await change(window, 'print', 'Escape');
    await expect(window.getByTestId('settings-dialog')).toBeVisible();
    await expect(window.getByTestId('change-print')).toHaveAttribute('aria-pressed', 'false');
    await expect(keysOf(window, 'print')).toHaveText(['Ctrl+P']);

    // Enter keeps its role: said, and still listening.
    await change(window, 'print', 'Enter');
    await expect(pane.getByTestId('shortcut-note')).toContainText('Enter keeps its own role');
    await expect(window.getByTestId('change-print')).toHaveAttribute('aria-pressed', 'true');
    await window.keyboard.press('Control+Enter');
    await expect(window.getByTestId('change-print')).toHaveAttribute('aria-pressed', 'true');
    // Tab goes on, and the listening ends with the focus leaving.
    await window.keyboard.press('Tab');
    await expect(window.getByTestId('change-print')).not.toBeFocused();
    await expect(window.getByTestId('change-print')).toHaveAttribute('aria-pressed', 'false');
    await expect(keysOf(window, 'print')).toHaveText(['Ctrl+P']);
    await expect(window.getByTestId('settings-dialog')).toBeVisible();

    // A digit alone types a size on the board: refused, and still listening.
    await change(window, 'toggleParts', 'Digit5');
    await expect(pane.getByTestId('shortcut-note')).toContainText('type sizes on the board');
    await expect(window.getByTestId('change-toggleParts')).toHaveAttribute('aria-pressed', 'true');
    await window.keyboard.press('Escape');
    await expect(keysOf(window, 'toggleParts')).toHaveText(['[']);

    // Esc itself, and Enter's own rows, are fixed: no Change to press.
    await expect(window.getByTestId('change-cancel')).toHaveCount(0);
    await expect(window.getByTestId('change-editSizes')).toHaveCount(0);
    await expect(window.getByTestId('shortcut-clash')).toHaveCount(0);
    await expect(window.getByTestId('shortcuts-reset-all')).toBeDisabled();
  } finally {
    await closeApp(app);
  }
});

test('a clash names the command, and Cancel leaves both while Swap exchanges them', async () => {
  const { app, window } = await launch(fresh());
  try {
    await stubSave(app, join(fresh(), 'Swap.lcp'));
    const pane = await openShortcuts(window);
    await change(window, 'settings', 'Control+s');
    const clash = pane.getByTestId('shortcut-clash');
    await expect(clash).toContainText('is already used for “Save”');
    await expect(clash.locator('kbd')).toHaveText('Ctrl+S');
    await expect(clash.getByTestId('clash-swap')).toBeFocused();
    await clash.getByTestId('clash-cancel').click();
    await expect(clash).toHaveCount(0);
    await expect(keysOf(window, 'settings')).toHaveText(['Ctrl+,']);
    await expect(keysOf(window, 'save')).toHaveText(['Ctrl+S']);

    // Esc on the clash is Cancel, not the dialog's.
    await change(window, 'settings', 'Control+s');
    await window.keyboard.press('Escape');
    await expect(pane.getByTestId('shortcut-clash')).toHaveCount(0);
    await expect(window.getByTestId('settings-dialog')).toBeVisible();

    await change(window, 'settings', 'Control+s');
    await pane.getByTestId('clash-swap').click();
    await expect(keysOf(window, 'settings')).toHaveText(['Ctrl+S']);
    await expect(keysOf(window, 'save')).toHaveText(['Ctrl+,']);
    await window.getByTestId('settings-close').click();

    // Both keys do the other's work now.
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('settings-dialog')).toBeVisible();
    await window.keyboard.press('Escape');
    await drawAPanel(window);
    await window.keyboard.press('Control+Comma');
    await expect(window.getByTestId('file-path')).toContainText('Swap');
    await expect(window.getByTestId('settings-dialog')).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

/** A key as the operating system delivers it: the main process hears it first. */
async function pressInWindow(
  app: ElectronApplication,
  keyCode: string,
  modifiers: readonly 'control'[] = [],
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [keyCode, modifiers]) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: [...modifiers] });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: [...modifiers] });
    },
    [keyCode, modifiers] as const,
  );
}

test('Ctrl+Q and F11 can be captured: they clash with Quit and Full screen, and act on neither', async () => {
  test.skip(process.platform === 'darwin', 'Quit is the app menu’s on macOS');
  const { app, window } = await launch(fresh());
  try {
    // Unsaved work, so a Ctrl+Q that got through would raise the unsaved dialog.
    await drawAPanel(window);
    const pane = await openShortcuts(window);
    const isFullScreen = (): Promise<boolean> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen());

    await window.getByTestId('change-settings').click();
    await pressInWindow(app, 'Q', ['control']);
    await expect(pane.getByTestId('shortcut-clash')).toContainText('is already used for “Quit”');
    await expect(window.getByTestId('unsaved-dialog')).toHaveCount(0);
    await pane.getByTestId('clash-cancel').click();

    await window.getByTestId('change-settings').click();
    await pressInWindow(app, 'F11');
    await expect(pane.getByTestId('shortcut-clash')).toContainText('“Full screen”');
    expect(await isFullScreen()).toBe(false);
    await pane.getByTestId('clash-cancel').click();

    // Listening over, the window hears F11 again.
    await window.getByTestId('settings-close').click();
    await pressInWindow(app, 'F11');
    await expect.poll(isFullScreen).toBe(true);
    await pressInWindow(app, 'F11');
    await expect.poll(isFullScreen).toBe(false);
  } finally {
    await closeApp(app);
  }
});

test('Reset puts one command’s keys back, through a swap if it must; Reset all, every one', async () => {
  const { app, window } = await launch(fresh());
  try {
    const pane = await openShortcuts(window);
    await change(window, 'settings', 'Control+s');
    await pane.getByTestId('clash-swap').click();
    // Settings' own key is Save's now: its reset swaps them back.
    await pane.getByTestId('reset-settings').click();
    await expect(pane.getByTestId('shortcut-clash')).toContainText('“Save”');
    await expect(pane.getByTestId('shortcut-clash').locator('kbd')).toHaveText('Ctrl+,');
    await pane.getByTestId('clash-swap').click();
    await expect(keysOf(window, 'settings')).toHaveText(['Ctrl+,']);
    await expect(keysOf(window, 'save')).toHaveText(['Ctrl+S']);
    await expect(pane.getByTestId('reset-settings')).toHaveCount(0);
    await expect(pane.getByTestId('shortcuts-reset-all')).toBeDisabled();

    // The work bar's caps follow, and come back with Reset all.
    await change(window, 'tool.select', 'KeyB');
    await change(window, 'keyboardShortcuts', 'F4');
    await expect(pane.getByTestId('shortcuts-reset-all')).toBeEnabled();
    await window.getByTestId('settings-close').click();
    await window.getByTestId('tool-rectangle').click();
    await expect(hint(window, 'hints.backToSelect').locator('kbd')).toHaveText('B');
    await expect(hint(window, 'hints.allKeys').locator('kbd')).toHaveText('F4');
    await expect(window.getByTestId('tool-select').locator('kbd')).toHaveText('B');

    await openShortcuts(window);
    await pane.getByTestId('shortcuts-reset-all').click();
    await expect(keysOf(window, 'tool.select')).toHaveText(['V']);
    await expect(pane.getByTestId('shortcuts-reset-all')).toBeDisabled();
    await window.getByTestId('settings-close').click();
    await expect(hint(window, 'hints.backToSelect').locator('kbd')).toHaveText('V');
    await expect(hint(window, 'hints.allKeys').locator('kbd')).toHaveText('?');
    await expect(window.getByTestId('tool-select').locator('kbd')).toHaveText('V');
  } finally {
    await closeApp(app);
  }
});

test('the maker’s keys outlast a restart', async () => {
  const configHome = fresh();
  const first = await launch(configHome);
  try {
    await openShortcuts(first.window);
    await change(first.window, 'tool.rectangle', 'KeyQ');
    await expect(keysOf(first.window, 'tool.rectangle')).toHaveText(['Q']);
  } finally {
    await closeApp(first.app);
  }
  const stored = JSON.parse(
    readFileSync(join(configHome, 'leathercad', 'preferences.json'), 'utf8'),
  );
  expect(stored.keyBindings).toEqual({ 'tool.rectangle': [{ code: 'KeyQ' }] });

  const second = await launch(configHome);
  try {
    await expect(second.window.getByTestId('tool-rectangle').locator('kbd')).toHaveText('Q');
    await second.window.getByTestId('editor-canvas').focus();
    await second.window.keyboard.press('KeyQ');
    await expect(second.window.getByTestId('tool-rectangle')).toHaveClass(/active/);
    await second.window.getByTestId('tool-select').click();
    await second.window.getByTestId('editor-canvas').focus();
    await second.window.keyboard.press('KeyR');
    await expect(second.window.getByTestId('tool-select')).toHaveClass(/active/);
  } finally {
    await closeApp(second.app);
  }
});

test('a damaged list of keys in preferences.json is dropped, and the app starts', async () => {
  const configHome = fresh();
  mkdirSync(join(configHome, 'leathercad'), { recursive: true });
  writeFileSync(
    join(configHome, 'leathercad', 'preferences.json'),
    JSON.stringify({
      version: 2,
      partsFolded: true,
      keyBindings: {
        nonsense: [{ code: 'F6' }],
        save: [{ code: 'f5' }],
        exportPdf: [{ code: 'Enter' }],
        print: 'Ctrl+P',
        help: [{ code: 'F9' }],
      },
    }),
  );
  const { app, window } = await launch(configHome);
  try {
    // The rest of the file was read, and the one usable key kept.
    await expect(window.getByTestId('parts-strip')).toBeVisible();
    const pane = await openShortcuts(window);
    await expect(keysOf(window, 'save')).toHaveText(['Ctrl+S']);
    await expect(keysOf(window, 'exportPdf')).toHaveText(['Ctrl+E']);
    await expect(keysOf(window, 'print')).toHaveText(['Ctrl+P']);
    await expect(keysOf(window, 'help')).toHaveText(['F9']);
    await expect(pane.getByTestId('reset-help')).toBeVisible();
  } finally {
    await closeApp(app);
  }
});

test('a key moved stays out of fields, and a drawing tool keeps its own', async () => {
  const { app, window } = await launch(fresh());
  try {
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).not.toHaveText('0');
    const pane = await openShortcuts(window);
    // Focus mode takes A from the Arc tool, which gets \ in its place.
    await change(window, 'focusMode', 'KeyA');
    await expect(pane.getByTestId('shortcut-clash')).toContainText('“Arc”');
    await pane.getByTestId('clash-swap').click();
    await expect(keysOf(window, 'focusMode')).toHaveText(['A']);
    await window.getByTestId('settings-close').click();
    const focus = window.getByTestId('toggle-focus');

    // Typed in a name, A is a letter.
    await fromProjectMenu(window, 'rename');
    const name = window.getByTestId('project-name-input');
    await name.fill('');
    await name.press('KeyA');
    await expect(name).toHaveValue('a');
    await name.press('Escape');
    await expect(focus).toHaveAttribute('aria-pressed', 'false');

    // Mid-polyline, A is the arc's — not focus mode's.
    await watchClaims(window);
    await window.getByTestId('tool-polyline').click();
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    const at = { x: board.x + board.width * 0.3, y: board.y + board.height * 0.6 };
    await window.mouse.click(at.x, at.y);
    await window.mouse.move(at.x + 80, at.y - 60);
    await window.keyboard.press('KeyA');
    await expect(focus).toHaveAttribute('aria-pressed', 'false');
    expect(await claims(window)).toContain('KeyA:true');
    await window.keyboard.press('Escape');

    // Off a run, A is focus mode's now.
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('KeyA');
    await expect(focus).toHaveAttribute('aria-pressed', 'true');
    await window.keyboard.press('KeyA');
    await expect(focus).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await closeApp(app);
  }
});

test('the polyline’s arc moved to Q is Q mid-run, and A is the Arc tool again', async () => {
  const { app, window } = await launch(fresh());
  try {
    const pane = await openShortcuts(window);
    await change(window, 'arc', 'KeyQ');
    await expect(keysOf(window, 'arc')).toHaveText(['Q']);
    await expect(pane.getByTestId('shortcut-clash')).toHaveCount(0);
    await window.getByTestId('settings-close').click();

    await watchClaims(window);
    await window.getByTestId('tool-polyline').click();
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    const at = { x: board.x + board.width * 0.3, y: board.y + board.height * 0.6 };
    await window.mouse.click(at.x, at.y);
    await window.mouse.move(at.x + 80, at.y - 60);
    await expect(hint(window, 'hints.arcsNext').locator('kbd')).toHaveText('Q');
    await window.keyboard.press('KeyQ');
    expect(await claims(window)).toContain('KeyQ:true');
    await expect(window.getByTestId('tool-polyline')).toHaveClass(/active/);
    await window.keyboard.press('KeyA');
    await expect(window.getByTestId('tool-arc')).toHaveClass(/active/);
  } finally {
    await closeApp(app);
  }
});

test('Parts’ rename moved to F4 renames a focused row, and nothing on the board', async () => {
  const { app, window } = await launch(fresh());
  try {
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).not.toHaveText('0');
    await openShortcuts(window);
    await change(window, 'rename', 'F4');
    await expect(keysOf(window, 'rename')).toHaveText(['F4']);
    await window.getByTestId('settings-close').click();

    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('F4');
    await expect(window.getByTestId('row-name-input')).toHaveCount(0);

    await window.getByTestId('part-heading-outer').focus();
    await window.keyboard.press('F2');
    await expect(window.getByTestId('row-name-input')).toHaveCount(0);
    await window.keyboard.press('F4');
    await expect(window.getByTestId('row-name-input')).toBeFocused();
    await window.keyboard.press('Escape');
  } finally {
    await closeApp(app);
  }
});

test('take back moved to R takes a point back mid-run, and is not Rectangle as well', async () => {
  const { app, window } = await launch(fresh());
  try {
    const pane = await openShortcuts(window);
    await change(window, 'takeBack', 'KeyR');
    // The polyline is a place of its own: R there shadows the Rectangle tool.
    await expect(pane.getByTestId('shortcut-clash')).toHaveCount(0);
    await expect(keysOf(window, 'takeBack')).toHaveText(['R']);
    await window.getByTestId('settings-close').click();

    await watchClaims(window);
    await window.getByTestId('tool-polyline').click();
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    const at = { x: board.x + board.width * 0.3, y: board.y + board.height * 0.6 };
    await window.mouse.click(at.x, at.y);
    await window.mouse.click(at.x + 80, at.y);
    await window.mouse.move(at.x + 80, at.y - 60);
    await expect(hint(window, 'hints.takesBack').locator('kbd')).toHaveText('R');
    await window.keyboard.press('KeyR');
    expect(await claims(window)).toEqual(['KeyR:true']);
    await expect(window.getByTestId('tool-polyline')).toHaveClass(/active/);
    await window.keyboard.press('KeyR');
    // The run is over: R is the Rectangle tool's again.
    await expect(hint(window, 'hints.polylinePoints')).toBeVisible();
    await window.keyboard.press('KeyR');
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/active/);
  } finally {
    await closeApp(app);
  }
});
