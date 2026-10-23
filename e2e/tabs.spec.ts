import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { drawAPanel, expectNoViolations, launchApp, withApp } from './launchApp.js';
import { activeTab, closeActiveTab, fromProjectMenu, renameProject } from './projectMenu.js';

/**
 * Slice 8.12: several projects in one window, a tab each, as in Notepad.
 *
 * Each tab keeps its own document, history, selection, view and camera. The
 * strip sits above the project bar, under the system's title bar.
 */

/** The sample wallet from Help, in a tab of its own beside the drawing. */
async function openSample(window: Page): Promise<void> {
  await window.getByTestId('help-menu').click();
  await window.getByTestId('help-open-sample').click();
  await expect(window.getByTestId('part-count')).toHaveText('3');
}

test('each tab keeps its own project, history and view', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await openSample(window);
    const tabs = window.getByTestId('tab-strip').getByRole('tab');
    await expect(tabs).toHaveText(['Untitled', 'Bifold wallet']);

    // The wallet on its sheets; the drawing on its board, its undo intact.
    await window.getByTestId('view-sheets').click();
    await tabs.first().click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('view-design')).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByTestId('undo')).toBeEnabled();
    await tabs.nth(1).click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.getByTestId('view-sheets')).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByTestId('undo')).toBeDisabled();
  });
});

test('Ctrl+Page Down and Up go round the tabs; the title is the active one’s', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await openSample(window);
    await expect.poll(() => window.title()).toBe('Bifold wallet — LeatherCAD');

    await window.keyboard.press('Control+PageDown');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    // Unsaved, and the title says so.
    await expect.poll(() => window.title()).toBe('• Untitled — LeatherCAD');
    await window.keyboard.press('Control+PageUp');
    await expect(window.getByTestId('part-count')).toHaveText('3');
  });
});

test('a tab with unsaved work shows a dot, and says so to a screen reader', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await expect(activeTab(window)).toHaveClass(/\bunsaved\b/);
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveAccessibleName(
      'Untitled, unsaved changes',
    );
    await window.getByTestId('undo').click();
    await expect(activeTab(window)).not.toHaveClass(/\bunsaved\b/);
  });
});

test('a middle click, the close button and the keys close a tab', async () => {
  await withApp(async (window) => {
    const tabs = window.getByTestId('tab-strip').getByRole('tab');
    for (let i = 0; i < 2; i++) {
      await window.getByTestId('new-tab').click();
      await window.getByTestId('tab-new').click();
    }
    // An untouched Untitled is not replaced by New: New asks for a tab.
    await expect(tabs).toHaveCount(3);

    await window.getByTestId('project-tab').first().click({ button: 'middle' });
    await expect(tabs).toHaveCount(2);
    await closeActiveTab(window);
    await expect(tabs).toHaveCount(1);

    // Delete closes the focused tab; the last leaves the start screen.
    await tabs.first().focus();
    await window.keyboard.press('Delete');
    await expect(tabs).toHaveCount(0);
    await expect(window.getByTestId('start-screen')).toBeVisible();
  });
});

test('with every project closed the app stays open, on its start screen', async () => {
  await withApp(async (window, app) => {
    await closeActiveTab(window);
    const start = window.getByTestId('start-screen');
    await expect(start).toBeVisible();
    await expect(window.getByTestId('project-bar')).toHaveCount(0);
    expect(app.windows()).toHaveLength(1);
    await expect.poll(() => window.title()).toBe('LeatherCAD');

    // Keys that need a project do nothing; the Project menu says why.
    await window.keyboard.press('Control+s');
    await window.getByTestId('project-menu').click();
    await expect(window.getByTestId('save-as')).toHaveAttribute('aria-disabled', 'true');
    await window.keyboard.press('Escape');

    // The ways back in: a new project, the sample.
    await start.getByTestId('start-new').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await closeActiveTab(window);
    await start.getByTestId('start-sample').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expectNoViolations(window, 'a project open again');
  });
});

test('the Project menu sits at the strip’s left, and Rename names the tab', async () => {
  await withApp(async (window) => {
    const menu = (await window.getByTestId('project-menu').boundingBox())!;
    const first = (await window.getByTestId('project-tab').first().boundingBox())!;
    expect(menu.x + menu.width).toBeLessThanOrEqual(first.x);
    expect(menu.y).toBeLessThan(first.y + first.height);

    await renameProject(window, 'Card holder');
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveText(['Card holder']);
  });
});

