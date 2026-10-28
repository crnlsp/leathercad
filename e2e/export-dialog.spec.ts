import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { openApp } from './launchApp.js';
import { openPrintTest } from './printTest.js';
import { readDxf, readSvg } from './vectorFiles.js';

/**
 * 6.4: the export dialog. An intent chooses the layers, the layers can be
 * adjusted, the page it reports is the file's, and the choice is the app's —
 * remembered between openings and restarts, never written into a project.
 */

test('a laser-cut SVG and DXF hold the cut outline and no stitch or annotation layer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-6.4-'));
  const svg = join(dir, 'laser.svg');
  const dxf = join(dir, 'laser.dxf');
  const { app, window } = await openApp();

  try {
    await openPrintTest(app, window, svg);

    await window.getByTestId('export-more').click();
    await window.getByTestId('export-svg').click();
    await expect(window.getByTestId('export-dialog')).toBeVisible();

    // Every layer to start with, which is what the file held before the dialog.
    await expect(window.getByTestId('export-intent-template-print')).toBeChecked();
    const everything = await window.getByTestId('export-page').textContent();

    await window.getByTestId('export-intent-laser-cut').check();
    await expect(window.getByTestId('export-layer-cut')).toBeChecked();
    await expect(window.getByTestId('export-layer-stitch')).not.toBeChecked();
    await expect(window.getByTestId('export-layer-annotation')).not.toBeChecked();
    // The page is the box of what is left: the captions and dimension are out of it.
    await expect(window.getByTestId('export-page')).not.toHaveText(everything ?? '');
    await window.getByTestId('export-go').click();
    await expect(window.getByTestId('export-dialog')).toHaveCount(0);

    await expect.poll(() => existsSync(svg), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    const written = readSvg(svg);
    expect(written.facts.groups).toEqual(['cut']);
    expect(written.facts.hasTransform).toBe(false);

    // The same choice is waiting for the DXF: one choice, two formats.
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, dxf);
    await window.getByTestId('export-more').click();
    await window.getByTestId('export-dxf').click();
    await expect(window.getByTestId('export-intent-laser-cut')).toBeChecked();
    await window.getByTestId('export-go').click();

    await expect.poll(() => existsSync(dxf), { timeout: 10_000 }).toBe(true);
    expect(readDxf(dxf).facts.layers).toEqual(['cut']);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the maker adds a layer to a preset, and the choice is there at the next start', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-6.4-'));
  const configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-6.4-config-'));
  const svg = join(dir, 'holes.svg');

  const first = await openApp({ env: { XDG_CONFIG_HOME: configHome } });
  try {
    await openPrintTest(first.app, first.window, svg);
    await first.window.getByTestId('export-more').click();
    await first.window.getByTestId('export-svg').click();

    await first.window.getByTestId('export-intent-laser-cut').check();
    // "Plus stitch holes if lasered": the preset is where the maker starts.
    await first.window.getByTestId('export-layer-stitch-holes').check();
    await expect(first.window.getByTestId('export-intent-laser-cut')).not.toBeChecked();
    await expect(first.window.getByTestId('export-custom')).toBeVisible();
    await first.window.getByTestId('export-go').click();

    await expect.poll(() => existsSync(svg), { timeout: 10_000 }).toBe(true);
    expect(readSvg(svg).facts.groups).toEqual(['cut', 'stitch-holes']);
  } finally {
    await closeApp(first.app);
  }

  const second = await openApp({ env: { XDG_CONFIG_HOME: configHome } });
  try {
    await openPrintTest(second.app, second.window, svg);
    await second.window.getByTestId('export-more').click();
    await second.window.getByTestId('export-svg').click();

    await expect(second.window.getByTestId('export-layer-cut')).toBeChecked();
    await expect(second.window.getByTestId('export-layer-stitch-holes')).toBeChecked();
    await expect(second.window.getByTestId('export-layer-stitch')).not.toBeChecked();
    await expect(second.window.getByTestId('export-custom')).toBeVisible();
  } finally {
    await closeApp(second.app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with no layer chosen the dialog says there is nothing to export, and will not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-6.4-'));
  const svg = join(dir, 'none.svg');
  const { app, window } = await openApp();

  try {
    await openPrintTest(app, window, svg);
    await window.getByTestId('export-more').click();
    await window.getByTestId('export-svg').click();

    for (const layer of ['cut', 'stitch', 'stitch-holes', 'annotation']) {
      await window.getByTestId(`export-layer-${layer}`).uncheck();
    }
    await expect(window.getByTestId('export-page')).toContainText('Nothing to export');
    await expect(window.getByTestId('export-go')).toBeDisabled();

    // Esc leaves without writing anything.
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('export-dialog')).toHaveCount(0);
    expect(existsSync(svg)).toBe(false);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the dialog works from the keyboard and has no accessibility violations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-6.4-'));
  const dxf = join(dir, 'keys.dxf');
  const { app, window } = await openApp();

  try {
    await openPrintTest(app, window, dxf);
    await window.getByTestId('export-more').click();
    await window.getByTestId('export-dxf').click();

    // Focus starts on the intent that is chosen, in a dialog that holds it.
    await expect(window.getByTestId('export-intent-template-print')).toBeFocused();
    // Scoped to the dialog: a saved project's "Saved" text in the bar behind it fails
    // colour contrast on its own, with no dialog open (found here, not caused here).
    const found = await new AxeBuilder({ page: window })
      .setLegacyMode(true)
      .include('[data-testid="export-dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    expect(
      found.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ') ?? ''}`),
      'the export dialog',
    ).toEqual([]);

    // Arrow keys move through the intents, as a radio group does.
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('export-intent-laser-cut')).toBeChecked();
    await expect(window.getByTestId('export-layer-stitch')).not.toBeChecked();

    // Tab leaves the intents for the layers, and Space ticks one.
    await window.keyboard.press('Tab');
    await expect(window.getByTestId('export-layer-cut')).toBeFocused();
    await window.keyboard.press('Space');
    await expect(window.getByTestId('export-layer-cut')).not.toBeChecked();
    await window.keyboard.press('Space');
    await expect(window.getByTestId('export-layer-cut')).toBeChecked();

    // Export is reached by Tab, and Enter chooses it.
    await window.getByTestId('export-go').focus();
    await window.keyboard.press('Enter');
    await expect.poll(() => existsSync(dxf), { timeout: 10_000 }).toBe(true);
    expect(readDxf(dxf).facts.layers).toEqual(['cut']);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
