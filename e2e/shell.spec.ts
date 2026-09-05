import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

let app: ElectronApplication;

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
});

test.afterAll(async () => {
  await app?.close();
});

/**
 * A dedicated app instance with an empty document.
 *
 * The read-only checks above happily share one window, but anything that
 * draws leaves parts behind. Sharing an instance across those made the tests
 * depend on the order they happened to run in — which is exactly the kind of
 * failure that wastes an afternoon.
 */
async function withFreshApp(
  body: (
    window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
    instance: ElectronApplication,
  ) => Promise<void>,
): Promise<void> {
  const instance = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  try {
    const window = await instance.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await body(window, instance);
  } finally {
    await instance.close();
  }
}

test('opens a window titled LeatherCAD', async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  await expect(window).toHaveTitle('LeatherCAD');
});

test('reaches the main process through the platform bridge', async () => {
  const window = await app.firstWindow();

  // Proves preload → IPC → main → back. A version rendered here means the whole
  // PlatformHost boundary is wired, not just that the window opened.
  await expect(window.getByTestId('bridge-error')).toHaveCount(0);
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
});

test('puts user config in ~/.config/leathercad, not the npm package name', async () => {
  // Electron would otherwise derive this from the package name and produce
  // ~/.config/@leathercad/desktop. See docs/file-format.md §6.
  const configDir = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));

  expect(configDir.endsWith('/leathercad')).toBe(true);
});

test('sizes the canvas backing store to CSS size times device pixel ratio', async () => {
  const window = await app.firstWindow();
  const canvas = window.getByTestId('editor-canvas');
  await expect(canvas).toBeVisible();

  const { cssWidth, backingWidth, dpr } = await canvas.evaluate((element) => {
    const c = element as HTMLCanvasElement;
    return {
      cssWidth: c.getBoundingClientRect().width,
      backingWidth: c.width,
      dpr: window.devicePixelRatio,
    };
  });

  expect(dpr).toBeGreaterThan(0);
  expect(cssWidth).toBeGreaterThan(0);
  // Blurry canvases and DPR-scaled coordinate drift both start here.
  expect(backingWidth).toBe(Math.round(cssWidth * dpr));
});

test('draws the pattern rather than leaving the canvas blank', async () => {
  // M1. The geometry engine had no route to the screen for six slices, and
  // "the tests pass" was not evidence anyone could check. This asserts pixels.
  const window = await app.firstWindow();
  const canvas = window.getByTestId('editor-canvas');
  await expect(canvas).toBeVisible();

  const countColours = async (): Promise<number> =>
    canvas.evaluate((element) => {
      const c = element as HTMLCanvasElement;
      const context = c.getContext('2d');
      if (context === null) return 0;
      const { data } = context.getImageData(0, 0, c.width, c.height);
      const seen = new Set<string>();
      // Sample sparsely; we only need to know the surface is not one flat colour.
      for (let i = 0; i < data.length; i += 4 * 97) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return seen.size;
    });

  // Background, grid, rulers, cut line, stitch line and holes are all
  // different colours; a blank canvas reports one.
  await expect.poll(countColours, { timeout: 10_000 }).toBeGreaterThan(4);
});

test('reports cursor position in millimetres', async () => {
  const window = await app.firstWindow();
  const box = await window.getByTestId('editor-canvas').boundingBox();
  expect(box).not.toBeNull();

  await window.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(window.getByTestId('cursor-readout')).toContainText('mm');
});

test('draws a rectangle, moves it, and reverses both with undo', async () => {
  // The functional loop end to end: a drag makes a real cut contour, the
  // select tool moves it as one undoable step, and undo walks back through
  // both.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    expect(box).not.toBeNull();

    const drag = async (x1: number, y1: number, x2: number, y2: number): Promise<void> => {
      await window.mouse.move(box!.x + x1, box!.y + y1);
      await window.mouse.down();
      await window.mouse.move(box!.x + (x1 + x2) / 2, box!.y + (y1 + y2) / 2, { steps: 4 });
      await window.mouse.move(box!.x + x2, box!.y + y2, { steps: 4 });
      await window.mouse.up();
    };

    await window.getByTestId('tool-rectangle').click();
    await drag(140, 140, 340, 260);
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('selected-count')).toHaveText('1');

    await window.getByTestId('tool-select').click();
    await drag(140, 140, 220, 220);
    await expect(window.getByTestId('undo')).toBeEnabled();

    // One undo reverses the whole move, not each intermediate position.
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');

    await window.getByTestId('redo').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
  });
});

