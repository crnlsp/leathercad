import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import {
  addPart,
  addSeam,
  addStitchHoles,
  addStitchLine,
  emptyDocument,
  rectShape,
  shapePart,
} from '../packages/document/src/index.js';
import { loadProject, saveProject } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

test('a loaded seam is listed before deleting its holes, removed on consent and restored by undo (9.6a)', async () => {
  let document = emptyDocument('seam-project', 'Sewn panel');
  document = addPart(
    shapePart('panel', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, 100, 60)),
  ).apply(document);
  document = addStitchLine('panel', 'line', 'outline', 3).apply(document);
  document = addStitchHoles('panel', 'holes', 'line').apply(document);
  document = addSeam({
    id: 'seam',
    a: { holeSetId: 'holes', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
    b: { holeSetId: 'holes', stretch: { kind: 'from', anchor: 3, toward: 'previous' } },
  }).apply(document);
  const path = join(mkdtempSync(join(tmpdir(), 'leathercad-seam-')), 'Sewn panel.lcp');
  writeFileSync(
    path,
    saveProject(document.project, {
      applicationVersion: '1.7.0',
      now: () => new Date('2026-11-10T00:00:00Z'),
    }),
  );
  const { app, window } = await openApp({ args: [path] });
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, path);
    await expect(window.getByTestId('feature-count')).toHaveText('3');
    await window.getByTestId('parts-list').getByText('Stitch holes', { exact: true }).click();
    await window.getByTestId('delete-feature').click();
    const dialog = window.getByTestId('delete-dialog');
    await expect(dialog).toContainText('Seams');
    await expect(dialog).toContainText('Panel · Panel');
    await expectNoViolations(window, 'delete a seam with its holes');
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window === undefined) throw new Error('The app window is missing');
      return (await window.webContents.capturePage()).toPNG().toString('base64');
    });
    const screenshot = test.info().outputPath('seam-delete.png');
    writeFileSync(screenshot, Buffer.from(png, 'base64'));
    await test.info().attach('seam-delete', { path: screenshot, contentType: 'image/png' });
    await dialog.getByTestId('delete-cancel').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');
    await window.getByTestId('delete-feature').click();
    await dialog.getByTestId('delete-all').click();
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    expect(loadProject(readFileSync(path)).project.seams).toEqual([]);
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    expect(loadProject(readFileSync(path)).project.seams).toEqual(document.project.seams);
  } finally {
    await closeApp(app);
  }
});
