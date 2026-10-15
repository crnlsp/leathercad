import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';
import { choosePaper, fromProjectMenu, renameProject } from './projectMenu.js';
import { resizeWindow } from './windowSize.js';

/**
 * Slice 8.7: the project bar's Project menu, Help and About. Each launch has
 * a config directory of its own, so no test sees another's recent projects.
 */

const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-bar-'));

async function launch(configHome: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await launchApp({ env: { XDG_CONFIG_HOME: configHome } });
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
    // main's, and the vendored typeface, each with its licence text — in the
    // app's own dialog over About (U.20), not a window of its own.
    await about.getByTestId('about-notices').click();
    const notices = window.getByTestId('notices');
    await expect(notices).toBeVisible();
    const text = (await notices.getByTestId('notices-text').textContent()) ?? '';
    expect(text).toContain('LeatherCAD — third-party notices');
    for (const name of ['react 19', 'zod 4', 'electron-log 5', 'IBM Plex Sans']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('SIL OPEN FONT LICENSE');
    expect(app.windows()).toHaveLength(1);
    // Escape closes the notices, and leaves About and the button that opened them.
    await window.keyboard.press('Escape');
    await expect(notices).toHaveCount(0);
    await expect(about.getByTestId('about-notices')).toBeFocused();

    await about.getByTestId('about-close').click();
    await expect(about).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

/** The words a control shows: not those there only to be heard. */
const shown = (window: Page, id: string): Promise<string> =>
  window.getByTestId(id).evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const heard of copy.querySelectorAll('.visually-hidden')) heard.remove();
    return (copy.textContent ?? '').trim();
  });

async function openSample(window: Page): Promise<void> {
  await window.getByTestId('help-menu').click();
  await window.getByTestId('help-open-sample').click();
  await expect(window.getByTestId('project-name')).toHaveText('Bifold wallet');
}

const BAR = [
  'project-menu',
  'save-state',
  'save',
  'view-design',
  'view-sheets',
  'paper-button',
  'export-pdf',
  'export-more',
  'print',
  'print-problems',
  'settings',
  'help-menu',
];

test('the top bar fits every window, its words shortening with the room (8.7, R-06)', async () => {
  const { app, window } = await launch(fresh());
  try {
    // On A5 portrait the sample prints on five sheets, and a changed name adds
    // 'Unsaved changes': the widest the bar gets.
    await openSample(window);
    await choosePaper(window, 'A5', 'portrait');
    await renameProject(window, 'Bifold wallet, lined, with a card pocket each side');
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');

    for (const [width, paper, saveWords] of [
      [1920, '5 × A5 portrait', 'Unsaved changes'],
      [1024, '5 × A5', 'Unsaved'],
      [860, '5', ''],
    ] as const) {
      await resizeWindow(app, window, width, 600);
      const bar = (await window.getByTestId('project-bar').boundingBox())!;
      // One row, the height it has in any window.
      expect(bar.height, `${String(width)}: nothing wrapped`).toBeLessThanOrEqual(42);
      for (const id of BAR) {
        const box = (await window.getByTestId(id).boundingBox())!;
        expect(box.x, `${String(width)}: ${id}`).toBeGreaterThanOrEqual(bar.x);
        expect(box.x + box.width, `${String(width)}: ${id}`).toBeLessThanOrEqual(bar.x + bar.width);
        expect(box.y + box.height, `${String(width)}: ${id}`).toBeLessThanOrEqual(
          bar.y + bar.height,
        );
      }
      expect(await shown(window, 'paper-button')).toBe(paper);
      expect(await shown(window, 'save-state')).toBe(saveWords);
      // Both split buttons keep their labels at every width.
      expect(await shown(window, 'export-pdf')).toBe('Export PDF');
      expect(await shown(window, 'print')).toBe('Print');
      // The switch keeps its icons and the count; the words go at 860 px.
      expect(await shown(window, 'view-sheets')).toBe(width === 860 ? '5' : 'Sheets5');
      // A long name gives way, and its tooltip says it whole.
      const name = window.getByTestId('project-name');
      expect(
        await name.evaluate((element) => element.scrollWidth > element.clientWidth),
        `${String(width)}: the name is cut short`,
      ).toBe(width !== 1920);
    }
    await window.getByTestId('project-menu').hover();
    await expect(
      window.getByRole('tooltip', {
        name: /^Bifold wallet, lined, with a card pocket each side\./,
      }),
    ).toBeVisible();
  } finally {
    await closeApp(app);
  }
});