test('draw roughly, then type exact millimetres', async () => {
  // The reason to build this rather than use a vector editor: a panel is
  // 105 mm because it was typed, not because it was dragged carefully.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    expect(box).not.toBeNull();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 150, box!.y + 150);
    await window.mouse.down();
    await window.mouse.move(box!.x + 330, box!.y + 270, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    await expect(panel).toBeVisible();

    const setField = async (label: string, value: string): Promise<void> => {
      const input = panel.locator('label', { hasText: new RegExp(`^${label}`) }).locator('input');
      await input.fill(value);
      await input.press('Enter');
    };

    await setField('X', '0');
    await setField('Y', '0');
    await setField('Width', '105');
    await setField('Height', '75');
    for (const corner of ['↖', '↗', '↙', '↘']) await setField(corner, '8');

    // 2(105-16) + 2(75-16) + 2·pi·8 = 346.2655, computed by the geometry
    // engine rather than by the panel.
    await expect(panel.locator('.readout').first()).toContainText('346.27 mm');
    await expect(panel.locator('.readout').nth(1)).toContainText('78.20 cm²');

    // Typing is undoable like anything else.
    await window.getByTestId('undo').click();
    await expect(panel.locator('.readout').first()).not.toContainText('346.27 mm');
  });
});

test('the parts list selects what the canvas cannot reach', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 150, box!.y + 150);
    await window.mouse.down();
    await window.mouse.move(box!.x + 320, box!.y + 250, { steps: 4 });
    await window.mouse.up();

    await expect(window.getByTestId('parts-list')).toContainText('Panel');

    await window.getByTestId('tool-select').click();
    await window.getByTestId('editor-canvas').click({ position: { x: 600, y: 450 } });
    await expect(window.getByTestId('selected-count')).toHaveText('0');

    await window
      .getByTestId('parts-list')
      .getByRole('button', { name: /Outline/ })
      .click();
    await expect(window.getByTestId('selected-count')).toHaveText('1');
  });
});

test('saves a project and reopens it with its parameters intact', async () => {
  // The point of a native format rather than exporting to PDF: a saved
  // pattern comes back as an editable 105 x 75 rectangle with named parts,
  // not as anonymous curves.
  const target = join(tmpdir(), `leathercad-e2e-${Date.now()}.lcp`);
  const instance = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });

  try {
    const window = await instance.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Native dialogs cannot be driven from a test, so answer them directly.
    await instance.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, target);

    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 150, box!.y + 150);
    await window.mouse.down();
    await window.mouse.move(box!.x + 330, box!.y + 270, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    const setField = async (label: string, value: string): Promise<void> => {
      const input = panel.locator('label', { hasText: new RegExp(`^${label}`) }).locator('input');
      await input.fill(value);
      await input.press('Enter');
    };
    await setField('Width', '105');
    await setField('Height', '75');
    for (const corner of ['↖', '↗', '↙', '↘']) await setField(corner, '8');
    await window.getByTestId('part-name').fill('Card holder');

    // The dot marks unsaved changes.
    await expect(window.getByTestId('save')).toContainText('•');
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save')).not.toContainText('•');
    expect(existsSync(target)).toBe(true);

    // Throw the work away, then get it back from disk.
    await window.getByTestId('tool-select').click();
    await window
      .getByTestId('parts-list')
      .getByRole('button', { name: /Outline/ })
      .click();
    await window.keyboard.press('Delete');
    await expect(window.getByTestId('part-count')).toHaveText('0');

    await window.getByTestId('open').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('parts-list')).toContainText('Card holder');

    // Reopened as parameters, so the geometry recomputes to the same numbers.
    await window
      .getByTestId('parts-list')
      .getByRole('button', { name: /Outline/ })
      .click();
    await expect(panel.locator('.readout').first()).toContainText('346.27 mm');

    // Opening is not an edit, so there is nothing to undo back into.
    await expect(window.getByTestId('undo')).toBeDisabled();
  } finally {
    await instance.close();
    rmSync(target, { force: true });
  }
});