test('a project saved without a name is named after its file', async () => {
  await withApp(async (window, app) => {
    const file = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Portfel.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    await expect(window.getByTestId('project-name')).toHaveText('Portfel');
    await expect.poll(() => window.title()).toBe('Portfel — LeatherCAD');
  });
});

test('the tab strip passes the accessibility scan', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await openSample(window);
    await expectNoViolations(window, 'two tabs, one unsaved');
  });
});

test('+ offers a new project, Open… and the recent projects', async () => {
  await withApp(async (window, app) => {
    const file = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Belt.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    await closeActiveTab(window);

    await window.getByTestId('new-tab').click();
    await expect(window.getByTestId('tab-new')).toBeVisible();
    await expect(window.getByTestId('tab-open')).toBeVisible();
    await window.getByTestId('tab-recent-0').click();
    await expect(window.getByTestId('project-name')).toHaveText('Belt');
    await expect(window.getByTestId('part-count')).toHaveText('1');
  });
});

test('the open tabs come back at the next start, the one in front in front', async () => {
  const config = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  const folder = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  const tabs = (window: Page) => window.getByTestId('tab-strip').getByRole('tab');

  await withApp(
    async (window, app) => {
      for (const [name, parts] of [
        ['Wallet', '1'],
        ['Belt', '1'],
      ] as const) {
        await app.evaluate(
          ({ dialog }, path) => {
            dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
          },
          join(folder, `${name}.lcp`),
        );
        await drawAPanel(window, { parts });
        await window.getByTestId('save').click();
        await expect(window.getByTestId('project-name')).toHaveText(name);
        await window.keyboard.press('Control+n');
      }
      // Wallet in front; the empty Untitled is not kept.
      await tabs(window).first().click();
      await expect(tabs(window)).toHaveText(['Wallet', 'Belt', 'Untitled']);
    },
    { env: { XDG_CONFIG_HOME: config } },
  );

  const again = await launchApp({ env: { XDG_CONFIG_HOME: config }, startScreen: true });
  try {
    const window = await again.firstWindow();
    await expect(tabs(window)).toHaveText(['Wallet', 'Belt']);
    await expect(window.getByTestId('project-name')).toHaveText('Wallet');
    await expect(window.getByTestId('start-screen')).toHaveCount(0);
  } finally {
    await closeApp(again);
  }
});

test('the app starts on its start screen, and a project opened again bounces its tab', async () => {
  const app = await launchApp({ startScreen: true });
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('start-screen')).toBeVisible();
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(0);
    await expect.poll(() => window.title()).toBe('LeatherCAD');

    await window.getByTestId('start-sample').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
  } finally {
    await closeApp(app);
  }
});

test('opening a project that is open already goes to its tab, which bounces', async () => {
  await withApp(async (window, app) => {
    const file = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Wallet.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('save').click();
    await window.keyboard.press('Control+n');

    await fromProjectMenu(window, 'open');
    const tabs = window.getByTestId('tab-strip').getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await expect(window.getByTestId('project-name')).toHaveText('Wallet');
    await expect(window.getByTestId('project-tab').first()).toHaveClass(/\bnudged\b/);
    await expect(window.getByTestId('already-open')).toHaveText('Wallet is open already');
  });
});

test('renaming a saved project renames its file, never over another', async () => {
  await withApp(async (window, app) => {
    const folder = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
    await app.evaluate(
      ({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      },
      join(folder, 'Belt.lcp'),
    );
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('save').click();
    await expect(window.getByTestId('project-name')).toHaveText('Belt');
    writeFileSync(join(folder, 'Wallet.lcp'), 'another project');

    // Taken: nothing is renamed, and the maker is told.
    await renameProject(window, 'Wallet');
    await expect(window.getByTestId('file-notice')).toContainText('Wallet.lcp');
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('project-name')).toHaveText('Belt');
    expect(existsSync(join(folder, 'Belt.lcp'))).toBe(true);
    expect(readFileSync(join(folder, 'Wallet.lcp'), 'utf8')).toBe('another project');

    // Free: the project and its file both take the name.
    await renameProject(window, 'Watch strap');
    await expect(window.getByTestId('project-name')).toHaveText('Watch strap');
    await expect(window.getByTestId('file-path')).toContainText('Watch strap.lcp');
    expect(existsSync(join(folder, 'Belt.lcp'))).toBe(false);
    expect(existsSync(join(folder, 'Watch strap.lcp'))).toBe(true);
  });
});

