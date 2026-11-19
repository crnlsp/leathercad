import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { boardMap } from '../boardMap.js';
import { closeApp } from '../closeApp.js';
import { fromProjectMenu } from '../projectMenu.js';
import { drawAPanel, freshStateHome } from '../launchApp.js';
import { chooseSvg } from '../svgPatterns.js';

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
    // Homes of its own, as every e2e launch has: the container's HOME is
    // shared, so a scene that opened a project left a session the next launch
    // reopened, past the start screen.
    env: {
      ...process.env,
      XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-visual-')),
      XDG_STATE_HOME: freshStateHome(),
    },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  // The app starts on its start screen (8.12); the pictures are of a project.
  await window.getByTestId('start-new').click();
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
    await closeApp(app);
  }
});

test('a diagonal construction guide and its exact controls', async () => {
  const { app, window } = await launch();
  try {
    await window.getByTestId('tool-guide').click();
    await window.getByTestId('guide-add-horizontal').click();
    for (const [label, value] of [
      ['Guide x', '60'],
      ['Guide y', '40'],
      ['Guide angle', '45'],
    ]) {
      if (label === undefined || value === undefined) throw new Error('missing guide field');
      await window.getByLabel(label).fill(value);
      await window.getByLabel(label).press('Enter');
    }
    await pointerAway(window);
    await blankVersion(window);
    await expect(window).toHaveScreenshot('diagonal-guide.png');
  } finally {
    await closeApp(app);
  }
});

