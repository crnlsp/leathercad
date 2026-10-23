import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';
import { activeTab, closeActiveTab, renameProject } from './projectMenu.js';

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

  await withApp(
    async (window) => {
      await expect(tabs(window)).toHaveText(['Wallet', 'Belt']);
      await expect(window.getByTestId('project-name')).toHaveText('Wallet');
    },
    { env: { XDG_CONFIG_HOME: config } },
  );
});
