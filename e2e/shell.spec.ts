import { resolve } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

let app: ElectronApplication;

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
});

test.afterAll(async () => {
  await app?.close();
});

test('opens a window titled LeatherCAD', async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  await expect(window).toHaveTitle('LeatherCAD');
});

test('reaches the main process through the platform bridge', async () => {
  const window = await app.firstWindow();

  // Proves preload → IPC → main → back. A version rendered here means the whole
  // PlatformHost boundary is wired, not just that the window opened.
  await expect(window.getByTestId('bridge-error')).toHaveCount(0);
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
});

test('puts user config in ~/.config/leathercad, not the npm package name', async () => {
  // Electron would otherwise derive this from the package name and produce
  // ~/.config/@leathercad/desktop. See docs/file-format.md §6.
  const configDir = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));

  expect(configDir.endsWith('/leathercad')).toBe(true);
});

test('sizes the canvas backing store to CSS size times device pixel ratio', async () => {
  const window = await app.firstWindow();
  const canvas = window.getByTestId('editor-canvas');
  await expect(canvas).toBeVisible();

  const { cssWidth, backingWidth, dpr } = await canvas.evaluate((element) => {
    const c = element as HTMLCanvasElement;
    return {
      cssWidth: c.getBoundingClientRect().width,
      backingWidth: c.width,
      dpr: window.devicePixelRatio,
    };
  });

  expect(dpr).toBeGreaterThan(0);
  expect(cssWidth).toBeGreaterThan(0);
  // Blurry canvases and DPR-scaled coordinate drift both start here.
  expect(backingWidth).toBe(Math.round(cssWidth * dpr));
});

test('denies in-page navigation away from the app', async () => {
  const window = await app.firstWindow();

  const before = window.url();
  await window.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com';
    document.body.append(anchor);
    anchor.click();
  });
  await window.waitForTimeout(300);

  expect(window.url()).toBe(before);
});
