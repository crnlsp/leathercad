import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { emptyDocument, rectanglePart, rectShape } from '../packages/document/src/index.js';
import { saveProject } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { openApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

function problemFile(dir: string, name = 'Problems.lcp'): string {
  const panel = rectanglePart('panel', 'outline', 'Body panel', rectShape({ x: 0, y: 0 }, 100, 80));
  const file = join(dir, name);
  writeFileSync(
    file,
    saveProject(
      {
        ...emptyDocument('problems').project,
        parts: [
          {
            ...panel,
            features: [
              ...panel.features,
              {
                id: 'label',
                name: 'Small label',
                visible: true,
                locked: false,
                kind: 'text-label',
                source: {
                  kind: 'text',
                  text: '漢',
                  at: { x: 20, y: 20 },
                  sizeMm: 1,
                  rotationRad: 0,
                },
              },
              {
                id: 'stitch',
                name: 'Stitch line',
                visible: true,
                locked: false,
                kind: 'stitch-line',
                source: {
                  kind: 'derived',
                  sourceId: 'outline',
                  op: {
                    type: 'offset',
                    distanceMm: 60,
                    side: 'inward',
                    run: { kind: 'whole' },
                  },
                },
              },
              {
                id: 'holes',
                name: 'Stitch holes',
                visible: true,
                locked: false,
                kind: 'stitch-hole-set',
                source: {
                  kind: 'derived',
                  sourceId: 'stitch',
                  op: {
                    type: 'stitch-holes',
                    pitchMm: 3.85,
                    mode: 'fit-whole',
                    corners: 'continuous',
                  },
                },
              },
            ],
          },
          { id: 'empty', name: 'Empty pocket', quantity: 1, features: [] },
        ],
      },
      { applicationVersion: '1.6.0', now: () => new Date('2026-11-01T00:00:00Z') },
    ),
  );
  return file;
}

async function capture(app: ElectronApplication, window: Page, name: string): Promise<void> {
  // Native capture can still hold the preceding compositor frame after React
  // updated the DOM. Wait for the requested layout and its paint, not a timer.
  await window.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window === undefined) throw new Error('The app window is missing');
    return (await window.webContents.capturePage()).toPNG().toString('base64');
  });
  const path = test.info().outputPath(`${name}.png`);
  writeFileSync(path, Buffer.from(png, 'base64'));
  await test.info().attach(name, { path, contentType: 'image/png' });
}

