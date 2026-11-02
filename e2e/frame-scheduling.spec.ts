import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { installFrameCounter } from './frameCount.js';
import { openApp, openSample } from './launchApp.js';
import { nextFrame } from './renderCount.js';
import { resizeWindow } from './windowSize.js';

test('Design and Sheets stop scheduling frames once the board is idle (PERF-014)', async () => {
  const { app, window } = await openApp({
    args: ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  try {
    await openSample(window);
    await window.evaluate(() => document.fonts.ready);
    const counts = await installFrameCounter(window);
    for (const view of ['design', 'sheets']) {
      await window.getByTestId(`view-${view}`).click();
      await window.getByTestId('status-bar').hover();
      await nextFrame(window);
      await counts.evaluate((c) => {
        c.callbacks = 0;
        c.paints = 0;
      });
      // A negative assertion: observe an idle interval without requesting any
      // animation frames from the test itself.
      await window.waitForTimeout(250);
      expect(await counts.evaluate((c) => ({ ...c }))).toEqual({ callbacks: 0, paints: 0 });
    }
  } finally {
    await closeApp(app);
  }
});

test('an idle board wakes for tools, pointers, typed drafts, history, camera and resize', async () => {
  const { app, window } = await openApp({ size: [1600, 1000] });
  try {
    await window.evaluate(() => document.fonts.ready);
    // A new project starts with Rectangle. Change away first so the measured
    // click really activates a different tool, on every platform.
    await window.getByTestId('tool-select').click();
    const counts = await installFrameCounter(window);
    const repaints = async (action: () => Promise<unknown>) => {
      await nextFrame(window);
      const before = await counts.evaluate((c) => c.paints);
      await action();
      await expect.poll(() => counts.evaluate((c) => c.paints)).toBeGreaterThan(before);
    };
    await repaints(() => window.getByTestId('tool-rectangle').click());
    const canvas = window.getByTestId('editor-canvas');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('The drawing board is not visible');
    const corner = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.6 };
    await repaints(() => window.mouse.move(corner.x, corner.y));
    await repaints(() => window.mouse.click(corner.x, corner.y));
    await repaints(() => window.mouse.move(corner.x + 120, corner.y - 80));
    const width = window.getByTestId('value-chip-width').locator('input');
    const height = window.getByTestId('value-chip-height').locator('input');
    await width.fill('40');
    // Tab applies a draft size without dispatching a document command.
    await repaints(() => width.press('Tab'));
    await expect(window.getByTestId('drawing-width')).toHaveText('40.0 mm');
    await height.fill('25');
    await repaints(() => height.press('Enter'));
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await repaints(() => window.keyboard.press('ControlOrMeta+z'));
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await repaints(() => window.keyboard.press('ControlOrMeta+Shift+z'));
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await canvas.focus();
    await repaints(() => window.keyboard.press('ControlOrMeta+Equal'));
    await repaints(() => resizeWindow(app, window, 1440, 900));
    await repaints(() => window.getByTestId('view-sheets').click());
    await repaints(() => window.getByTestId('view-design').click());
    await window.getByTestId('tool-rectangle').click();
    await canvas.focus();
    await window.keyboard.type('10');
    await expect(window.getByTestId('value-chip-hint')).toBeVisible();
    await repaints(() => window.keyboard.press('Escape'));
    await expect(window.getByTestId('part-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});

test('Sheets row hover and language changes repaint without a board pointer or document edit', async () => {
  const { app, window } = await openApp();
  try {
    await openSample(window);
    await window.evaluate(() => document.fonts.ready);
    const counts = await installFrameCounter(window);
    await window.getByTestId('view-sheets').click();
    await window.getByTestId('status-bar').hover();
    await nextFrame(window);
    const beforeHover = await counts.evaluate((c) => c.paints);
    await window.getByTestId('sheets-parts').locator('.sheets-piece').first().hover();
    await expect.poll(() => counts.evaluate((c) => c.paints)).toBeGreaterThan(beforeHover);
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-language').click();
    await nextFrame(window);
    const beforeLanguage = await counts.evaluate((c) => c.paints);
    await window.getByTestId('setting-language').selectOption('en');
    await expect.poll(() => counts.evaluate((c) => c.paints)).toBeGreaterThan(beforeLanguage);
  } finally {
    await closeApp(app);
  }
});
