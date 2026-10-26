import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { ONE_PRINTER, fakeCups } from './fakeCups.js';
import { freshStateHome, launchApp, openApp, openSample } from './launchApp.js';
import { resizeWindow } from './windowSize.js';

/**
 * U.20: what Chromium and Electron still drew themselves in the dark window —
 * light scrollbars and controls, focus in the desktop's colour, a stray
 * Ctrl+A painting the window, a spellchecker that fetched a dictionary, no
 * menu in a field, a bare notices window and a native message box.
 */

const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-u20-'));

const launch = (env: Record<string, string> = {}) =>
  openApp({ env: { XDG_CONFIG_HOME: fresh(), ...env } });

interface Stop {
  readonly name: string;
  readonly ring: string;
  readonly inside: boolean;
}

/**
 * Tab, round once, from where focus is: each stop, its outline style, and
 * whether it is inside `within` — the dialog on top. Stops when a stop comes
 * round again, or focus leaves the dialog.
 */
async function walk(window: Page, within: string | null): Promise<Stop[]> {
  await window.evaluate(() => {
    for (const element of document.querySelectorAll('[data-walked]')) {
      element.removeAttribute('data-walked');
    }
  });
  const stops: Stop[] = [];
  for (let i = 0; i < 120; i++) {
    await window.keyboard.press('Tab');
    const stop = await window.evaluate((selector) => {
      const element = document.activeElement as HTMLElement | null;
      if (element === null || element === document.body) return null;
      if (element.hasAttribute('data-walked')) return 'again' as const;
      element.setAttribute('data-walked', '');
      const name =
        element.dataset['testid'] ?? element.getAttribute('aria-label') ?? element.tagName;
      return {
        name,
        ring: getComputedStyle(element).outlineStyle,
        inside: selector === null || element.closest(selector) !== null,
      };
    }, within);
    if (stop === 'again') break;
    if (stop === null) continue;
    stops.push(stop);
    if (!stop.inside) break;
  }
  return stops;
}

/** Every stop rings, none in Chromium's `auto`, and Tab never leaves the dialog. */
async function expectRings(
  window: Page,
  what: string,
  within: string | null,
  atLeast = 1,
): Promise<void> {
  const stops = await walk(window, within);
  expect(stops.length, `${what}: tab stops`).toBeGreaterThanOrEqual(atLeast);
  expect(
    stops.filter((stop) => stop.ring === 'auto').map((stop) => stop.name),
    `${what}: Chromium's own ring`,
  ).toEqual([]);
  expect(
    stops.filter((stop) => !stop.inside).map((stop) => stop.name),
    `${what}: Tab left the dialog`,
  ).toEqual([]);
}

const DIALOG = '[aria-modal="true"]';

test('every tab stop rings in the accent, in the window and every dialog, and Tab stays in a dialog', async () => {
  test.setTimeout(180_000);
  const cups = fakeCups(ONE_PRINTER);
  const { app, window } = await launch(
    process.platform === 'win32' ? {} : { PATH: `${cups.bin}:${process.env['PATH'] ?? ''}` },
  );
  try {
    await openSample(window);
    for (const [width, height] of [
      [1400, 600],
      [1024, 600],
    ] as const) {
      await resizeWindow(app, window, width, height);
      await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expectRings(window, `the window at ${String(width)}`, null, 25);
    }
    await resizeWindow(app, window, 1400, 600);

    await window.getByTestId('settings').click();
    for (const section of ['general', 'appearance', 'tools', 'language', 'shortcuts']) {
      await window.getByTestId(`settings-tab-${section}`).click();
      await expectRings(window, `Settings › ${section}`, DIALOG);
    }
    await window.getByTestId('settings-close').click();

    await window.getByTestId('print').click();
    const preview = window.getByTestId('print-preview');
    await expect(preview.locator('canvas').first()).toBeVisible();
    await expectRings(window, 'Print', DIALOG, process.platform === 'win32' ? 3 : 8);
    // Copies is a count in the app's own field: the window has no spin button.
    await expect(window.locator('input[type="number"]')).toHaveCount(0);
    if (process.platform !== 'win32') {
      // The sheets' boxes and the orientation's dots in the accent, not Chromium's blue.
      for (const control of [
        preview.getByTestId('print-include').first(),
        preview.getByTestId('print-portrait'),
      ]) {
        await expect(control).toHaveCSS('accent-color', 'rgb(201, 162, 39)');
      }
    }
    await preview.getByRole('button', { name: 'Cancel' }).click();

    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-about').click();
    await expectRings(window, 'About', DIALOG);
    await window.getByTestId('about-notices').click();
    await expect(window.getByTestId('notices')).toBeVisible();
    await expectRings(window, 'the third-party notices', DIALOG);
    await window.getByTestId('notices-close').click();
    await window.getByTestId('about-close').click();

    await window.getByTestId('parts-list').getByText('Outline').first().click();
    await window.getByTestId('property-panel').getByTestId('delete-feature').click();
    await expect(window.getByTestId('delete-dialog')).toBeVisible();
    await expectRings(window, 'Delete', DIALOG);
    await window.getByTestId('delete-cancel').click();

    await window.getByTestId('project-menu').click();
    await window.getByTestId('rename').click();
    await window.getByTestId('project-name-input').fill('Gusset wallet');
    await window.getByTestId('project-name-input').press('Enter');
    // Opening no longer replaces anything (8.12); closing the tab asks.
    await window.keyboard.press('Control+w');
    await expect(window.getByTestId('unsaved-dialog')).toBeVisible();
    await expectRings(window, 'Unsaved changes', DIALOG);
  } finally {
    await closeApp(app);
    rmSync(cups.bin, { recursive: true, force: true });
  }
});