test('a tab’s own menu: reload from disk, duplicate, close others, move to the Trash', async () => {
  await withApp(async (window, app) => {
    const folder = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
    const file = join(folder, 'Belt.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('save').click();
    await expect(window.getByTestId('project-name')).toHaveText('Belt');
    const tabs = window.getByTestId('tab-strip').getByRole('tab');
    const menuOf = async (index: number): Promise<void> => {
      await window.getByTestId('project-tab').nth(index).click({ button: 'right' });
      await expect(window.getByTestId('tab-menu')).toBeVisible();
    };

    // Reload over unsaved work asks first, then reads the file as saved.
    await drawAPanel(window, { left: 350, parts: '2' });
    await menuOf(0);
    await window.getByTestId('tab-reload').click();
    await expect(window.getByTestId('unsaved-dialog')).toContainText('Reloading');
    await window.getByTestId('unsaved-discard').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('save-state')).toHaveText('Saved');

    // A copy, unsaved and with no file, in a tab of its own.
    await menuOf(0);
    await window.getByTestId('tab-duplicate').click();
    await expect(tabs).toHaveCount(2);
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');
    await expect(window.getByTestId('file-path')).toHaveCount(0);

    // Without a file, what needs one is refused and says why.
    await menuOf(1);
    await expect(window.getByTestId('tab-reload')).toHaveAttribute('aria-disabled', 'true');
    await expect(window.getByTestId('tab-trash')).toHaveAttribute('aria-disabled', 'true');
    await window.keyboard.press('Escape');

    // Close the others: the copy's unsaved work is asked about.
    await menuOf(0);
    await window.getByTestId('tab-close-others').click();
    await window.getByTestId('unsaved-discard').click();
    await expect(tabs).toHaveCount(1);

    // To the Trash, after a question, and the tab goes with it.
    await app.evaluate(({ shell }) => {
      shell.trashItem = async (path: string) => {
        (globalThis as { trashed?: string }).trashed = path;
      };
    });
    await menuOf(0);
    await window.getByTestId('tab-trash').click();
    const dialog = window.getByTestId('trash-dialog');
    await expect(dialog).toContainText('Belt.lcp');
    await expect(dialog.getByTestId('trash-dialog-close')).toBeFocused();
    await dialog.getByTestId('trash-dialog-confirm').click();
    await expect(tabs).toHaveCount(0);
    expect(await app.evaluate(() => (globalThis as { trashed?: string }).trashed)).toBe(file);
  });
});

test('undoing a rename gives the file its name back, as the project gets its own (8.12)', async () => {
  await withApp(async (window, app) => {
    const folder = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
    await app.evaluate(
      ({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      },
      join(folder, 'Belt.lcp'),
    );
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('save').click();
    await renameProject(window, 'Watch strap');
    await expect.poll(() => existsSync(join(folder, 'Watch strap.lcp'))).toBe(true);

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('project-name')).toHaveText('Belt');
    await expect.poll(() => existsSync(join(folder, 'Belt.lcp'))).toBe(true);
    expect(existsSync(join(folder, 'Watch strap.lcp'))).toBe(false);
    await expect(window.getByTestId('file-path')).toContainText('Belt.lcp');
  });
});

test('a file changed outside the app is said over the board, and reloads on request (8.12)', async () => {
  await withApp(async (window, app) => {
    const folder = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
    const file = join(folder, 'Belt.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    // The app's own save is not news.
    await window.waitForTimeout(800);
    await expect(window.getByTestId('outside-bar')).toHaveCount(0);

    // Another program writes the sample over it.
    copyFileSync(join(import.meta.dirname, '../fixtures/projects/bifold-wallet.lcp'), file);
    const bar = window.getByTestId('outside-bar');
    await expect(bar).toContainText('Belt.lcp was changed outside LeatherCAD');
    await bar.getByTestId('outside-reload').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(bar).toHaveCount(0);

    // Moved away: said, and Save writes it back where it was.
    unlinkSync(file);
    await expect(bar).toContainText('moved or deleted');
    await bar.getByTestId('outside-save').click();
    await expect.poll(() => existsSync(file)).toBe(true);
    await expect(bar).toHaveCount(0);
  });
});

test('the start screen has Settings and Help, and F1 opens Help there (8.12)', async () => {
  const app = await launchApp({ startScreen: true });
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('start-screen')).toBeVisible();
    const strip = window.getByTestId('tab-strip');
    await expect(strip.getByTestId('settings')).toBeVisible();
    await window.keyboard.press('F1');
    await expect(window.getByTestId('help-about')).toBeVisible();
    await window.keyboard.press('Escape');
    // With a project open, they are the project bar's again, once.
    await window.getByTestId('start-new').click();
    await expect(window.getByTestId('settings')).toHaveCount(1);
    await expect(window.getByTestId('project-bar').getByTestId('settings')).toBeVisible();
  } finally {
    await closeApp(app);
  }
});