test('the save state says saved or not, and Save says when there is nothing to save (R-06)', async () => {
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Wallet.lcp');
  const { app, window } = await launch(fresh());
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    const save = window.getByTestId('save');
    // Nothing yet: no state, and Save says why it does nothing, with no key.
    await expect(window.getByTestId('save-state')).toHaveText('');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await save.hover();
    await expect(window.getByRole('tooltip', { name: 'Nothing to save' })).toBeVisible();
    await expect(window.getByRole('tooltip').locator('kbd')).toHaveCount(0);

    await drawAPanel(window);
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');
    await expect(window.getByTestId('save-state').locator('.icon')).toHaveCount(1);
    await expect(save).not.toHaveAttribute('aria-disabled');
    await expect(save.locator('kbd')).toHaveText('Ctrl+S');

    await save.click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
  } finally {
    await closeApp(app);
  }
});

test('Rename… in the Project menu renames the project, as one step, by keyboard too (U.7)', async () => {
  const { app, window } = await launch(fresh());
  try {
    const menu = window.getByTestId('project-menu');
    await menu.focus();
    await window.keyboard.press('Enter');
    // The last of the actions, above the recent projects' line.
    await window.keyboard.press('End');
    await window.keyboard.press('ArrowUp');
    await expect(window.getByTestId('rename')).toBeFocused();
    await window.keyboard.press('Enter');
    const field = window.getByTestId('project-name-input');
    await expect(field).toBeFocused();
    await window.keyboard.type('Card holder');
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('project-name')).toHaveText('Card holder');
    await expect(window).toHaveTitle('• Card holder — LeatherCAD');
    // The keyboard is given back its place.
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAccessibleName('Project menu, Card holder');

    // Escape leaves the name as it was.
    await fromProjectMenu(window, 'rename');
    await field.fill('Something else');
    await field.press('Escape');
    await expect(window.getByTestId('project-name')).toHaveText('Card holder');

    // The whole name was one edit: one undo, back to untitled.
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('project-name')).toHaveText('Untitled');
    await expect(window).toHaveTitle('Untitled — LeatherCAD');
  } finally {
    await closeApp(app);
  }
});

test('Design | Sheets is a tab list: the arrows, Ctrl+1 and Ctrl+2 switch (R-06)', async () => {
  const { app, window } = await launch(fresh());
  try {
    const design = window.getByTestId('view-design');
    const sheets = window.getByTestId('view-sheets');
    const canvas = window.getByTestId('editor-canvas');
    await expect(window.getByRole('tablist', { name: 'View' })).toBeVisible();
    await expect(design).toHaveAttribute('aria-selected', 'true');
    // One stop on Tab: the tab shown.
    await expect(design).toHaveAttribute('tabindex', '0');
    await expect(sheets).toHaveAttribute('tabindex', '-1');
    await expect(sheets).toHaveAccessibleName('Sheets, 1 sheet');

    await design.focus();
    await window.keyboard.press('ArrowRight');
    await expect(sheets).toBeFocused();
    await expect(sheets).toHaveAttribute('aria-selected', 'true');
    await expect(canvas).toHaveAttribute('data-view', 'sheets');
    await window.keyboard.press('Home');
    await expect(design).toBeFocused();
    await expect(canvas).toHaveAttribute('data-view', 'design');

    await window.keyboard.press('Control+2');
    await expect(canvas).toHaveAttribute('data-view', 'sheets');
    await window.keyboard.press('Control+1');
    await expect(canvas).toHaveAttribute('data-view', 'design');

    // A press with the mouse switches and leaves the keys to the board.
    await sheets.click();
    await expect(canvas).toHaveAttribute('data-view', 'sheets');
    await expect(sheets).not.toBeFocused();
  } finally {
    await closeApp(app);
  }
});

