import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadProject } from '../packages/persist/src/index.js';
import { expect, test, type Page } from '@playwright/test';

import de from '../apps/desktop/src/locales/de.json' with { type: 'json' };
import en from '../apps/desktop/src/locales/en.json' with { type: 'json' };
import es from '../apps/desktop/src/locales/es.json' with { type: 'json' };
import fr from '../apps/desktop/src/locales/fr.json' with { type: 'json' };
import pl from '../apps/desktop/src/locales/pl.json' with { type: 'json' };
import ru from '../apps/desktop/src/locales/ru.json' with { type: 'json' };
import { closeApp, crashApp } from './closeApp.js';
import { ONE_PRINTER, fakeCups } from './fakeCups.js';
import {
  drawAPanel,
  expectNoViolations,
  freshStateHome,
  openApp,
  recoveryCopies,
} from './launchApp.js';
import { closeActiveTab } from './projectMenu.js';
import { resizeWindow } from './windowSize.js';

const CATALOGUES = { en, pl, de, ru, fr, es };
const ENGLISH_SYSTEM = { LANGUAGE: 'en_GB', LC_ALL: 'en_GB.UTF-8', LANG: 'en_GB.UTF-8' };

async function switchLanguage(window: Page, tag: keyof typeof CATALOGUES): Promise<void> {
  await window.getByTestId('settings').click();
  await window.getByTestId('settings-tab-language').click();
  const choice = window.getByTestId('setting-language');
  await choice.selectOption(tag);
  await expect(window.locator('html')).toHaveAttribute('lang', new RegExp(`^${tag}`));
  await expect(window.getByTestId('settings-dialog')).toContainText(
    CATALOGUES[tag].settings.language.name,
  );
  await window.getByTestId('settings-close').click();
}

async function capture(window: Page, name: string): Promise<void> {
  const path = test.info().outputPath(`${name}.png`);
  await window.screenshot({ path });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

async function noHorizontalOverflow(window: Page): Promise<void> {
  const overflowing = await window.evaluate(() => {
    const selectors = [
      'body',
      '.dialog',
      '.settings-pane',
      '.print-controls',
      '.export-dialog',
      '.start-column',
    ];
    return selectors.flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter(
          (element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1,
        )
        .map(() => selector),
    );
  });
  if (overflowing.length > 0) {
    await test
      .info()
      .attach('overflow', { body: await window.screenshot(), contentType: 'image/png' });
    const outside = await window.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > innerWidth + 1 &&
            element.getBoundingClientRect().width > 0,
        )
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          id: element.dataset['testid'],
          class: element.className,
          right: element.getBoundingClientRect().right,
          viewport: innerWidth,
        })),
    );
    expect(overflowing, JSON.stringify(outside)).toEqual([]);
  }
}

test('production switches all registered languages and returns to English in the renderer and native dialogs', async () => {
  const { app, window } = await openApp({ env: ENGLISH_SYSTEM });
  try {
    await expect(window.locator('html')).toHaveAttribute('lang', /^en/);
    for (const tag of ['pl', 'de', 'ru', 'fr', 'es', 'en'] as const) {
      await switchLanguage(window, tag);
      await expect(window.getByTestId('settings')).toHaveAccessibleName(
        CATALOGUES[tag].projectBar.settings,
      );
      await app.evaluate(({ dialog }) => {
        dialog.showSaveDialog = async (_browser, options) => {
          Reflect.set(globalThis, '__localizationSaveTitle', options.title);
          Reflect.set(globalThis, '__localizationSavePath', options.defaultPath);
          return { canceled: true, filePath: undefined };
        };
      });
      await window.keyboard.press('ControlOrMeta+Shift+s');
      await expect
        .poll(() => app.evaluate(() => Reflect.get(globalThis, '__localizationSaveTitle')))
        .toBe(CATALOGUES[tag].file.saveTitle);
      await expect
        .poll(() => app.evaluate(() => Reflect.get(globalThis, '__localizationSavePath')))
        .toBe(`${en.app.untitled}.lcp`);
    }
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-language').click();
    await expect(window.getByTestId('setting-language').locator('option')).toHaveCount(
      Object.keys(CATALOGUES).length + 1,
    );
    await expect(window.getByTestId('setting-language')).not.toContainText('expanded');
  } finally {
    await closeApp(app);
  }
});