test('closing a dialog gives the keys back to what opened it (U.19)', async () => {
  // Found walking the work by the keys alone: Esc out of Print left the focus
  // on nothing, so the next Tab started again at the top of the window.
  const { app, window } = await launch();
  try {
    await openSample(window);
    const print = window.getByTestId('print');
    await print.focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('print-preview')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('print-preview')).toHaveCount(0);
    await expect(print).toBeFocused();

    // By its key, from the board: back to the board.
    const board = window.getByTestId('editor-canvas');
    await board.focus();
    await window.keyboard.press('Control+KeyP');
    await expect(window.getByTestId('print-preview')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(board).toBeFocused();

    const settings = window.getByTestId('settings');
    await settings.focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('settings-dialog')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('settings-dialog')).toHaveCount(0);
    await expect(settings).toBeFocused();
  } finally {
    await closeApp(app);
  }
});

test('switching view from a control the other view does not have leaves the keys on the board (U.19)', async () => {
  // Rectangle is not on the Sheets view's rail: Ctrl+2 from it left the focus
  // on nothing, and the next Tab started from the top of the window.
  const { app, window } = await launch();
  try {
    await window.getByTestId('tool-rectangle').focus();
    await window.keyboard.press('Control+Digit2');
    await expect(window.getByTestId('sheets-summary')).toBeVisible();
    await expect(window.getByTestId('editor-canvas')).toBeFocused();
  } finally {
    await closeApp(app);
  }
});

test('the recovery dialog rings, and keeps Tab', async () => {
  const state = freshStateHome();
  const env = { LEATHERCAD_RECOVERY_INTERVAL_MS: '250' };
  const first = await launchApp({ state, env });
  try {
    const window = await first.firstWindow();
    await openSample(window);
    await window.getByTestId('project-menu').click();
    await window.getByTestId('rename').click();
    await window.getByTestId('project-name-input').fill('Gusset wallet');
    await window.getByTestId('project-name-input').press('Enter');
    await expect
      .poll(() => readdirSync(join(state, 'leathercad', 'recovery')).length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await new Promise<void>((done) => {
      first.process().once('exit', () => done());
      first.process().kill('SIGKILL');
    });
  } catch (error) {
    await closeApp(first);
    throw error;
  }
  const second = await launchApp({ state, env });
  try {
    const window = await second.firstWindow();
    await expect(window.getByTestId('recovery-dialog')).toBeVisible();
    await expectRings(window, 'Recovery', DIALOG);
  } finally {
    await closeApp(second);
    rmSync(state, { recursive: true, force: true });
  }
});

test('in forced colours the ring is still a solid line', async () => {
  const { app, window } = await launch();
  try {
    await window.emulateMedia({ forcedColors: 'active' });
    await window.getByTestId('toggle-parts').focus();
    await window.keyboard.press('Shift+Tab');
    await window.keyboard.press('Tab');
    await expect(window.getByTestId('toggle-parts')).toBeFocused();
    await expect(window.getByTestId('toggle-parts')).toHaveCSS('outline-style', 'solid');
    await expect(window.getByTestId('toggle-parts')).toHaveCSS('outline-width', '2px');

    // A list's option at hand takes the system's highlight, not the window's colour.
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-language').click();
    const language = window.getByTestId('setting-language');
    await language.click();
    await window.keyboard.press('ArrowDown');
    const [tag, atHand, highlight] = await window.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'Highlight';
      document.body.append(probe);
      const system = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const option = document.activeElement!;
      return [option.tagName, getComputedStyle(option).backgroundColor, system];
    });
    expect(tag).toBe('OPTION');
    expect(atHand).toBe(highlight);
  } finally {
    await closeApp(app);
  }
});