test('the paper button, the Sheets tab and the job totals count the same sheets (R-06)', async () => {
  const { app, window } = await launch(fresh());
  try {
    await openSample(window);
    for (const [paper, way, count] of [
      ['A4', 'portrait', '2'],
      ['A5', 'portrait', '5'],
      ['A4', 'landscape', null],
    ] as const) {
      await choosePaper(window, paper, way);
      const button = window.getByTestId('paper-button');
      if (count !== null) await expect(button).toHaveAttribute('data-sheets', count);
      const sheets = (await button.getAttribute('data-sheets')) ?? '';
      expect(await shown(window, 'view-sheets')).toBe(`Sheets${sheets}`);
      await expect(window.getByTestId('job-sheets')).toContainText(`Sheets${sheets} · ${paper}`);
    }
    // The popover says it too, and takes the maker to the sheets.
    await window.getByTestId('paper-button').click();
    await expect(window.getByTestId('paper')).toBeFocused();
    await expect(window.getByTestId('paper-summary')).toHaveText(
      /^\d+ sheets? · scale 100 %, locked · /,
    );
    await window.getByTestId('see-sheets').click();
    await expect(window.getByTestId('paper-popover')).toHaveCount(0);
    await expect(window.getByTestId('editor-canvas')).toHaveAttribute('data-view', 'sheets');

    // Escape closes it and gives focus back to the button.
    await window.getByTestId('paper-button').click();
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('paper-popover')).toHaveCount(0);
    await expect(window.getByTestId('paper-button')).toBeFocused();
  } finally {
    await closeApp(app);
  }
});