test('more tabs than the strip shows: a list of them all (8.12)', async () => {
  await withApp(
    async (window) => {
      const all = window.getByTestId('all-tabs');
      await expect(all).toHaveCount(0);
      for (let i = 0; i < 14; i++) await window.keyboard.press('Control+n');
      await expect(all).toBeVisible();
      await all.click();
      await window.getByTestId('all-tabs-0').click();
      await expect(window.getByTestId('project-name')).toHaveText('Untitled');
      await expect(window.getByTestId('tab-strip').getByRole('tab', { selected: true })).toHaveText(
        'Untitled',
      );
    },
    { size: [1024, 768] },
  );
});

test('a tab is dragged along the strip, or moved with Ctrl+Shift+Page Up and Down (8.12)', async () => {
  await withApp(async (window) => {
    await renameProject(window, 'Wallet');
    await window.keyboard.press('Control+n');
    await renameProject(window, 'Belt');
    await window.keyboard.press('Control+n');
    await renameProject(window, 'Strap');
    const tabs = window.getByTestId('tab-strip').getByRole('tab');
    await expect(tabs).toHaveText(['Wallet', 'Belt', 'Strap']);

    await window
      .getByTestId('project-tab')
      .nth(2)
      .dragTo(window.getByTestId('project-tab').first(), {
        targetPosition: { x: 4, y: 10 },
      });
    await expect(tabs).toHaveText(['Strap', 'Wallet', 'Belt']);

    // The keys move the active one, Strap, one place at a time.
    await window.keyboard.press('Control+Shift+PageDown');
    await expect(tabs).toHaveText(['Wallet', 'Strap', 'Belt']);
    await window.keyboard.press('Control+Shift+PageUp');
    await expect(tabs).toHaveText(['Strap', 'Wallet', 'Belt']);
  });
});

test('Ctrl+Shift+T opens the project last closed again (8.12)', async () => {
  await withApp(async (window, app) => {
    const file = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Belt.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);
    await drawAPanel(window, { parts: '1' });
    await window.getByTestId('save').click();
    await window.keyboard.press('Control+w');
    await expect(window.getByTestId('start-screen')).toBeVisible();
    await window.keyboard.press('Control+Shift+t');
    await expect(window.getByTestId('project-name')).toHaveText('Belt');
    await expect(window.getByTestId('part-count')).toHaveText('1');
  });
});

test('a recent project is pinned to the top of the start screen, or taken off it (8.12)', async () => {
  const config = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  const folder = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  await withApp(
    async (window, app) => {
      for (const name of ['Wallet', 'Belt']) {
        await app.evaluate(
          ({ dialog }, path) => {
            dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
          },
          join(folder, `${name}.lcp`),
        );
        await window.keyboard.press('Control+n');
        await drawAPanel(window, { parts: '1' });
        await window.getByTestId('save').click();
        await expect(window.getByTestId('project-name')).toHaveText(name);
      }
      for (let i = 0; i < 3; i++) await closeActiveTab(window);
      const start = window.getByTestId('start-screen');
      await expect(start).toBeVisible();
      // Belt was saved last, so it is first; Wallet is pinned above it.
      await expect(start.getByTestId('start-recent-0')).toContainText('Belt');
      await start.getByTestId('start-recent-1').hover();
      await start.getByTestId('start-pin-1').click();
      await expect(start.getByTestId('start-recent-0')).toContainText('Wallet');
      await expect(start.getByTestId('start-pin-0')).toHaveAttribute('aria-pressed', 'true');

      // Removed from the list, and only from the list.
      await start.getByTestId('start-recent-1').hover();
      await start.getByTestId('start-remove-1').click();
      await expect(start.getByTestId('start-recent-1')).toHaveCount(0);
      expect(existsSync(join(folder, 'Belt.lcp'))).toBe(true);
    },
    { env: { XDG_CONFIG_HOME: config } },
  );
});