test('the window is dark to Chromium: its scrollbars, lists and controls', async () => {
  const { app, window } = await launch();
  try {
    await openSample(window);
    const root = window.locator('html');
    await expect(root).toHaveCSS('color-scheme', 'dark');
    // Thin, with the shell's thumb on a clear track, said once and inherited.
    const parts = window.getByTestId('parts-list');
    await expect(parts).toHaveCSS('scrollbar-width', 'thin');
    await expect(parts).toHaveCSS('scrollbar-color', 'rgb(107, 112, 121) rgba(0, 0, 0, 0)');

    // A list's options are the app's to draw, and its keys are its own:
    // Escape closes the list and leaves Settings open; a letter finds an option
    // rather than choosing a tool.
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-language').click();
    const language = window.getByTestId('setting-language');
    await expect(language).toHaveCSS('appearance', 'base-select');
    await language.click();
    await expect.poll(() => language.evaluate((list) => list.matches(':open'))).toBe(true);
    await window.keyboard.press('c');
    await window.keyboard.press('Escape');
    await expect.poll(() => language.evaluate((list) => list.matches(':open'))).toBe(false);
    await expect(window.getByTestId('settings-dialog')).toBeVisible();
    await window.getByTestId('settings-close').click();
    await expect(window.getByTestId('tool-circle')).not.toHaveClass(/active/);
  } finally {
    await closeApp(app);
  }
});

test('Ctrl+A selects nothing outside a field, and a field’s text inside one', async () => {
  const { app, window } = await launch();
  try {
    await openSample(window);
    const selected = (): Promise<number> =>
      window.evaluate(() => getSelection()?.toString().length ?? 0);

    // Outside a field: nothing, and a double-click on a label takes nothing either.
    await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await window.keyboard.press('Control+a');
    expect(await selected()).toBe(0);
    await window.getByTestId('property-panel').getByText('Pieces').dblclick();
    expect(await selected()).toBe(0);

    /** Ctrl+A in a field selects the whole of its text. */
    const selectsAll = async (field: ReturnType<Page['getByTestId']>): Promise<void> => {
      await expect(field).toHaveCSS('user-select', 'text');
      await field.focus();
      await field.press('End');
      await field.press('Control+a');
      expect(
        await field.evaluate(
          (input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!,
        ),
      ).toBe(await field.evaluate((input: HTMLInputElement) => input.value.length));
    };

    // The project's name.
    await window.getByTestId('project-menu').click();
    await window.getByTestId('rename').click();
    await selectsAll(window.getByTestId('project-name-input'));
    await window.getByTestId('project-name-input').press('Escape');

    // Parts' rename.
    await window.getByTestId('parts-list').getByText('Stitch line').first().click();
    await window.keyboard.press('F2');
    await selectsAll(window.getByTestId('row-name-input'));
    await window.getByTestId('row-name-input').press('Escape');

    // Properties' Name.
    await selectsAll(
      window.getByTestId('property-panel').getByRole('textbox', { name: 'Name', exact: true }),
    );

    // About's version, to paste into a report.
    await window.getByTestId('help-menu').click();
    await window.getByTestId('help-about').click();
    await expect(window.getByTestId('about-version')).toHaveCSS('user-select', 'text');
  } finally {
    await closeApp(app);
  }
});

test('the spellchecker is off, and a fresh profile fetches no dictionary', async () => {
  const config = fresh();
  const app = await launchApp({ env: { XDG_CONFIG_HOME: config } });
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    expect(
      await app.evaluate(({ session }) => ({
        enabled: session.defaultSession.isSpellCheckerEnabled(),
        languages: session.defaultSession.getSpellCheckerLanguages(),
      })),
    ).toEqual({ enabled: false, languages: [] });

    // Typed into a name: what fetched en-US-10-1.bdic from Google before.
    await window.getByTestId('project-menu').click();
    await window.getByTestId('rename').click();
    await window.getByTestId('project-name-input').pressSequentially('Gusset wallte');
    await window.waitForTimeout(3000);
    // Chromium makes the folder; nothing is put in it.
    const dictionaries = join(config, 'leathercad', 'Dictionaries');
    expect(existsSync(dictionaries) ? readdirSync(dictionaries) : []).toEqual([]);
  } finally {
    await closeApp(app);
  }
});