test('the arrangement controls for independent pieces', async () => {
  const { app, window } = await launch();
  try {
    for (const left of [60, 240, 420]) await drawAPanel(window, { left });
    const box = await window.getByTestId('editor-canvas').boundingBox();
    if (box === null) throw new Error('canvas is missing');
    await window.getByTestId('tool-select').click();
    await window.mouse.move(box.x + 40, box.y + 120);
    await window.mouse.down();
    await window.mouse.move(box.x + 600, box.y + 320, { steps: 5 });
    await window.mouse.up();
    const panel = window.getByTestId('property-panel');
    await expect(window.getByTestId('arrange-panel')).toBeVisible();
    await expect
      .poll(() => panel.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    await pointerAway(window);
    await expect(panel).toHaveScreenshot('arrange-controls.png');
  } finally {
    await closeApp(app);
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
    // drawing and not the interaction with it. An empty point past the ruler:
    // the legend holds the canvas's bottom-left (U.10, R-09) and the zoom
    // control its bottom-right (U.4).
    await window.getByTestId('tool-select').click();
    await window.mouse.click(box!.x + 60, box!.y + 60);
    await expect(window.getByTestId('selected-count')).toHaveText('0');
    await pointerAway(window);

    await expect(canvas).toHaveScreenshot('stitched-panel.png');
  } finally {
    await closeApp(app);
  }
});

test('a hole set’s holes as each style of iron cuts them, close up (9.26)', async () => {
  const { app, window } = await launch();
  try {
    const canvas = window.getByTestId('editor-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // A small panel, fitted to the window: the detail band, where a slit is
    // drawn at its tooth's true length and a round hole at its diameter.
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 400, box!.y + 300, { steps: 5 });
    await window.mouse.up();
    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-line').click();
    await panel.getByTestId('add-stitch-holes').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');
    await window.getByTestId('zoom-fit').click();

    const holeSet = window.locator('[data-testid^="feature-row-"]', { hasText: 'Stitch holes' });
    const length = panel.getByRole('textbox', { name: /^Length/ });
    const scenes: [string, () => Promise<void>][] = [
      // The starter iron, a French one: F.7's slit.
      ['tooth-french.png', async () => {}],
      // A Japanese tooth is longer, at the same slant; an inverse one leans `\`.
      [
        'tooth-japanese-inverse.png',
        async () => {
          await length.fill('2.387');
          await length.press('Enter');
          await panel.getByTestId('tooth-lean').selectOption('inverse');
        },
      ],
      ['tooth-round.png', () => panel.getByTestId('tooth-shape').selectOption('round').then()],
    ];
    for (const [name, choose] of scenes) {
      await holeSet.click();
      await choose();
      // Nothing selected, the pointer off the canvas: the drawing alone.
      // The panel fills the board, so Esc lets the selection go (U.5).
      await window.getByTestId('tool-select').click();
      await canvas.focus();
      await window.keyboard.press('Escape');
      await expect(window.getByTestId('selected-count')).toHaveText('0');
      await pointerAway(window);
      await expect(canvas).toHaveScreenshot(name);
    }
  } finally {
    await closeApp(app);
  }
});

test('a piece moved into line with another, its smart guide drawn (3.16)', async () => {
  const { app, window } = await launch();
  try {
    // Two panels drawn level, 150 px wide and 210 px apart.
    for (const left of [60, 420]) await drawAPanel(window, { left });
    const canvas = window.getByTestId('editor-canvas');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('canvas is missing');
    await window.getByTestId('tool-select').click();
    // The second, grabbed by its body and carried a little left and 4 px down:
    // still within the pick radius of level, so the guide holds it there and
    // draws its line, held mid-drag.
    await window.mouse.move(box.x + 495, box.y + 205);
    await window.mouse.down();
    await window.mouse.move(box.x + 470, box.y + 209, { steps: 5 });
    // Electron's own capture, once: a locator screenshot taken while the
    // button is held moved the drag in the container, so the piece was pictured
    // somewhere the pointer never took it.
    const png = await app.evaluate(
      async ({ BrowserWindow }, rect) => {
        const page = BrowserWindow.getAllWindows()[0];
        if (page === undefined) throw new Error('app window required');
        return (await page.webContents.capturePage(rect)).toPNG().toString('base64');
      },
      {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
    );
    expect(Buffer.from(png, 'base64')).toMatchSnapshot('smart-guide-move.png');
    await window.mouse.up();
  } finally {
    await closeApp(app);
  }
});

test('a rivet carried near the key fob’s edge, its gaps and its clearance read (3.17)', async () => {
  const { app, window } = await launch();
  try {
    await fromProjectMenu(window, 'new-template');
    await window.getByTestId('template-builtin:key-fob').dblclick();
    await expect(window.getByTestId('project-name')).toHaveText('Key fob');
    await window.getByTestId('tool-select').click();
    const board = await boardMap(window);
    const canvas = window.getByTestId('editor-canvas');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('canvas is missing');
    // Pressed on the rivet's rim at 0°, carried 20 mm right and 10 mm up with
    // Ctrl held: its rim 1 mm under the strap's top edge, warned of.
    const from = board({ x: 16, y: 13 });
    const to = board({ x: 36, y: 23 });
    await window.mouse.move(from.x, from.y);
    await window.mouse.down();
    await window.keyboard.down('Control');
    await window.mouse.move(to.x, to.y, { steps: 5 });
    await expect(window.getByTestId('move-clearance')).toHaveAttribute('data-tone', 'warning');
    // Electron's own capture, as for 3.16's: held mid-drag.
    const png = await app.evaluate(
      async ({ BrowserWindow }, rect) => {
        const page = BrowserWindow.getAllWindows()[0];
        if (page === undefined) throw new Error('app window required');
        return (await page.webContents.capturePage(rect)).toPNG().toString('base64');
      },
      {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
    );
    expect(Buffer.from(png, 'base64')).toMatchSnapshot('live-distances-move.png');
    await window.mouse.up();
    await window.keyboard.up('Control');
  } finally {
    await closeApp(app);
  }
});

test('a piece hovered, selected, being edited and locked, each its own (U.22)', async () => {
  const { app, window } = await launch();
  try {
    await drawAPanel(window, { left: 250, parts: '1' });
    const canvas = window.getByTestId('editor-canvas');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('canvas is missing');
    const body = { x: box.x + 325, y: box.y + 205 };
    const empty = { x: box.x + 60, y: box.y + 60 };
    const outline = window.locator('[data-testid^="feature-row-"]', { hasText: 'Outline' });
    /**
     * The board with the pointer still on it. Electron's own capture, after a
     * frame has been drawn: a locator screenshot moved the pointer in the
     * container, which took the hover away (as for the smart guide above).
     */
    const board = async (): Promise<Buffer> => {
      await window.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      const png = await app.evaluate(
        async ({ BrowserWindow }, rect) => {
          const page = BrowserWindow.getAllWindows()[0];
          if (page === undefined) throw new Error('app window required');
          return (await page.webContents.capturePage(rect)).toPNG().toString('base64');
        },
        {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
        },
      );
      return Buffer.from(png, 'base64');
    };
    await window.getByTestId('tool-select').click();

    // Hovered: the broad, light band, the piece left pale.
    await window.mouse.click(empty.x, empty.y);
    await expect(window.getByTestId('selected-count')).toHaveText('0');
    await window.mouse.move(body.x, body.y);
    await expect(window.locator('[data-board-hover]')).toHaveCount(1);
    expect(await board()).toMatchSnapshot('state-hover.png');

    // Selected: the narrow, dense band and the warmer piece.
    await window.mouse.click(body.x, body.y);
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await pointerAway(window);
    await expect(canvas).toHaveScreenshot('state-selected.png');

    // Being edited: a handle on every point of the drawn path.
    await outline.click();
    await window.getByTestId('convert-to-path').click();
    await window.getByTestId('tool-points').click();
    await pointerAway(window);
    await expect(canvas).toHaveScreenshot('state-editing.png');

    // Locked, pointed at: the band in the ground's ink, and the padlock.
    await window.getByTestId('tool-select').click();
    await outline.hover();
    await outline.locator('[data-testid^="feature-locked-"]').click();
    await window.mouse.click(empty.x, empty.y);
    await expect(window.getByTestId('selected-count')).toHaveText('0');
    await window.mouse.move(body.x, body.y);
    await expect(window.locator('[data-board-hover]')).toHaveCount(1);
    expect(await board()).toMatchSnapshot('state-locked.png');
  } finally {
    await closeApp(app);
  }
});

test('the print test on its sheets (7.4c)', async () => {
  const { app, window } = await launch();
  try {
    // The footer is dated, as the PDF's is: fix the day, or the reference
    // would fail tomorrow.
    await window.clock.setFixedTime(new Date('2026-09-24T12:00:00.000Z'));
    await app.evaluate(
      ({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      },
      resolve(import.meta.dirname, '../../fixtures/projects/print-test.lcp'),
    );
    await fromProjectMenu(window, 'open');
    await expect(window.getByTestId('part-count')).toHaveText('3');

    await window.getByTestId('view-sheets').click();
    await expect(window.getByTestId('sheets-summary')).toHaveText(
      '3 sheets of A4, portrait. Strap is taped across sheets 2–3.',
    );
    // The pointer off the canvas: no piece haloed, no sheet named.
    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.mouse.move(box!.x + 5, box!.y + 5);
    await window.mouse.move(0, 0);
    await expect(window.getByTestId('cursor-readout')).toHaveText('—');

    await expect(window.getByTestId('editor-canvas')).toHaveScreenshot('print-test-sheets.png');
  } finally {
    await closeApp(app);
  }
});

test('an SVG pattern’s import preview (9.20b)', async () => {
  const { app, window } = await launch();
  try {
    await chooseSvg(app, 'cardHolder');
    await window.getByTestId('project-menu').click();
    await window.getByTestId('import-svg').click();
    const dialog = window.getByTestId('svg-import-dialog');
    await expect(dialog.getByTestId('svg-import-size')).toHaveText('100.0 × 60.0 mm');
    await expect(dialog).toHaveScreenshot('svg-import-preview.png');
  } finally {
    await closeApp(app);
  }
});