test('the next start finds each tab on its view and zoom, and kept unsaved work too (8.12)', async () => {
  const config = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  const file = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Belt.lcp');
  let leftAt: string | null = null;
  await withApp(
    async (window, app) => {
      // Settings › General: keep unsaved projects when closing.
      await window.keyboard.press('Control+Comma');
      await window.getByTestId('setting-keep-unsaved').check();
      await window.keyboard.press('Escape');

      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      }, file);
      await drawAPanel(window, { parts: '1' });
      await window.getByTestId('save').click();
      await window.getByTestId('zoom-in').click();
      leftAt = await window.getByTestId('zoom-level').textContent();
      await window.getByTestId('view-sheets').click();

      // An untitled project with work in it: kept, not asked about.
      await window.keyboard.press('Control+n');
      await drawAPanel(window, { parts: '1' });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      await expect.poll(() => app.windows().length).toBe(0);
    },
    { env: { XDG_CONFIG_HOME: config } },
  );

  await withApp(
    async (window) => {
      const tabs = window.getByTestId('tab-strip').getByRole('tab');
      await expect(tabs).toHaveText(['Belt', 'Untitled']);
      // The untitled one, in front, unsaved, its drawing back.
      await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');
      await expect(window.getByTestId('part-count')).toHaveText('1');
      // Belt on its sheets, at the zoom it was left.
      await tabs.first().click();
      await expect(window.getByTestId('view-sheets')).toHaveAttribute('aria-selected', 'true');
      await window.getByTestId('view-design').click();
      await expect(window.getByTestId('zoom-level')).toHaveText(leftAt ?? '');
    },
    { env: { XDG_CONFIG_HOME: config } },
  );
});

test('a new project from a template, and any project saved as one (8.14)', async () => {
  const config = mkdtempSync(join(tmpdir(), 'leathercad-e2e-'));
  await withApp(
    async (window) => {
      // From the Project menu: the templates that ship, the sample first.
      await fromProjectMenu(window, 'new-template');
      const dialog = window.getByTestId('template-dialog');
      await expect(dialog.getByTestId('template-builtin:bifold-wallet')).toBeFocused();
      // Chosen, then used: a click picks, Use template opens it.
      await dialog.getByTestId('template-builtin:card-holder').click();
      await expect(dialog.getByTestId('template-builtin:card-holder')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(dialog.getByTestId('template-builtin:card-holder')).toContainText(
        '3 pieces to cut',
      );
      await dialog.getByTestId('template-use').click();
      await expect(window.getByTestId('project-name')).toHaveText('Card holder');
      await expect(window.getByTestId('part-count')).toHaveText('2');
      // Untitled and unchanged: no file, nothing to save.
      await expect(window.getByTestId('file-path')).toHaveCount(0);
      await expect(window.getByTestId('save')).toHaveAttribute('aria-disabled', 'true');

      // Saved as one of the maker's own, under a new name.
      await fromProjectMenu(window, 'save-template');
      const save = window.getByTestId('save-template-dialog');
      await save.getByTestId('template-name').fill('My card holder');
      await save.getByTestId('template-save').click();
      await expect(save).toHaveCount(0);

      // The same name again is said, and replaced only when asked.
      await fromProjectMenu(window, 'save-template');
      await save.getByTestId('template-name').fill('My card holder');
      await save.getByTestId('template-save').click();
      await expect(save.getByTestId('template-problem')).toContainText('already exists');
      await save.getByTestId('template-replace').click();
      await expect(save).toHaveCount(0);

      // Listed under My templates, used, and removed.
      await window.getByTestId('new-tab').click();
      await window.getByTestId('tab-template').click();
      // A double click uses one at once.
      await dialog.getByTestId('template-mine:My card holder').dblclick();
      await expect(window.getByTestId('part-count')).toHaveText('2');
      await fromProjectMenu(window, 'new-template');
      await dialog.getByTestId('template-remove-mine:My card holder').click();
      await expect(dialog.getByTestId('template-mine:My card holder')).toHaveCount(0);
    },
    { env: { XDG_CONFIG_HOME: config } },
  );
});