test('Print’s second half shows the problems, opens the drawer, and Print lists them first (R-06)', async () => {
  const { app, window } = await launch(fresh());
  try {
    await openSample(window);
    const indicator = window.getByTestId('print-problems');
    await expect(indicator).toHaveAttribute('data-state', 'clear');
    await expect(indicator).toHaveAccessibleName('Problems: nothing to fix');

    // A warning: a piece named in letters the typeface cannot print.
    await window.getByTestId('parts-list').getByText('Lining', { exact: true }).click();
    await window.getByTestId('part-name').fill('Подкладка');
    await window.getByTestId('part-name').press('Enter');
    await expect(indicator).toHaveAttribute('data-state', 'warning');
    await expect(indicator).toHaveText('1');
    await expect(indicator).toHaveAccessibleName('Problems: 1 warning');

    // And an error, which outranks it: an edge margin deeper than the edge.
    await window.getByTestId('parts-list').getByText('Stitch line').first().click();
    const margin = window
      .getByTestId('property-panel')
      .locator('label', { hasText: /^Edge margin/ })
      .locator('input');
    await margin.fill('60');
    await margin.press('Enter');
    await expect(indicator).toHaveAttribute('data-state', 'error');
    const name = (await indicator.getAttribute('aria-label')) ?? '';
    expect(name).toMatch(/^Problems: \d+ errors?, 1 warning$/);
    const errors = /(\d+) error/.exec(name)![1]!;
    await expect(indicator).toHaveText(errors);
    // The drawer says the same, from the same count.
    await expect(window.getByTestId('problems-verdict')).toHaveText(
      name.slice('Problems: '.length),
    );

    // Each half is its own button, with its own name.
    await expect(window.getByTestId('print')).toHaveAccessibleName('Print');
    await expect(window.getByTestId('export-pdf')).toHaveAccessibleName('Export PDF');
    await expect(window.getByTestId('export-more')).toHaveAccessibleName('More ways to export');

    // A click opens the drawer.
    await expect(window.getByTestId('problems-toggle')).toHaveAttribute('aria-expanded', 'false');
    await indicator.click();
    await expect(window.getByTestId('problems-toggle')).toHaveAttribute('aria-expanded', 'true');
    const drawn = await window
      .getByTestId('problems-panel')
      .getByTestId('problem-row')
      .evaluateAll((rows) => rows.map((row) => row.textContent));

    // Print stays enabled, and its dialog lists the same problems, in the same
    // order, before anything else.
    await window.getByTestId('print').click();
    const dialog = window.getByTestId('print-preview');
    const listed = dialog.getByTestId('print-problems-list');
    await expect(listed).toBeVisible();
    expect(
      await listed.getByTestId('problem-row').evaluateAll((rows) => rows.map((r) => r.textContent)),
    ).toEqual(drawn);
    const options = dialog.locator('.print-options > *');
    await expect(options.first()).toHaveAttribute('data-testid', 'print-problems-list');
    // Choosing one goes to it, as the drawer does.
    await listed.getByTestId('problem-row').first().click();
    await expect(dialog).toHaveCount(0);
    await expect(window.getByTestId('selected-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});

test('F1 opens Help, and the keyboard gets its place back (U.7)', async () => {
  const { app, window } = await launch(fresh());
  try {
    await window.getByTestId('help-menu').hover();
    await expect(window.getByRole('tooltip', { name: /Help/ }).locator('kbd')).toHaveText('F1');
    await window.mouse.move(600, 500);
    await window.keyboard.press('F1');
    await expect(window.getByTestId('help-open-sample')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('help-menu-items')).toHaveCount(0);
    await expect(window.getByTestId('help-menu')).toBeFocused();
  } finally {
    await closeApp(app);
  }
});

test('the save state and the problems are said politely, once per change (§2)', async () => {
  const { app, window } = await launch(fresh());
  try {
    const announcer = window.getByTestId('announcer');
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
    // Count every change a screen reader would hear.
    await window.evaluate(() => {
      const counts = { save: 0, problems: 0 };
      (window as unknown as { said: typeof counts }).said = counts;
      for (const which of ['save', 'problems'] as const) {
        new MutationObserver((records) => {
          counts[which] += records.length > 0 ? 1 : 0;
        }).observe(document.querySelector(`[data-testid="announce-${which}"]`)!, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      }
    });
    const said = () => window.evaluate(() => (window as unknown as { said: object }).said);

    // A drag of a rectangle, many frames long: the save state changes once.
    await drawAPanel(window);
    await expect(window.getByTestId('announce-save')).toHaveText('Unsaved changes');
    // A second edit changes nothing that is said.
    await window.getByTestId('tool-rectangle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.move(box.x + 400, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 500, box.y + 260, { steps: 10 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('2');
    await window.waitForTimeout(200);
    expect(await said()).toEqual({ save: 1, problems: 0 });
  } finally {
    await closeApp(app);
  }
});

test('the window’s edited flag follows unsaved work (§2)', async () => {
  const project = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Wallet.lcp');
  const { app, window } = await launch(fresh());
  try {
    // macOS draws it; elsewhere Electron ignores it, so the call is what is checked.
    await app.evaluate(({ BrowserWindow, dialog }, path) => {
      const shown = BrowserWindow.getAllWindows()[0]!;
      const calls: boolean[] = [];
      (globalThis as { edited?: boolean[] }).edited = calls;
      shown.setDocumentEdited = (edited: boolean) => void calls.push(edited);
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, project);
    const edited = () =>
      app.evaluate(() => (globalThis as { edited?: boolean[] }).edited?.at(-1) ?? null);

    await drawAPanel(window);
    await expect.poll(edited).toBe(true);
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    await expect.poll(edited).toBe(false);
  } finally {
    await closeApp(app);
  }
});