for (const tag of ['en', 'pl', 'de', 'ru', 'fr', 'es'] as const) {
  test(`${tag} drawing controls fit on both sides of the 1200 px breakpoint`, async () => {
    const { app, window } = await openApp({ env: ENGLISH_SYSTEM });
    try {
      await switchLanguage(window, tag);
      for (const width of [1199, 1200, 1201, 1280]) {
        await resizeWindow(app, window, width, 840);
        const modes = window.getByTestId('draw-as-select');
        const marking = window.getByTestId('draw-as-marking');
        if (width < 1200) {
          await expect(modes).toBeVisible();
          await expect(marking).toBeHidden();
          for (const mode of [
            'outline',
            'stitch-allowance',
            'cut-out',
            'stitch',
            'fold',
            'marking',
          ]) {
            await modes.selectOption(mode);
            await expect(modes).toHaveValue(mode);
          }
        } else {
          await expect(modes).toBeHidden();
          for (const mode of [
            'outline',
            'stitch-allowance',
            'cut-out',
            'stitch',
            'fold',
            'marking',
          ]) {
            const chip = window.getByTestId(`draw-as-${mode}`);
            await expect(chip).toBeInViewport({ ratio: 1 });
            await chip.click();
            await expect(chip).toHaveAttribute('aria-pressed', 'true');
          }
        }
        const overflow = await window
          .getByTestId('tool-options')
          .evaluate((element) => element.scrollWidth > element.clientWidth);
        expect(overflow, `${tag} drawing controls at ${width} px`).toBe(false);
        await noHorizontalOverflow(window);
        await expectNoViolations(window, `${tag} drawing controls at ${width} px`);
        await capture(window, `${tag}-drawing-controls-${width}`);
      }
    } finally {
      await closeApp(app);
    }
  });
}

