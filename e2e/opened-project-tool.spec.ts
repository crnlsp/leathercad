import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import {
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
} from '../packages/document/src/index.js';
import { Viewport } from '../packages/editor/src/index.js';
import { saveProject } from '../packages/persist/src/index.js';
import { freshStateHome, recoveryDir, withApp } from './launchApp.js';
import { activeTab, closeActiveTab, fromProjectMenu } from './projectMenu.js';

/** Q41: the first click in an opened project selects, rather than starting a shape. */
function panelFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'leathercad-opening-')), 'Panel.lcp');
  const { project } = addPart(
    rectanglePart('panel', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, 100, 60)),
  ).apply(emptyDocument('opening'));
  writeFileSync(
    file,
    saveProject(project, {
      applicationVersion: '1.6.0',
      now: () => new Date('2026-11-01T00:00:00Z'),
    }),
  );
  return file;
}

async function chooseFile(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, file);
}

async function expectFirstClickSelects(window: Page): Promise<void> {
  await expect(window.getByTestId('part-count')).toHaveText('1');
  await expect(window.getByTestId('tool-select')).toHaveClass(/\bactive\b/);
  // Fit centres this single panel; true size then gives a known point on its
  // left edge. Use the editor's camera for the conversion, as the app does.
  await window.getByTestId('zoom-fit').click();
  await window.keyboard.press('ControlOrMeta+0');
  await expect(window.getByTestId('zoom-level')).toHaveText('100 %');
  const box = await window.getByTestId('editor-canvas').boundingBox();
  if (box === null) throw new Error('The board is not visible');
  const camera = new Viewport();
  camera.resize(box.width, box.height);
  camera.centreMm = { x: 50, y: 30 };
  camera.zoomToPercent(100);
  const edge = camera.toScreen({ x: 0, y: 30 });
  await window.mouse.click(box.x + edge.x, box.y + edge.y);
  await expect(window.getByTestId('selected-count')).toHaveText('1');
  await expect(window.getByTestId('property-header')).toContainText('Panel');
  await expect(window.getByTestId('undo')).toBeDisabled();
}

for (const route of ['project', 'tab', 'start'] as const) {
  test(`Open from ${route} starts in Select (Q41)`, async () => {
    await withApp(async (window, app) => {
      await chooseFile(app, panelFile());
      if (route === 'project') await fromProjectMenu(window, 'open');
      else if (route === 'tab') {
        await window.getByTestId('new-tab').click();
        await window.getByTestId('tab-open').click();
      } else {
        await closeActiveTab(window);
        await window.getByTestId('start-open').click();
      }
      await expectFirstClickSelects(window);
      if (route === 'project') {
        const png = await app.evaluate(async ({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0];
          if (window === undefined) throw new Error('The app window is missing');
          return (await window.webContents.capturePage()).toPNG().toString('base64');
        });
        await test.info().attach('opened-project-select', {
          body: Buffer.from(png, 'base64'),
          contentType: 'image/png',
        });
      }
    });
  });
}

for (const route of ['project', 'tab', 'start', 'reopen'] as const) {
  test(`${route}: reopening a project starts in Select (Q41)`, async () => {
    await withApp(async (window, app) => {
      await chooseFile(app, panelFile());
      await fromProjectMenu(window, 'open');
      await expect(window.getByTestId('part-count')).toHaveText('1');
      await window.getByTestId('tool-circle').click();
      await closeActiveTab(window);
      await expect(window.getByTestId('start-recent-0')).toBeVisible();
      if (route === 'start') await window.getByTestId('start-recent-0').click();
      else if (route === 'reopen') await window.keyboard.press('ControlOrMeta+Shift+t');
      else {
        await window.getByTestId('start-new').click();
        await window.getByTestId(route === 'tab' ? 'new-tab' : 'project-menu').click();
        await window.getByTestId(route === 'tab' ? 'tab-recent-0' : 'recent-0').click();
      }
      await expectFirstClickSelects(window);
    });
  });
}

test('a project on the launch command line starts in Select (Q41)', async () => {
  await withApp(async (window) => expectFirstClickSelects(window), { args: [panelFile()] });
});

test('a dropped project starts in Select (Q41)', async () => {
  await withApp(async (window) => {
    const file = panelFile();
    // A real file supplied by the OS boundary: File objects constructed from
    // bytes alone have no path for Electron's webUtils.getPathForFile.
    await window.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'dropped-project';
      document.body.append(input);
    });
    const input = window.locator('#dropped-project');
    await input.setInputFiles(file);
    await input.evaluate((element: HTMLInputElement) => {
      const transfer = new DataTransfer();
      for (const file of element.files ?? []) transfer.items.add(file);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
      element.remove();
    });
    await expectFirstClickSelects(window);
  });
});

test('an OS open-file event starts the project in Select (Q41)', async () => {
  await withApp(async (window, app) => {
    await window.getByTestId('tool-circle').click();
    await app.evaluate(({ app }, path) => {
      app.emit('open-file', { preventDefault() {} }, path);
    }, panelFile());
    await expectFirstClickSelects(window);
  });
});