test('F8 walks every problem, including two on one feature, without editing the document (9.15)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-9-15-'));
  const file = problemFile(dir);
  const before = readFileSync(file);
  const { app, window } = await openApp({ args: [file] });
  try {
    const panel = window.getByTestId('problems-panel');
    const rows = panel.getByTestId('problem-row');
    const current = panel.locator('[aria-current="true"]');
    await window.getByTestId('problems-toggle').click();
    await expect(rows).toHaveCount(5);
    await capture(app, window, 'problem-overview');
    await window.getByTestId('problems-toggle').click();
    await window.getByTestId('view-sheets').click();
    await expect(window.getByTestId('view-sheets')).toHaveClass(/\bactive\b/);
    await window.getByTestId('editor-canvas').focus();

    for (const code of [
      'TEXT_GLYPH_MISSING',
      'TEXT_TOO_SMALL_TO_PRINT',
      'OFFSET_COLLAPSED',
      'SOURCE_FAILED',
      'EMPTY_PART',
    ]) {
      await window.keyboard.press('F8');
      await expect(window.getByTestId('view-design')).toHaveClass(/\bactive\b/);
      await expect(current).toHaveAttribute('data-code', code);
      await expect(current).toBeFocused();
      await expect(current.locator('.problem-why')).not.toBeEmpty();
      await expect(current.locator('.problem-fix')).not.toBeEmpty();
      if (code.startsWith('TEXT_')) {
        await expect(window.getByTestId('label-text')).toHaveValue('漢');
        const local = window
          .getByTestId('property-panel')
          .locator(`[data-code="${code}"] .problem-message`);
        await expect(local).toHaveText(
          (await current.locator('.problem-message').textContent()) ?? '',
        );
      }
    }
    await expect(window.getByTestId('property-header')).toContainText('Empty pocket');
    await window.keyboard.press('F8');
    await expect(current).toHaveAttribute('data-code', 'TEXT_GLYPH_MISSING');
    await window.keyboard.press('Shift+F8');
    await expect(current).toHaveAttribute('data-code', 'EMPTY_PART');
    await window.keyboard.press('F8');
    await expect(current).toHaveAttribute('data-code', 'TEXT_GLYPH_MISSING');
    await expect(current).toBeFocused();
    await expect(window.getByTestId('label-text')).toHaveValue('漢');
    await capture(app, window, 'current-problem');
    const found = await new AxeBuilder({ page: window })
      .setLegacyMode(true)
      .include('[data-testid="problems-panel"]')
      .include('[data-testid="property-panel"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    expect(found.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ') ?? ''}`)).toEqual(
      [],
    );
    await expect(window.getByTestId('undo')).toBeDisabled();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    expect(readFileSync(file)).toEqual(before);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fixing a source updates navigation, including Undo, Redo and the next/previous buttons (9.15)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-9-15-'));
  const { app, window } = await openApp({ args: [problemFile(dir)] });
  try {
    const panel = window.getByTestId('problems-panel');
    const current = panel.locator('[aria-current="true"]');
    await window.getByTestId('editor-canvas').focus();
    for (let i = 0; i < 3; i++) await window.keyboard.press('F8');
    await expect(current).toHaveAttribute('data-code', 'OFFSET_COLLAPSED');
    const inset = window
      .getByTestId('property-panel')
      .locator('label', { hasText: /^Edge margin/ })
      .locator('input');
    await inset.fill('3.5');
    await inset.press('Enter');
    await expect(panel.getByTestId('problem-row')).toHaveCount(3);
    await expect(current).toHaveCount(0);
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('F8');
    await expect(current).toHaveAttribute('data-code', 'TEXT_GLYPH_MISSING');
    await panel.getByTestId('problem-previous').click();
    await expect(current).toHaveAttribute('data-code', 'EMPTY_PART');
    await window.getByTestId('undo').click();
    await expect(panel.getByTestId('problem-row')).toHaveCount(5);
    await panel.getByTestId('problem-next').click();
    await expect(current).toHaveAttribute('data-code', 'TEXT_GLYPH_MISSING');
    await window.getByTestId('redo').click();
    await expect(panel.getByTestId('problem-row')).toHaveCount(3);
    await panel.getByTestId('problem-next').click();
    await expect(current).toHaveAttribute('data-code', 'TEXT_TOO_SMALL_TO_PRINT');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(860, 600),
    );
    await expect(current).toBeInViewport();
    await expect(panel.getByTestId('problem-next')).toBeInViewport();
    await expect(current).toBeFocused();
    await capture(app, window, 'problems-minimum-window');
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('problem shortcuts rebind, leave fields and dialogs alone, and do not carry a cursor into another tab (9.15)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-9-15-'));
  const { app, window } = await openApp({ args: [problemFile(dir)] });
  try {
    const current = window.getByTestId('problems-panel').locator('[aria-current="true"]');
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('F8');
    await expect(current).toHaveAttribute('data-code', 'TEXT_GLYPH_MISSING');
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-shortcuts').click();
    await window.keyboard.press('F8');
    await expect(current).toHaveAttribute('data-code', 'TEXT_GLYPH_MISSING');
    await window.getByTestId('change-nextProblem').click();
    await window.keyboard.press('F7');
    await expect(window.getByTestId('shortcut-keys-nextProblem')).toHaveText('F7');
    await window.getByTestId('settings-close').click();
    await window.keyboard.press('F8');
    await expect(current).toHaveAttribute('data-code', 'TEXT_GLYPH_MISSING');
    await window.keyboard.press('F7');
    await expect(current).toHaveAttribute('data-code', 'TEXT_TOO_SMALL_TO_PRINT');
    await window.getByTestId('label-text').focus();
    await window.keyboard.press('F7');
    await expect(current).toHaveAttribute('data-code', 'TEXT_TOO_SMALL_TO_PRINT');
    await expect(window.getByTestId('label-text')).toHaveValue('漢');
    const second = problemFile(dir, 'Other problems.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, second);
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    await expect(current).toHaveCount(0);
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('Shift+F8');
    await expect(current).toHaveAttribute('data-code', 'EMPTY_PART');
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with no problems the navigation keys do not change the view or document (9.15)', async () => {
  const { app, window } = await openApp();
  try {
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('F8');
    await window.keyboard.press('Shift+F8');
    await expect(window.getByTestId('problems-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(window.getByTestId('problem-next')).toHaveCount(0);
    await expect(window.getByTestId('undo')).toBeDisabled();
  } finally {
    await closeApp(app);
  }
});