test('a field’s right-click menu cuts, copies, pastes and selects all, in the app’s words', async () => {
  const { app, window } = await launch();
  try {
    await openSample(window);
    await window.getByTestId('project-menu').click();
    await window.getByTestId('rename').click();
    const name = window.getByTestId('project-name-input');
    await expect(name).toBeFocused();

    await name.click({ button: 'right' });
    const menu = window.getByTestId('field-menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      /^Cut\s*Ctrl\+X/,
      /^Copy\s*Ctrl\+C/,
      /^Paste\s*Ctrl\+V/,
      /^Select all\s*Ctrl\+A/,
    ]);
    // The board's menu never opens over a field.
    await expect(window.getByTestId('context-menu')).toHaveCount(0);
    await menu.getByTestId('field-select-all').click();
    // Still renaming: opening the menu was not leaving the field.
    await expect(name).toBeFocused();

    await name.click({ button: 'right' });
    await window.getByTestId('field-menu').getByTestId('field-copy').click();
    await name.press('End');
    // From the keyboard too, opened at the field, with the caret where it is:
    // nothing is selected, so Cut and Copy say so, and Paste puts the copy at
    // the caret.
    await name.press('Shift+F10');
    await expect(window.getByTestId('field-menu')).toBeVisible();
    await expect(window.getByTestId('field-cut')).toBeFocused();
    await expect(window.getByTestId('field-cut')).toHaveAttribute('aria-disabled', 'true');
    await expect(window.getByTestId('field-copy')).toHaveAttribute('aria-disabled', 'true');
    await window.getByTestId('field-paste').click();
    await expect(name).toHaveValue('Bifold walletBifold wallet');

    // Escape closes it, back to the field.
    await name.press('Shift+F10');
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('field-menu')).toHaveCount(0);
    await expect(name).toBeFocused();
    await name.press('Enter');
    await expect(window.getByTestId('project-name')).toHaveText('Bifold walletBifold wallet');

    // Parts' rename: the field's menu, not the piece's.
    await window.getByTestId('parts-list').getByText('Stitch line').first().click();
    await window.keyboard.press('F2');
    await window.getByTestId('row-name-input').click({ button: 'right' });
    await expect(window.getByTestId('field-menu')).toBeVisible();
    await expect(window.getByTestId('context-menu')).toHaveCount(0);
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('row-name-input')).toBeFocused();
  } finally {
    await closeApp(app);
  }
});

test('a recent project that is gone is said in the app’s own dialog', async () => {
  const config = fresh();
  const gone = join(config, 'moved away.lcp');
  mkdirSync(join(config, 'leathercad'), { recursive: true });
  writeFileSync(
    join(config, 'leathercad', 'preferences.json'),
    JSON.stringify({ version: 1, recentFiles: [gone] }),
  );
  const app = await launchApp({ env: { XDG_CONFIG_HOME: config } });
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await window.getByTestId('project-menu').click();
    await window.getByTestId('recent-0').click();

    const dialog = window.getByTestId('recent-gone');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('That project is no longer there');
    await expect(dialog).toContainText(gone);
    await expect(window.getByTestId('recent-gone-close')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Taken off the list.
    await window.getByTestId('project-menu').click();
    await expect(window.getByTestId('recent-0')).toHaveCount(0);
  } finally {
    await closeApp(app);
    rmSync(config, { recursive: true, force: true });
  }
});
