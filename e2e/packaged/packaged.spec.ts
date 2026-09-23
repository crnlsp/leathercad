import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { closeApp } from '../closeApp.js';

/**
 * The packaged app, not the development build.
 *
 * The E2E suite drives `apps/desktop/out` through the `electron` package. A
 * user runs something else: an asar archive inside a fused binary, with
 * resources resolved from a different place. Bugs that live only there — a
 * font path that works from out/ and not from app.asar, a file:// fetch the
 * fuses now forbid — are invisible to the suite. This test is where they show.
 *
 * It is a smoke test on purpose: the app starts, renders in its own typeface,
 * reaches the main process, and writes a PDF. Behaviour is the E2E suite's job.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../../apps/desktop');
const EXECUTABLE = resolve(DESKTOP_DIR, 'release/linux-unpacked/leathercad');
const VERSION = (
  JSON.parse(readFileSync(resolve(DESKTOP_DIR, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

let app: ElectronApplication;

test.beforeAll(async () => {
  expect(existsSync(EXECUTABLE), `no packaged app at ${EXECUTABLE} — run pnpm package:e2e`).toBe(
    true,
  );
  app = await electron.launch({ executablePath: EXECUTABLE, args: [] });
});

test.afterAll(async () => {
  await closeApp(app);
});

test('starts, and reports the packaged version through the bridge', async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window).toHaveTitle('LeatherCAD');
  await expect(window.getByTestId('bridge-error')).toHaveCount(0);
  await expect(window.getByTestId('app-version')).toContainText(VERSION);
});

test('runs from the asar archive, not from a loose directory', async () => {
  const appPath = await app.evaluate(({ app: electronApp }) => electronApp.getAppPath());
  expect(appPath).toMatch(/app\.asar$/);
});

test('renders in the vendored typeface, loaded from inside the archive', async () => {
  const window = await app.firstWindow();
  const loaded = await window.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.family.replace(/"/g, '') === 'IBM Plex Sans')
      .map((face) => `${face.weight}:${face.status}`);
  });
  // Regular is always in use; the heavier weights load when something asks
  // for them. None may have failed.
  expect(loaded).toContain('400:loaded');
  expect(loaded.filter((entry) => entry.endsWith(':error'))).toEqual([]);
});

test('draws a panel and writes it to a PDF', async () => {
  const window = await app.firstWindow();
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-packaged-'));
  const pdf = join(dir, 'panel.pdf');
  try {
    await app.evaluate(({ dialog, shell }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      // Do not launch a real PDF viewer during a test run.
      shell.openPath = async () => '';
    }, pdf);

    const box = await window.getByTestId('editor-canvas').boundingBox();
    expect(box).not.toBeNull();
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 200, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 400, box!.y + 330, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);

    // Independent of our own reader: poppler says it is an A4 PDF.
    const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    expect(info).toMatch(/Page size:\s+595\.276 x 841\.89 pts \(A4\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