test('exports a print-ready PDF at 1:1', async () => {
  // The application never drives a printer, so the file has to be trustworthy
  // in someone else's viewer. This checks the page really is A4 and that the
  // verification square really measures 50 mm, by rendering through poppler.
  const target = join(tmpdir(), `leathercad-e2e-${Date.now()}.pdf`);
  const instance = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });

  try {
    const window = await instance.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await instance.evaluate(({ dialog, shell }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      // Do not launch a real PDF viewer during a test run.
      shell.openPath = async () => '';
    }, target);

    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.getByTestId('project-name').fill('Card holder');
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 150, box!.y + 150);
    await window.mouse.down();
    await window.mouse.move(box!.x + 330, box!.y + 260, { steps: 5 });
    await window.mouse.up();

    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(target), { timeout: 10_000 }).toBe(true);

    // No error means nothing was oversized and nothing was silently scaled.
    await expect(window.getByTestId('file-error')).toHaveCount(0);

    const info = execFileSync('pdfinfo', [target], { encoding: 'utf8' });
    expect(info).toMatch(/Page size:\s+595\.276 x 841\.89 pts \(A4\)/);
    expect(info).toContain('LeatherCAD');
  } finally {
    await instance.close();
    rmSync(target, { force: true });
  }
});

test('denies in-page navigation away from the app', async () => {
  const window = await app.firstWindow();

  const before = window.url();
  await window.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com';
    document.body.append(anchor);
    anchor.click();
  });
  await window.waitForTimeout(300);

  expect(window.url()).toBe(before);
});

test('the tool palette holds modes and nothing else', async () => {
  await withFreshApp(async (window) => {
    const rail = window.getByTestId('tool-rail');
    await expect(rail).toBeVisible();

    // A mode stays on once chosen. An action would not, and an action in a
    // mode palette is the thing this layout exists to prevent.
    await window.getByTestId('tool-line').click();
    await expect(window.getByTestId('tool-line')).toHaveClass(/active/);

    // Undo is an action: it belongs to the document, not the rail.
    await expect(rail.getByTestId('undo')).toHaveCount(0);
    await expect(rail.getByTestId('save')).toHaveCount(0);
  });
});

test('history sits apart from the file actions', async () => {
  await withFreshApp(async (window) => {
    await expect(window.getByTestId('history-group').getByTestId('undo')).toBeVisible();
    await expect(window.getByTestId('history-group').getByTestId('save')).toHaveCount(0);
  });
});

test('the options strip takes no room until a tool has options', async () => {
  await withFreshApp(async (window) => {
    // No tool has options yet, so the strip must not occupy space. An empty
    // bar above the canvas is exactly the noise this layout removes.
    await expect(window.getByTestId('tool-options')).toHaveCount(0);
  });
});

test('the canvas fills the column it shares with the options strip', async () => {
  // The strip renders nothing today, so the canvas must take the whole column.
  // A canvas that collapses to its intrinsic 150px still passes a width-only
  // check while every drag below it silently misses.
  const window = await app.firstWindow();

  const { host, column } = await window.evaluate(() => {
    const height = (selector: string): number =>
      document.querySelector(selector)?.getBoundingClientRect().height ?? 0;
    return { host: height('.canvas-host'), column: height('.canvas-column') };
  });

  expect(column).toBeGreaterThan(400);
  expect(host).toBe(column);
});