test('a template starts in Select, including when opened from Sheets (Q41)', async () => {
  await withApp(async (window, app) => {
    await chooseFile(app, panelFile());
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await fromProjectMenu(window, 'save-template');
    await window.getByTestId('template-name').fill('Opening panel');
    await window.getByTestId('template-save').click();
    await expect(window.getByTestId('save-template-dialog')).toHaveCount(0);
    await window.getByTestId('tool-circle').click();
    await window.getByTestId('view-sheets').click();
    await fromProjectMenu(window, 'new-template');
    await window.getByTestId('template-mine:Opening panel').dblclick();
    await expectFirstClickSelects(window);
    await window.getByTestId('view-sheets').click();
    await window.getByTestId('view-design').click();
    await expect(window.getByTestId('tool-select')).toHaveClass(/\bactive\b/);
  });
});

for (const view of ['design', 'sheets'] as const) {
  test(`a saved session restored in ${view} starts in Select (Q41)`, async () => {
    const config = mkdtempSync(join(tmpdir(), 'leathercad-opening-config-'));
    await withApp(
      async (window, app) => {
        await chooseFile(app, panelFile());
        await fromProjectMenu(window, 'open');
        await expect(window.getByTestId('part-count')).toHaveText('1');
        await window.getByTestId('tool-circle').click();
        if (view === 'sheets') await window.getByTestId('view-sheets').click();
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
        await expect.poll(() => app.windows().length).toBe(0);
      },
      { env: { XDG_CONFIG_HOME: config } },
    );
    await withApp(
      async (window) => {
        await expect(window.getByTestId(`view-${view}`)).toHaveAttribute('aria-selected', 'true');
        if (view === 'sheets') await window.getByTestId('view-design').click();
        await expectFirstClickSelects(window);
      },
      { env: { XDG_CONFIG_HOME: config } },
    );
  });
}

test('kept unsaved work starts in Select at the next launch (Q41)', async () => {
  const config = mkdtempSync(join(tmpdir(), 'leathercad-opening-config-'));
  await withApp(
    async (window, app) => {
      await chooseFile(app, panelFile());
      await fromProjectMenu(window, 'open');
      await expect(window.getByTestId('part-count')).toHaveText('1');
      await window.keyboard.press('ControlOrMeta+Comma');
      await window.getByTestId('setting-keep-unsaved').check();
      await window.keyboard.press('Escape');
      await window.getByTestId('feature-row-outline').click();
      const width = window.getByTestId('property-panel').getByLabel('Width');
      await width.fill('110');
      await width.press('Enter');
      await width.fill('100');
      await width.press('Enter');
      await window.getByTestId('tool-circle').click();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      await expect.poll(() => app.windows().length).toBe(0);
    },
    { env: { XDG_CONFIG_HOME: config } },
  );
  await withApp(
    async (window) => {
      await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');
      await expectFirstClickSelects(window);
    },
    { env: { XDG_CONFIG_HOME: config } },
  );
});

test('recovering a project starts in Select (Q41)', async () => {
  const state = freshStateHome();
  mkdirSync(recoveryDir(state), { recursive: true });
  copyFileSync(panelFile(), join(recoveryDir(state), '999999-1.lcp'));
  await withApp(
    async (window) => {
      await window.getByTestId('recovery-recover').click();
      await expect(window.getByTestId('recovery-dialog')).toHaveCount(0);
      await expectFirstClickSelects(window);
    },
    { state },
  );
});

test('New resets Rectangle, while switching existing tabs keeps the chosen tool (Q41)', async () => {
  await withApp(async (window, app) => {
    await chooseFile(app, panelFile());
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('tool-circle').click();
    await fromProjectMenu(window, 'new');
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/\bactive\b/);
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await window.getByTestId('tool-circle').click();
    await window.getByTestId('tab-strip').getByRole('tab').first().click();
    await expect(window.getByTestId('tool-circle')).toHaveClass(/\bactive\b/);
    await window.getByTestId('tab-strip').getByRole('tab').last().click();
    await expect(window.getByTestId('tool-circle')).toHaveClass(/\bactive\b/);
  });
});

test('New from Sheets starts in Rectangle and keeps it after visiting Sheets (Q41)', async () => {
  await withApp(async (window) => {
    await window.getByTestId('tool-circle').click();
    await window.getByTestId('view-sheets').click();
    await fromProjectMenu(window, 'new');
    await expect(window.getByTestId('view-design')).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/\bactive\b/);
    await window.getByTestId('view-sheets').click();
    await window.getByTestId('view-design').click();
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/\bactive\b/);
  });
});

test('a duplicated project starts in Select (Q41)', async () => {
  await withApp(async (window, app) => {
    await chooseFile(app, panelFile());
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('tool-circle').click();
    await activeTab(window).click({ button: 'right' });
    await window.getByTestId('tab-duplicate').click();
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(2);
    await expectFirstClickSelects(window);
  });
});

test('a failed Open keeps the chosen tool and the current project (Q41)', async () => {
  await withApp(async (window, app) => {
    const damaged = panelFile();
    writeFileSync(damaged, 'not a project');
    await chooseFile(app, damaged);
    await window.getByTestId('tool-circle').click();
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('file-error')).toBeVisible();
    await expect(window.getByTestId('tool-circle')).toHaveClass(/\bactive\b/);
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(1);
  });
});

test('cancelling Open or opening an existing tab keeps the chosen tool (Q41)', async () => {
  await withApp(async (window, app) => {
    await chooseFile(app, panelFile());
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('tool-circle').click();
    await fromProjectMenu(window, 'open');
    await expect(activeTab(window)).toHaveClass(/\bnudged\b/);
    await expect(window.getByTestId('tool-circle')).toHaveClass(/\bactive\b/);
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('tool-circle')).toHaveClass(/\bactive\b/);
  });
});
