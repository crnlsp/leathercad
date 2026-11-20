import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { openApp } from './launchApp.js';
import { openPrintTest } from './printTest.js';
import { resizeWindow } from './windowSize.js';

/**
 * U.24f: the export dialog re-inspected at the smallest window and a roomy one,
 * for SVG and DXF alike (PDF has no dialog). Every field is named from what it
 * shows, Tab stays inside the dialog and walks it in reading order, axe is
 * clean with Q43's overlap warning in place, the page size follows the layers
 * live, and the dialog and its Export button keep inside the window.
 */
for (const [width, height] of [
  [860, 600],
  [1440, 900],
] as const) {
  test(`the export dialogs are named, ordered, contained and axe-clean at ${width} × ${height}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-u24f-'));
    const { app, window } = await openApp();
    try {
      await openPrintTest(app, window, join(dir, 'x.svg'));
      await resizeWindow(app, window, width, height);
      for (const format of ['svg', 'dxf']) {
        await window.getByTestId('export-more').click();
        await window.getByTestId(`export-${format}`).click();
        const dialog = window.getByTestId('export-dialog');
        await expect(dialog).toHaveAccessibleName(`Export ${format.toUpperCase()}`);
        await expect(window.getByRole('group', { name: 'Export for' })).toBeVisible();
        await expect(window.getByRole('group', { name: 'Layers' })).toBeVisible();
        await expect(window.getByRole('radio', { name: /^Laser cut/ })).toBeVisible();
        await expect(window.getByRole('checkbox', { name: 'Cut outlines' })).toBeChecked();
        await expect(window.getByTestId('export-overlap')).toBeVisible();

        // Tab visits the chosen intent, the seven layers, Cancel, Export, then wraps.
        const visited: string[] = [];
        for (let i = 0; i < 11; i++) {
          visited.push(
            await window.evaluate(
              () => (document.activeElement as HTMLElement | null)?.dataset.testid ?? '',
            ),
          );
          await window.keyboard.press('Tab');
        }
        expect(visited).toEqual([
          'export-intent-template-print',
          'export-layer-cut',
          'export-layer-stitch',
          'export-layer-stitch-holes',
          'export-layer-fold',
          'export-layer-mark',
          'export-layer-hardware',
          'export-layer-annotation',
          'export-cancel',
          'export-go',
          'export-intent-template-print',
        ]);

        await window.getByTestId('export-go').focus();
        for (const id of ['export-dialog', 'export-go']) {
          const box = await window.getByTestId(id).boundingBox();
          expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
          expect((box?.y ?? height) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
        }

        const before = (await window.getByTestId('export-page').textContent()) ?? '';
        await window.getByTestId('export-layer-annotation').uncheck();
        await expect(window.getByTestId('export-page')).not.toHaveText(before);
        await window.getByTestId('export-layer-annotation').check();
        await expect(window.getByTestId('export-page')).toHaveText(before);

        const found = await new AxeBuilder({ page: window })
          .setLegacyMode(true)
          .include('[data-testid="export-dialog"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
          .analyze();
        expect(found.violations.map((v) => v.id)).toEqual([]);

        await window.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }
    } finally {
      await closeApp(app);
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
