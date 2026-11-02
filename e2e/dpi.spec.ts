import { createHash } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { readoutAt } from './cursorReadout.js';
import { openApp, openSample } from './launchApp.js';
import { inkOn } from './printTest.js';

/**
 * CDP changes the real DPR/query results, keeping CSS layout fixed. This
 * Chromium build does not deliver resolution change events for its override,
 * so the browser boundary supplies that notification explicitly. Native monitor
 * migration remains a manual check; canvas painting and PDF rendering are real.
 */
async function densityEmulator(window: Page): Promise<(dpr: number) => Promise<void>> {
  const session = await window.context().newCDPSession(window);
  const queries = await window.evaluateHandle(() => {
    const queries = new Set<MediaQueryList>();
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const list = matchMedia(query);
      if (query.startsWith('(resolution:')) queries.add(list);
      return list;
    };
    return queries;
  });
  return async (dpr) => {
    await session.send('Emulation.setDeviceMetricsOverride', {
      ...(await window.evaluate(() => ({ width: innerWidth, height: innerHeight }))),
      deviceScaleFactor: dpr,
      mobile: false,
    });
    await expect.poll(() => window.evaluate(() => devicePixelRatio)).toBe(dpr);
    await queries.evaluate((lists) => {
      // Snapshot: listeners re-arm by creating another query during dispatch.
      for (const list of [...lists]) list.dispatchEvent(new Event('change'));
    });
  };
}

test('DPI-only changes resize both board cameras without moving millimetres or zoom', async () => {
  const { app, window } = await openApp({
    size: [1600, 1000],
    args: [
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
    ],
  });
  const emulateDensity = await densityEmulator(window);
  try {
    await openSample(window);
    await window.evaluate(() => document.fonts.ready);
    await window.getByTestId('tool-select').click();
    await window.keyboard.press('ControlOrMeta+0');
    await expect(window.getByTestId('zoom-level')).toHaveText('100 %');
    await test.info().attach('runtime', {
      body: JSON.stringify(await app.evaluate(() => process.versions)),
      contentType: 'application/json',
    });
    const canvas = window.getByTestId('editor-canvas');
    const box = (await canvas.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const coordinates = (text: string) =>
      text
        .replace('−', '-')
        .match(/-?\d+\.\d+/g)
        ?.map(Number) ?? [];
    const readout = coordinates(await readoutAt(window, point.x, point.y));
    const pixels = new Map<number, string>();
    // Initialise the second camera before changing density, then return to Design.
    await window.getByTestId('view-sheets').click();
    const sheetsZoom = await window.getByTestId('zoom-level').textContent();
    await window.getByTestId('view-design').click();

    for (const dpr of [1, 2, 1.25, 2, 1]) {
      await emulateDensity(dpr);
      await expect.poll(() => canvas.evaluate((c) => c.width)).toBe(Math.round(box.width * dpr));
      await expect.poll(() => canvas.evaluate((c) => c.height)).toBe(Math.round(box.height * dpr));
      expect(await canvas.boundingBox()).toEqual(box);
      await expect(window.getByTestId('zoom-level')).toHaveText('100 %');
      const next = coordinates(await readoutAt(window, point.x, point.y));
      expect(next).toHaveLength(2);
      for (const [axis, value] of next.entries()) {
        // Fractional backing dimensions and OS pointer events round to device
        // pixels. Their combined rounding must stay within one device pixel.
        expect(Math.abs(value - (readout[axis] ?? NaN))).toBeLessThan(1 / (dpr * (96 / 25.4)));
      }
      await window.getByTestId('status-bar').hover();
      await window.getByTestId('view-sheets').click();
      await expect(window.getByTestId('zoom-level')).toHaveText(sheetsZoom ?? '');
      await window.getByTestId('view-design').click();
      const hash = createHash('sha256')
        .update(await canvas.evaluate((c) => c.toDataURL()))
        .digest('hex');
      const previous = pixels.get(dpr);
      if (previous === undefined) pixels.set(dpr, hash);
      else expect(hash, `pattern and rulers at DPR ${dpr}`).toBe(previous);
    }
  } finally {
    await closeApp(app);
  }
});

test('DPI-only changes redraw the PDF preview and visible thumbnails at the new density', async () => {
  const { app, window } = await openApp({
    args: [
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
    ],
  });
  const emulateDensity = await densityEmulator(window);
  try {
    await openSample(window);
    await emulateDensity(2);
    await window.getByTestId('print').click();
    const page = window.getByTestId('print-page').locator('canvas');
    await expect(page).toBeVisible();
    const thumb = window.getByTestId('print-thumb').first().locator('canvas');
    for (const dpr of [2, 1, 1.25, 2, 1]) {
      await emulateDensity(dpr);
      await expect.poll(() => page.evaluate((c) => c.width)).toBe(Math.round(520 * dpr));
      await expect.poll(() => thumb.evaluate((c) => c.width)).toBe(Math.round(96 * dpr));
      await expect.poll(() => page.evaluate(inkOn)).toBeGreaterThan(1000);
      await expect.poll(() => thumb.evaluate(inkOn)).toBeGreaterThan(0);
    }
    await window
      .getByTestId('print-preview')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    // Unmounting the preview must leave no density listener that touches a gone PDF.
    await emulateDensity(2);
  } finally {
    await closeApp(app);
  }
});
