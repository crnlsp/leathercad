import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { emptyDocument, rectanglePart, rectShape } from '../packages/document/src/index.js';
import { saveProject } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { openApp } from './launchApp.js';
import { readDxf, readSvg } from './vectorFiles.js';

for (const format of ['svg', 'dxf'] as const) {
  test(`${format}: names overlapping pieces before exporting, with an explicit override (Q43)`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leathercad-q43-'));
    const file = join(dir, 'Overlap.lcp');
    const target = join(dir, `Overlap.${format}`);
    const panel = (id: string, name: string, x: number, y: number, w: number, h: number) =>
      rectanglePart(id, `${id}-outline`, name, rectShape({ x, y }, w, h));
    const hidden = panel('hidden', 'Hidden lining', 0, 0, 120, 100);
    writeFileSync(
      file,
      saveProject(
        {
          ...emptyDocument('overlap').project,
          parts: [
            panel('body', 'Body panel', 0, 0, 120, 100),
            panel('flap', 'Crossing flap', 100, 70, 40, 40),
            panel('pocket', 'Nested pocket', 30, 30, 20, 20),
            panel('strap', 'Separate strap', 200, 0, 20, 80),
            { ...hidden, features: hidden.features.map((f) => ({ ...f, visible: false })) },
          ],
        },
        { applicationVersion: '1.6.0', now: () => new Date('2026-11-01T00:00:00Z') },
      ),
    );
    const { app, window } = await openApp({ args: [file] });
    try {
      await expect(window.getByTestId('part-count')).toHaveText('5');
      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      }, target);
      await window.getByTestId('export-more').click();
      await window.getByTestId(`export-${format}`).click();
      const warning = window.getByTestId('export-overlap');
      // Template print includes cut outlines too: the chosen roles decide.
      await expect(warning).toContainText('Body panel, Crossing flap, and Nested pocket');
      await expect(warning).not.toContainText('Separate strap');
      await expect(warning).not.toContainText('Hidden lining');
      await expect(window.getByTestId('export-go')).toHaveText('Export anyway…');
      expect(existsSync(target)).toBe(false);

      await window.getByTestId('export-intent-stitch-guide').check();
      await expect(warning).toHaveCount(0);
      await expect(window.getByTestId('export-go')).toHaveText('Export…');
      await window.getByTestId('export-layer-cut').check();
      await expect(window.getByTestId('export-custom')).toBeVisible();
      await expect(warning).toBeVisible();
      await window.getByTestId('export-intent-laser-cut').check();
      await expect(warning).toBeVisible();

      if (format === 'svg') {
        const found = await new AxeBuilder({ page: window })
          .setLegacyMode(true)
          .include('[data-testid="export-dialog"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
          .analyze();
        expect(found.violations.map((v) => v.id)).toEqual([]);
        const png = await app.evaluate(async ({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0];
          if (window === undefined) throw new Error('The app window is missing');
          return (await window.webContents.capturePage()).toPNG().toString('base64');
        });
        const screenshot = test.info().outputPath('overlap-warning.png');
        writeFileSync(screenshot, Buffer.from(png, 'base64'));
        await test.info().attach('overlap-warning', { path: screenshot, contentType: 'image/png' });
      }

      await window.getByTestId('export-cancel').click();
      await expect(window.getByTestId('export-dialog')).toHaveCount(0);
      expect(existsSync(target)).toBe(false);
      await window.getByTestId('export-more').click();
      await window.getByTestId(`export-${format}`).click();
      await expect(warning).toBeVisible();
      // The override remains available from the keyboard and writes all four
      // visible outlines: no automatic moving, clipping, or merging of cuts.
      await window.getByTestId('export-go').focus();
      await window.keyboard.press('Enter');
      await expect(window.getByTestId('export-dialog')).toHaveCount(0);
      await expect.poll(() => existsSync(target)).toBe(true);
      await expect(window.getByTestId('file-error')).toHaveCount(0);
      const written = format === 'svg' ? readSvg(target) : readDxf(target);
      expect(written.primitives).toHaveLength(16);
      expect(new Set(written.primitives.map((p) => p.layer))).toEqual(new Set(['cut']));
      // The three overlapping rectangles retain their original edge lengths.
      const lengths = written.primitives
        .map((p) => (p.kind === 'line' ? Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y) : 0))
        .sort((a, b) => a - b);
      expect(lengths).toEqual([20, 20, 20, 20, 20, 20, 40, 40, 40, 40, 80, 80, 100, 100, 120, 120]);
    } finally {
      await closeApp(app);
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
