import { resolve } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

/**
 * What the app looks like, pixel for pixel. See docs/testing.md §5.2.
 *
 * Kept to scenes whose failure would be a raster problem the SVG snapshots
 * cannot see: hairlines, hole markers, the grid, and the panels' type. Run
 * with `pnpm test:visual`, which pins the container these references were
 * taken in. Update them with `pnpm test:visual --update-snapshots`, and look
 * at every changed image before committing it.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../../apps/desktop');

/** The content size every reference is taken at, whatever the display. */
const SIZE = { width: 1280, height: 800 };

async function launch(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [
      '.',
      // One device pixel per CSS pixel. A HiDPI display would otherwise
      // double every reference.
      '--force-device-scale-factor=1',
      // Chromium's own sandbox needs user namespaces, which Docker's default
      // seccomp profile withholds. The renderer's sandbox (webPreferences)
      // is unaffected.
      ...(process.env['LEATHERCAD_IN_CONTAINER'] === '1' ? ['--no-sandbox'] : []),
    ],
    cwd: DESKTOP_DIR,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  await app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, SIZE);
  await expect.poll(() => window.evaluate(() => window.innerWidth)).toBe(SIZE.width);
  return { app, window };
}

/**
 * The version changes on every release. Masking it is not enough: the mask
 * is as wide as the text, and the status bar after it moves with it. So it is
 * blanked at a fixed width. Injected into the page, because the screenshot
 * `style` option does not reach an Electron window.
 */
async function blankVersion(window: Page): Promise<void> {
  await window.addStyleTag({
    content:
      '[data-testid="app-version"] { display: inline-block; width: 4em; visibility: hidden; }',
  });
}

/**
 * The pointer somewhere known. Xvfb starts it wherever it likes, and over the
 * canvas the readout shows coordinates instead of dashes. The first CI run
 * failed on exactly that. Enter the canvas and leave it, so the readout is
 * back to its resting state.
 */
async function pointerAway(window: Page): Promise<void> {
  const box = await window.getByTestId('editor-canvas').boundingBox();
  expect(box).not.toBeNull();
  await window.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await window.mouse.move(0, 0);
  await expect(window.getByTestId('cursor-readout')).toHaveText('— , —');
}

test('the empty window', async () => {
  const { app, window } = await launch();
  try {
    await pointerAway(window);
    await blankVersion(window);
    await expect(window).toHaveScreenshot('empty-window.png');
  } finally {
    await app.close();
  }
});

test('a stitched panel on the canvas', async () => {
  const { app, window } = await launch();
  try {
    const canvas = window.getByTestId('editor-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 550, box!.y + 400, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-line').click();
    await panel.getByTestId('add-stitch-holes').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');

    // Nothing selected and the pointer off the canvas, so the picture is the
    // drawing and not the interaction with it.
    await window.getByTestId('tool-select').click();
    await window.mouse.click(box!.x + 700, box!.y + 600);
    await expect(window.getByTestId('selected-count')).toHaveText('0');
    await pointerAway(window);

    await expect(canvas).toHaveScreenshot('stitched-panel.png');
  } finally {
    await app.close();
  }
});