test('the workspace narrows instead of pushing the properties panel off screen', async () => {
  // The canvas is a fixed-size element, so the column holding it will refuse to
  // shrink below that size unless told otherwise — and a panel the user cannot
  // reach is worse than the wrapping header this layout replaced.
  await withFreshApp(async (window, instance) => {
    await instance.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1024, 813);
    });

    await expect
      .poll(async () =>
        window.evaluate(() => {
          const panel = document.querySelector('[data-testid="property-panel"]');
          return Math.round(panel?.getBoundingClientRect().right ?? 0);
        }),
      )
      .toBeLessThanOrEqual(1024);
  });
});

test('the header stays one row when the window narrows', async () => {
  // A header that wrapped to two lines at 1280 is what prompted the whole
  // layout. The hint is the least important thing in the row, so it is the
  // thing that gives — the controls must not fold.
  await withFreshApp(async (window, instance) => {
    const headerHeight = async (): Promise<number> =>
      window.evaluate(() =>
        Math.round(document.querySelector('.app-header')?.getBoundingClientRect().height ?? 0),
      );

    const wide = await headerHeight();
    expect(wide).toBeGreaterThan(0);

    await instance.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1024, 813);
    });

    await expect.poll(headerHeight).toBe(wide);
  });
});

test('draws a circle from its centre and retypes the diameter', async () => {
  // Centre-out, not corner-to-corner: a hole or a strap end is positioned by
  // where its middle goes, and the record stores a centre and a radius.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    expect(box).not.toBeNull();

    await window.getByTestId('tool-circle').click();
    await window.mouse.move(box!.x + 300, box!.y + 300);
    await window.mouse.down();
    await window.mouse.move(box!.x + 380, box!.y + 300, { steps: 5 });
    await window.mouse.up();

    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('selected-count')).toHaveText('1');

    const panel = window.getByTestId('property-panel');
    const diameter = panel.locator('label', { hasText: /^Diameter/ }).locator('input');
    await diameter.fill('40');
    await diameter.press('Enter');

    // pi x 40 = 125.66 mm, computed by the geometry engine rather than the panel.
    await expect(panel.locator('.readout').first()).toContainText('125.66 mm');
  });
});

test('C selects the circle tool and a click alone draws nothing', async () => {
  await withFreshApp(async (window) => {
    // Wait for the rail before pressing: keyboard.press waits for nothing, and
    // the shortcut listener does not exist until React has mounted.
    await expect(window.getByTestId('tool-rail')).toBeVisible();

    await window.keyboard.press('c');
    await expect(window.getByTestId('tool-circle')).toHaveClass(/active/);

    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.mouse.move(box!.x + 200, box!.y + 200);
    await window.mouse.down();
    await window.mouse.up();

    await expect(window.getByTestId('part-count')).toHaveText('0');
  });
});

test('draws an arc through three points and saves its parameters', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    expect(box).not.toBeNull();

    await window.getByTestId('tool-arc').click();

    // Start, end, then the bulge — the arc bends through the third click.
    await window.mouse.click(box!.x + 250, box!.y + 400);
    await window.mouse.click(box!.x + 450, box!.y + 400);
    await window.mouse.move(box!.x + 350, box!.y + 300);
    await window.mouse.click(box!.x + 350, box!.y + 300);

    await expect(window.getByTestId('part-count')).toHaveText('1');

    // Two ends, so it is a run to mark rather than an outline to cut.
    const panel = window.getByTestId('property-panel');
    await expect(panel).toContainText('Marking line');
    await expect(panel.locator('label', { hasText: /^Radius/ })).toBeVisible();
    await expect(panel.locator('label', { hasText: /^Sweep/ })).toBeVisible();

    const radius = panel.locator('label', { hasText: /^Radius/ }).locator('input');
    await radius.fill('30');
    await radius.press('Enter');

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
  });
});

test('three points in a line make no arc', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-arc').click();
    await window.mouse.click(box!.x + 250, box!.y + 400);
    await window.mouse.click(box!.x + 450, box!.y + 400);
    await window.mouse.click(box!.x + 350, box!.y + 400);

    // An infinite radius is not an arc, and a zero-area part could never be
    // selected to delete.
    await expect(window.getByTestId('part-count')).toHaveText('0');
  });
});