for (const tag of ['pl', 'de', 'ru', 'fr', 'es'] as const) {
  test(`${tag} survives a restart and system detection resolves it`, async () => {
    const config = mkdtempSync(join(tmpdir(), 'leathercad-locale-'));
    const first = await openApp({ env: { ...ENGLISH_SYSTEM, XDG_CONFIG_HOME: config } });
    try {
      await switchLanguage(first.window, tag);
      const stored = join(config, 'leathercad', 'preferences.json');
      await expect
        .poll(() =>
          existsSync(stored) ? JSON.parse(readFileSync(stored, 'utf8')).language : undefined,
        )
        .toBe(tag);
    } finally {
      await closeApp(first.app);
    }
    const system = `${tag}_${tag.toUpperCase()}`;
    const second = await openApp({
      env: {
        XDG_CONFIG_HOME: config,
        LANGUAGE: system,
        LC_ALL: `${system}.UTF-8`,
        LANG: `${system}.UTF-8`,
      },
    });
    try {
      await expect(second.window.locator('html')).toHaveAttribute('lang', new RegExp(`^${tag}`));
      await second.window.getByTestId('settings').click();
      await second.window.getByTestId('settings-tab-language').click();
      await expect(second.window.getByTestId('setting-language')).toHaveValue(tag);
      await second.window.getByTestId('setting-language').selectOption('system');
      if (process.platform === 'linux') {
        await expect(second.window.locator('html')).toHaveAttribute(
          'lang',
          `${tag}-${tag.toUpperCase()}`,
        );
      }
    } finally {
      await closeApp(second.app);
    }
  });

  test(`${tag} keeps project data unchanged and fits representative screens at minimum and desktop sizes`, async () => {
    test.setTimeout(180_000);
    const cups = fakeCups(ONE_PRINTER);
    const directory = mkdtempSync(join(tmpdir(), 'leathercad-locale-project-'));
    const project = join(directory, 'unchanged.lcp');
    copyFileSync(resolve('fixtures/projects/print-test.lcp'), project);
    const original = readFileSync(project);
    const { app, window } = await openApp({
      env:
        process.platform === 'win32'
          ? ENGLISH_SYSTEM
          : { ...ENGLISH_SYSTEM, PATH: `${cups.bin}:${process.env['PATH'] ?? ''}` },
    });
    const words = CATALOGUES[tag];
    try {
      await switchLanguage(window, tag);
      await closeActiveTab(window);
      for (const [width, height] of [
        [1440, 900],
        [860, 600],
      ] as const) {
        // The start screen has no .workspace for resizeWindow's panel-room wait.
        await app.evaluate(
          ({ BrowserWindow }, size) =>
            BrowserWindow.getAllWindows()[0]?.setContentSize(size[0], size[1]),
          [width, height] as const,
        );
        await expect
          .poll(() => window.evaluate(() => [innerWidth, innerHeight]))
          .toEqual([width, height]);
        await expect(window.getByTestId('start-screen')).toContainText(words.start.lede);
        await noHorizontalOverflow(window);
        await expectNoViolations(window, `${tag} start ${width}`);
        await capture(window, `${tag}-start-${width}`);
        await window.getByTestId('start-template').click();
        await expect(window.getByTestId('template-builtin:bifold-wallet')).toContainText(
          words.templates.bifoldWallet.name,
        );
        await expect(window.getByTestId('template-sort')).toHaveAccessibleName(
          words.templates.sortChosen.replace('{{sort}}', words.templates.sort.name),
        );
        await expect(window.getByTestId('template-sort')).toHaveText(
          words.templates.sortChosen.replace('{{sort}}', words.templates.sort.name),
        );
        await noHorizontalOverflow(window);
        await expectNoViolations(window, `${tag} templates ${width}`);
        await capture(window, `${tag}-templates-${width}`);
        if (width === 860) {
          const details = window.locator('.template-detail-body');
          await details.focus();
          await expect(details).toBeFocused();
          const choice = await window
            .getByTestId('template-list')
            .getAttribute('aria-activedescendant');
          if (choice === null) throw new Error('No chosen template');
          await window.keyboard.press('ArrowDown');
          await expect
            .poll(() => details.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
          await expect(window.getByTestId('template-list')).toHaveAttribute(
            'aria-activedescendant',
            choice,
          );
          await window.keyboard.press('End');
          await expect
            .poll(() => details.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
          await window.keyboard.press('Home');
          await expect.poll(() => details.evaluate((element) => element.scrollTop)).toBe(0);
        }
        await window.keyboard.press('Escape');
      }
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      }, project);
      await window.getByTestId('start-open').click();
      await expect(window.getByTestId('part-count')).toHaveText('3');
      await window.keyboard.press('ControlOrMeta+Shift+s');
      await expect(window.getByTestId('save-state')).toContainText(words.projectBar.saved);
      expect(loadProject(readFileSync(project)).project).toEqual(loadProject(original).project);

      // Open starts in Select (Q41); inspect drawing controls with a drawing tool.
      await window.getByTestId('tool-rectangle').click();
      for (const [width, height] of [
        [1440, 900],
        [860, 600],
      ] as const) {
        await resizeWindow(app, window, width, height);
        await noHorizontalOverflow(window);
        if (width === 860) {
          const modes = window.getByTestId('draw-as-select');
          await expect(modes).toBeVisible();
          await expect(modes.locator('option')).toHaveText([
            words.drawMode.outline,
            words.drawMode['stitch-allowance'],
            words.drawMode['cut-out'],
            words.drawMode.stitch,
            words.drawMode.fold,
            words.drawMode.marking,
          ]);
          await modes.selectOption('marking');
          await expect(modes).toHaveValue('marking');
          await modes.selectOption('outline');
        }
        await capture(window, `${tag}-design-${width}`);
        await window.getByTestId('settings').click();
        for (const section of [
          'general',
          'appearance',
          'tools',
          'shortcuts',
          'language',
          'updates',
        ]) {
          await window.getByTestId(`settings-tab-${section}`).click();
          await noHorizontalOverflow(window);
          await expectNoViolations(window, `${tag} settings ${section} ${width}`);
          await capture(window, `${tag}-settings-${section}-${width}`);
        }
        await window.getByTestId('settings-close').click();
        await window.getByTestId('export-more').click();
        await window.getByTestId('export-svg').click();
        await expect(window.getByTestId('export-dialog')).toContainText(
          words.exportDialog.intents['laser-cut'].name,
        );
        await noHorizontalOverflow(window);
        await expectNoViolations(window, `${tag} export ${width}`);
        await capture(window, `${tag}-export-${width}`);
        await window.keyboard.press('Escape');
        await window.getByTestId('print').click();
        const preview = window.getByTestId('print-preview');
        await expect(preview.locator('canvas').first()).toBeVisible();
        await expect(preview).toContainText(words.printPreview.measure);
        await noHorizontalOverflow(window);
        await expectNoViolations(window, `${tag} print ${width}`);
        await capture(window, `${tag}-print-${width}`);
        if (process.platform === 'win32') {
          // No CUPS on Windows (main/printing.ts): the preview says so and
          // saves a PDF instead, so there is no printer to calibrate.
          await expect(preview.getByTestId('print-unavailable')).toHaveText(
            words.printPreview.unavailable.platform,
          );
          await expect(preview.getByTestId('print-calibrate')).toHaveCount(0);
          await window.keyboard.press('Escape');
          await expect(preview).toHaveCount(0);
          continue;
        }
        await preview.getByTestId('print-calibrate').click();
        const calibration = preview.getByTestId('calibration');
        const across = calibration.getByLabel(
          words.calibration.horizontal.replace('{{length}}', '190'),
        );
        const along = calibration.getByLabel(
          words.calibration.vertical.replace('{{length}}', '200'),
        );
        await across.fill('189,05');
        await across.press('Enter');
        await along.fill('200,25');
        await along.press('Enter');
        // All translated locales use a decimal comma in percentage adjustments.
        await expect(calibration.getByTestId('calibration-result')).toContainText('+0,50');
        await expect(calibration.getByTestId('calibration-result')).toContainText('-0,12');
        await noHorizontalOverflow(window);
        await expectNoViolations(window, `${tag} calibration ${width}`);
        await capture(window, `${tag}-calibration-${width}`);
        await calibration.getByTestId('calibration-save').click();
        await expect(preview.getByTestId('print-corrected')).toContainText('+0,50');
        await expect(preview.getByTestId('print-corrected')).toContainText('-0,12');
        await expect(preview.getByTestId('print-calibrate')).toBeFocused();
        await preview.getByTestId('print-calibrate').click();
        await window.keyboard.press('Escape');
        await expect(preview.getByTestId('print-calibrate')).toBeFocused();
        await window.keyboard.press('Escape');
        await expect(preview).toHaveCount(0);
      }
      // A real edit asks the localized destructive-action question; cancel retains the work.
      await drawAPanel(window);
      await window.getByTestId('settings').click();
      await window.getByTestId('setting-keep-unsaved').uncheck();
      await window.getByTestId('settings-close').click();
      await window.keyboard.press('ControlOrMeta+w');
      await expect(window.getByTestId('unsaved-dialog')).toContainText(
        words.unsaved.consequence.close,
      );
      await expectNoViolations(window, `${tag} unsaved changes`);
      await capture(window, `${tag}-unsaved`);
      await window.getByTestId('unsaved-cancel').click();
      expect(loadProject(readFileSync(project)).project).toEqual(loadProject(original).project);
    } finally {
      await closeApp(app);
    }
  });

  test(`${tag} explains guides, alignment and an actual geometry diagnostic`, async () => {
    const { app, window } = await openApp({ size: [1440, 900], env: ENGLISH_SYSTEM });
    const words = CATALOGUES[tag];
    try {
      await switchLanguage(window, tag);
      await window.getByTestId('tool-guide').click();
      await window.getByTestId('guide-add-horizontal').click();
      const angle = window.getByLabel(words.guides.angle);
      await angle.fill('45');
      await angle.press('Enter');
      await expect(angle).toHaveValue('45');
      await expectNoViolations(window, `${tag} guides`);
      await capture(window, `${tag}-guides`);
      for (const left of [60, 240, 420]) await drawAPanel(window, { left });
      const box = await window.getByTestId('editor-canvas').boundingBox();
      if (box === null) throw new Error('Canvas missing');
      await window.getByTestId('tool-select').click();
      await window.mouse.move(box.x + 40, box.y + 120);
      await window.mouse.down();
      await window.mouse.move(box.x + 600, box.y + 320, { steps: 5 });
      await window.mouse.up();
      await expect(window.getByTestId('arrange-panel')).toContainText(words.arrange.title);
      await window.getByTestId('arrange-y-max').click();
      await noHorizontalOverflow(window);
      await capture(window, `${tag}-alignment`);
      const outline = window
        .getByTestId('parts-list')
        .locator('[data-testid^="feature-row-"]')
        .first();
      await outline.click();
      await window.getByTestId('add-stitch-line').click();
      await outline.click();
      const width = window.getByTestId('property-panel').getByLabel(words.editor.width);
      await width.fill('1');
      await width.press('Enter');
      await window.getByTestId('problems-toggle').click();
      await expect(window.getByTestId('problems-panel')).toContainText(
        words.problems.OFFSET_COLLAPSED.title,
      );
      await expectNoViolations(window, `${tag} diagnostic`);
      await capture(window, `${tag}-diagnostic`);
      await resizeWindow(app, window, 860, 600);
      await noHorizontalOverflow(window);
      await capture(window, `${tag}-diagnostic-860`);
    } finally {
      await closeApp(app);
    }
  });

  test(`${tag} offers crash recovery in the saved interface language`, async () => {
    const config = mkdtempSync(join(tmpdir(), 'leathercad-locale-recovery-'));
    const state = freshStateHome();
    const options = {
      state,
      env: { ...ENGLISH_SYSTEM, XDG_CONFIG_HOME: config, LEATHERCAD_RECOVERY_INTERVAL_MS: '250' },
    };
    const first = await openApp(options);
    try {
      await switchLanguage(first.window, tag);
      await drawAPanel(first.window);
      await expect.poll(() => recoveryCopies(state).length).toBe(1);
      await crashApp(first.app);
    } finally {
      await closeApp(first.app);
    }
    const second = await openApp(options);
    try {
      await expect(second.window.getByTestId('recovery-dialog')).toContainText(
        CATALOGUES[tag].recovery.title,
      );
      for (const [width, height] of [
        [1440, 900],
        [860, 600],
      ] as const) {
        await resizeWindow(second.app, second.window, width, height);
        await noHorizontalOverflow(second.window);
        await expectNoViolations(second.window, `${tag} recovery ${width}`);
        await capture(second.window, `${tag}-recovery-${width}`);
      }
      await second.window.getByTestId('recovery-recover').click();
      await expect(second.window.getByTestId('part-count')).toHaveText('1');
    } finally {
      await closeApp(second.app);
    }
  });
}
