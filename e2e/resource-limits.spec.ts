import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { emptyDocument, rectShape, rectanglePart } from '../packages/document/src/index.js';
import { saveProject } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { drawAPanel, freshStateHome, recoveryDir, openApp } from './launchApp.js';
import { fromProjectMenu, renameProject } from './projectMenu.js';

test('an excessive project is refused and the unsaved project and its undo history stay (PERF-012)', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lc-resource-'));
  const file = join(directory, 'large.lcp');
  const project = {
    ...emptyDocument('large').project,
    parts: [
      rectanglePart('part', 'outline', 'Large panel', rectShape({ x: 0, y: 0 }, 100_000, 100_000)),
    ],
  };
  writeFileSync(
    file,
    saveProject(project, {
      applicationVersion: '1.5.0',
      now: () => new Date('2026-01-01T00:00:00Z'),
    }),
  );
  const { app, window } = await openApp();
  const errors: string[] = [];
  window.on('pageerror', (error) => errors.push(error.message));
  try {
    await drawAPanel(window, { parts: '1' });
    await renameProject(window, 'Keep my work');
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('file-error')).toContainText('Too many sheets');
    await expect(window.getByTestId('file-error')).toContainText('sheets');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(1);
    await expect(window.getByTestId('save-state')).toHaveText('Unsaved changes');
    await expect(window.getByTestId('undo')).toBeEnabled();
    await window.screenshot({ path: test.info().outputPath('resource-refusal.png') });
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('tab-strip').getByRole('tab')).not.toContainText(
      'Keep my work',
    );
    expect(errors).toEqual([]);
  } finally {
    await closeApp(app);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an excessive size edit leaves the last accepted size and undo intact (PERF-012)', async () => {
  const { app, window } = await openApp();
  const errors: string[] = [];
  window.on('pageerror', (error) => errors.push(error.message));
  try {
    await drawAPanel(window, { parts: '1' });
    const height = window.getByTestId('property-panel').getByLabel('Height');
    await height.fill('1000');
    await height.press('Enter');
    const width = window.getByTestId('property-panel').getByLabel('Width');
    const original = await width.inputValue();
    await width.fill('100000');
    await width.press('Enter');
    await expect(window.getByTestId('file-error')).toContainText('Too many sheets');
    await width.press('Escape');
    await expect(width).toHaveValue(original);
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('undo').click();
    await expect(height).not.toHaveValue('1000');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    expect(errors).toEqual([]);
  } finally {
    await closeApp(app);
  }
});

test('a refused recovery keeps its offer and the only copy on disk (PERF-012)', async () => {
  const state = freshStateHome();
  mkdirSync(recoveryDir(state), { recursive: true });
  const file = join(recoveryDir(state), '999999-1.lcp');
  const project = {
    ...emptyDocument('large').project,
    parts: [
      rectanglePart('part', 'outline', 'Large panel', rectShape({ x: 0, y: 0 }, 100_000, 100_000)),
    ],
  };
  writeFileSync(
    file,
    saveProject(project, {
      applicationVersion: '1.5.0',
      now: () => new Date('2026-01-01T00:00:00Z'),
    }),
  );
  const { app, window } = await openApp({ state });
  try {
    const dialog = window.getByTestId('recovery-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('recovery-recover').click();
    await expect(dialog.getByRole('alert')).toContainText('Too many sheets');
    await expect(dialog).toBeVisible();
    expect(existsSync(file)).toBe(true);
    await dialog.getByTestId('recovery-decline').click();
    await expect(dialog).toHaveCount(0);
    await closeApp(app);
    expect(existsSync(file)).toBe(true);
  } finally {
    await closeApp(app);
    rmSync(state, { recursive: true, force: true });
  }
});

test('a resource-limited recovery file stays available after dismissing it (PERF-012)', async () => {
  const state = freshStateHome();
  mkdirSync(recoveryDir(state), { recursive: true });
  const file = join(recoveryDir(state), '999999-1.lcp');
  const bytes = saveProject(emptyDocument('large').project, {
    applicationVersion: '1.5.0',
    now: () => new Date('2026-01-01T00:00:00Z'),
  });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i <= bytes.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 64 * 1024 * 1024, true);
      break;
    }
  }
  writeFileSync(file, bytes);
  const { app, window } = await openApp({ state });
  try {
    const dialog = window.getByTestId('recovery-dialog');
    await expect(dialog.getByRole('alert')).toContainText('Too many');
    await expect(dialog.getByTestId('recovery-recover')).toBeDisabled();
    await expect(dialog.getByTestId('recovery-decline')).toBeFocused();
    await dialog.getByTestId('recovery-decline').click();
    await expect(dialog).toHaveCount(0);
    await closeApp(app);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.corrupt`)).toBe(false);
  } finally {
    await closeApp(app);
    rmSync(state, { recursive: true, force: true });
  }
});
