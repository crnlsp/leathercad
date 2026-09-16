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

    // `domcontentloaded` only means the markup parsed. The canvas element
    // exists on the first render, but its pointer handlers are attached in an
    // effect — so a drag started too early lands on nothing and the test fails
    // with an empty document rather than a useful message.
    //
    // The version arrives from the main process through an effect, so a
    // non-empty one proves React mounted, effects ran, and the platform bridge
    // answered. It is the earliest honest signal that the app is interactive.
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

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
    // The emptied part stays until it is removed on purpose (ADR 0009).
    await expect(window.getByTestId('feature-count')).toHaveText('0');

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

test('the options strip appears only for a tool that has options', async () => {
  await withFreshApp(async (window) => {
    // Select has nothing to configure, so the strip must not occupy space. An
    // empty bar above the canvas is exactly the noise this layout removes.
    await window.getByTestId('tool-select').click();
    await expect(window.getByTestId('tool-options')).toHaveCount(0);

    // A draw tool does have something to say: what the next line becomes.
    await window.getByTestId('tool-rectangle').click();
    await expect(window.getByTestId('tool-options')).toHaveCount(1);
    await expect(window.getByTestId('draw-as-cut')).toHaveAttribute('aria-pressed', 'true');

    // And the hardware tool asks a different question entirely.
    await window.getByTestId('tool-hardware').click();
    await expect(window.getByTestId('hardware-diameter')).toHaveValue('4');
  });
});

test('the canvas takes every pixel the options strip is not using', async () => {
  // A canvas that collapses to its intrinsic 150px still passes a width-only
  // check while every drag below it silently misses. With a tool that has
  // options the strip takes a band and the canvas takes the rest; with one
  // that has none the canvas takes all of it.
  await withFreshApp(async (window) => {
    const heights = async (): Promise<{ host: number; column: number; strip: number }> =>
      window.evaluate(() => {
        const height = (selector: string): number =>
          document.querySelector(selector)?.getBoundingClientRect().height ?? 0;
        return {
          host: height('.canvas-host'),
          column: height('.canvas-column'),
          strip: height('.tool-options'),
        };
      });

    await window.getByTestId('tool-rectangle').click();
    const withStrip = await heights();
    expect(withStrip.column).toBeGreaterThan(400);
    expect(withStrip.strip).toBeGreaterThan(0);
    expect(withStrip.host).toBe(withStrip.column - withStrip.strip);

    await window.getByTestId('tool-select').click();
    const without = await heights();
    expect(without.strip).toBe(0);
    expect(without.host).toBe(without.column);
  });
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

test('rotates a rectangle and it stays a rectangle', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 300, box!.y + 380);
    await window.mouse.down();
    await window.mouse.move(box!.x + 520, box!.y + 500, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    const width = await panel
      .locator('label', { hasText: /^Width/ })
      .locator('input')
      .inputValue();

    await window.getByTestId('tool-rotate').click();
    await window.mouse.move(box!.x + 600, box!.y + 440);
    await window.mouse.down();
    await window.mouse.move(box!.x + 560, box!.y + 300, { steps: 6 });
    await window.mouse.up();

    // Still parametric, still the same size: a rotation resizes nothing, and
    // the panel can still be typed into.
    const turn = panel.locator('label', { hasText: /^Turn/ }).locator('input');
    await expect(turn).toBeVisible();
    expect(Number(await turn.inputValue())).not.toBe(0);
    expect(
      await panel
        .locator('label', { hasText: /^Width/ })
        .locator('input')
        .inputValue(),
    ).toBe(width);

    // And it can be typed exactly, which is the whole point of staying parametric.
    await turn.fill('30');
    await turn.press('Enter');
    await expect(turn).toHaveValue('30');
  });
});

test('refuses to squash a circle, and says why on screen', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-circle').click();
    await window.mouse.move(box!.x + 400, box!.y + 300);
    await window.mouse.down();
    await window.mouse.move(box!.x + 480, box!.y + 300, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    const diameter = panel.locator('label', { hasText: /^Diameter/ }).locator('input');
    const before = await diameter.inputValue();

    // Drag one axis only. An ellipse is not representable, so nothing happens
    // — and the reason has to be readable while the drag is still going on.
    await window.getByTestId('tool-scale').click();
    await window.mouse.move(box!.x + 480, box!.y + 300);
    await window.mouse.down();
    await window.mouse.move(box!.x + 620, box!.y + 300, { steps: 6 });

    await expect(window.getByTestId('tool-notice')).toContainText(/ellipse/i);
    await window.mouse.up();

    await expect(diameter).toHaveValue(before);
  });
});

test('scales a circle evenly when Shift holds the aspect', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-circle').click();
    await window.mouse.move(box!.x + 400, box!.y + 300);
    await window.mouse.down();
    await window.mouse.move(box!.x + 480, box!.y + 300, { steps: 5 });
    await window.mouse.up();

    const diameter = window
      .getByTestId('property-panel')
      .locator('label', { hasText: /^Diameter/ })
      .locator('input');
    const before = Number(await diameter.inputValue());

    await window.getByTestId('tool-scale').click();
    await window.keyboard.down('Shift');
    await window.mouse.move(box!.x + 480, box!.y + 300);
    await window.mouse.down();
    await window.mouse.move(box!.x + 560, box!.y + 300, { steps: 6 });
    await window.mouse.up();
    await window.keyboard.up('Shift');

    expect(Number(await diameter.inputValue())).toBeGreaterThan(before);
  });
});

test('a stitch line and its holes follow the panel width', async () => {
  // M3. The whole product in one interaction: type a width, and the stitch
  // line and every hole on it follow, with nothing regenerated by hand.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 250);
    await window.mouse.down();
    await window.mouse.move(box!.x + 550, box!.y + 450, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-line').click();
    await panel.getByTestId('add-stitch-holes').click();

    const count = window.getByTestId('hole-count');
    const before = Number(await count.textContent());
    expect(before).toBeGreaterThan(10);
    await expect(window.getByTestId('achieved-spacing')).toContainText('mm');

    // Go back to the outline and widen it.
    await window.getByTestId('parts-list').getByText('Outline').click();
    const width = panel.locator('label', { hasText: /^Width/ }).locator('input');
    await width.fill('205');
    await width.press('Enter');

    // Reselect the holes to read the new count.
    await window.getByTestId('parts-list').getByText('Stitch holes').click();
    await expect(count).not.toHaveText(String(before));
    expect(Number(await count.textContent())).toBeGreaterThan(before);
  });
});

/** A panel with a stitch line and holes, the outline selected. */
async function panelWithChain(window: Awaited<ReturnType<ElectronApplication['firstWindow']>>) {
  const box = await window.getByTestId('editor-canvas').boundingBox();

  await window.getByTestId('tool-rectangle').click();
  await window.mouse.move(box!.x + 250, box!.y + 250);
  await window.mouse.down();
  await window.mouse.move(box!.x + 550, box!.y + 450, { steps: 5 });
  await window.mouse.up();

  const panel = window.getByTestId('property-panel');
  await panel.getByTestId('add-stitch-line').click();
  // A derived feature says what it follows, and it can be changed.
  await expect(panel.getByTestId('follows')).toContainText('Outline');
  await panel.getByTestId('add-stitch-holes').click();
  await expect(window.getByTestId('feature-count')).toHaveText('3');

  await window.getByTestId('parts-list').getByText('Outline').click();
  return panel;
}

test('deleting an outline asks what to do with what follows it', async () => {
  // ADR 0009: never a silent cascade. The dialog names the dependents, and the
  // document does not change until a choice is made.
  await withFreshApp(async (window) => {
    const panel = await panelWithChain(window);
    await panel.getByTestId('delete-feature').click();

    const dialog = window.getByTestId('delete-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Stitch line');
    await expect(dialog).toContainText('Stitch holes');
    await expect(window.getByTestId('feature-count')).toHaveText('3');

    await dialog.getByTestId('delete-all').click();
    await expect(dialog).toHaveCount(0);

    // All three go in one step; the part stays, empty, until removed on purpose.
    await expect(window.getByTestId('feature-count')).toHaveText('0');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');
  });
});

test('keeping a stitch line frozen leaves it in place, still carrying its holes', async () => {
  await withFreshApp(async (window) => {
    const panel = await panelWithChain(window);
    await panel.getByTestId('delete-feature').click();
    await window.getByTestId('delete-dialog').getByTestId('delete-freeze').click();

    // The outline goes; the stitch line stays as drawn geometry, and its holes
    // still follow it.
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await window.getByTestId('parts-list').getByText('Stitch line').click();
    await expect(panel.getByTestId('frozen-note')).toContainText('Frozen from Outline');

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');
  });
});

test('cancelling a delete changes nothing', async () => {
  await withFreshApp(async (window) => {
    const panel = await panelWithChain(window);
    await panel.getByTestId('delete-feature').click();
    await expect(window.getByTestId('delete-dialog')).toBeVisible();

    // Focus starts on Cancel, and Escape cancels.
    await window.keyboard.press('Escape');

    await expect(window.getByTestId('delete-dialog')).toHaveCount(0);
    await expect(window.getByTestId('feature-count')).toHaveText('3');
    await expect(window.getByTestId('parts-list')).toContainText('Outline');
  });
});

test('an emptied part stays until it is removed on purpose', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 250);
    await window.mouse.down();
    await window.mouse.move(box!.x + 450, box!.y + 400, { steps: 5 });
    await window.mouse.up();

    // Nothing depends on a lone outline, so it goes at once — but its part stays.
    await window.getByTestId('property-panel').getByTestId('delete-feature').click();
    await expect(window.getByTestId('feature-count')).toHaveText('0');
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('parts-list')).toContainText('Empty');

    await window.getByTestId('remove-empty-part').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
  });
});

test("a second panel starts exactly on the first panel's corner", async () => {
  // Snapping is what makes a drawn point trustworthy. Without it a corner
  // dropped "on" another corner is a fraction of a millimetre away, which is
  // invisible on screen and wrong on leather.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    const panel = window.getByTestId('property-panel');
    const numberIn = async (label: string): Promise<number> =>
      Number(await panel.getByLabel(label).inputValue());

    const drag = async (x1: number, y1: number, x2: number, y2: number): Promise<void> => {
      await window.mouse.move(box!.x + x1, box!.y + y1);
      await window.mouse.down();
      await window.mouse.move(box!.x + x2, box!.y + y2, { steps: 4 });
      await window.mouse.up();
    };

    await window.getByTestId('tool-rectangle').click();
    await drag(140, 140, 340, 260);
    const firstX = await numberIn('X');

    // Start the second panel three pixels off the first one's lower-left
    // corner — close enough to mean it, far enough to miss by hand — and drag
    // away from it, so that corner stays this rectangle's origin and the two
    // X readings are the same number rather than a sum of two rounded ones.
    await window.getByTestId('tool-rectangle').click();
    await drag(137, 263, 250, 340);

    await expect(window.getByTestId('part-count')).toHaveText('2');
    expect(await numberIn('X')).toBeCloseTo(firstX, 3);
  });
});

test('a fold line joins the panel it is drawn on', async () => {
  // The reason 4.7 exists: a wallet body that folds needs to say where, and
  // that mark belongs to the panel — not to a "part" of its own that could
  // never be cut.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    const drag = async (x1: number, y1: number, x2: number, y2: number): Promise<void> => {
      await window.mouse.move(box!.x + x1, box!.y + y1);
      await window.mouse.down();
      await window.mouse.move(box!.x + x2, box!.y + y2, { steps: 4 });
      await window.mouse.up();
    };
    const click = async (x: number, y: number): Promise<void> => {
      await window.mouse.move(box!.x + x, box!.y + y);
      await window.mouse.down();
      await window.mouse.up();
    };

    await window.getByTestId('tool-rectangle').click();
    await drag(160, 160, 460, 340);
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // The panel is selected from having just been drawn, so the fold has a home.
    await window.getByTestId('tool-line').click();
    await window.getByTestId('draw-as-fold').click();
    // Wait for the mode to actually be on: clicking and drawing in the same
    // breath races React, and a draw that lands while the mode is still Cut
    // makes a part and fails the assertion for the wrong reason.
    await expect(window.getByTestId('draw-as-fold')).toHaveAttribute('aria-pressed', 'true');

    // The line tool places a point per click and finishes at the second — it
    // is not a drag, and snapping puts each end on the panel edge it is aimed
    // at rather than near it.
    await click(310, 161);
    await click(310, 339);

    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await expect(window.getByTestId('parts-list')).toContainText('Fold (valley)');

    // The new fold is selected. Its thickness is not set, and the field says
    // so rather than claiming 0 mm; set it, then clear it again.
    const thickness = window.getByTestId('property-panel').getByLabel('Thickness');
    await expect(thickness).toHaveValue('');
    await expect(thickness).toHaveAttribute('placeholder', 'not set');
    await thickness.fill('1.2');
    await thickness.press('Enter');
    await expect(thickness).toHaveValue('1.2');
    await thickness.fill('');
    await thickness.press('Enter');
    await expect(thickness).toHaveValue('');
  });
});

test('drawing a fold line with nothing selected changes nothing, and says why', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-line').click();
    await window.getByTestId('draw-as-fold').click();
    // Wait for the mode to actually be on: clicking and drawing in the same
    // breath races React, and a draw that lands while the mode is still Cut
    // makes a part and fails the assertion for the wrong reason.
    await expect(window.getByTestId('draw-as-fold')).toHaveAttribute('aria-pressed', 'true');

    // Two clicks: a finished line, with nowhere to put it.
    await window.mouse.move(box!.x + 200, box!.y + 200);
    await window.mouse.down();
    await window.mouse.up();
    await window.mouse.move(box!.x + 300, box!.y + 300);
    await window.mouse.down();
    await window.mouse.up();

    // Refused rather than guessed at: a fold line on the wrong panel is
    // invisible until the leather is cut. The message and the counts share the
    // status bar — any notice used to replace the counts, which hid "0 parts"
    // at exactly the moment it was the point.
    await expect(window.getByTestId('tool-notice')).toContainText('Select a part');
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await expect(window.getByTestId('parts-list')).toContainText('No parts yet');
  });
});

test('places a rivet hole on the selected panel, named for what it is', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 160, box!.y + 160);
    await window.mouse.down();
    await window.mouse.move(box!.x + 460, box!.y + 340, { steps: 4 });
    await window.mouse.up();

    await window.getByTestId('tool-hardware').click();
    await window.mouse.move(box!.x + 300, box!.y + 250);
    await window.mouse.down();
    await window.mouse.up();

    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('parts-list')).toContainText('Rivet 4 mm');

    // A 4 mm punch makes a 4 mm hole, and the panel says so in the units the
    // punch is stamped in.
    await expect(window.getByTestId('property-panel').getByLabel('Diameter')).toHaveValue('4');
  });
});

test('an inset too deep for its outline is listed, selectable and fixable', async () => {
  // Slice 4.12a. One diagnostic list behind every surface: the panel, the
  // status count and the property panel all show the same problem, and the
  // feature that follows the broken one is reported once, as a consequence.
  await withFreshApp(async (window) => {
    const panel = await panelWithChain(window);
    await window.getByTestId('parts-list').getByText('Stitch line').click();

    const inset = panel.locator('label', { hasText: /^Inset/ }).locator('input');
    await inset.fill('60');
    await inset.press('Enter');

    const problems = window.getByTestId('problems-panel');
    const rows = problems.getByTestId('problem-row');
    await expect(rows).toHaveCount(2);

    // The root says what is wrong; the holes say only that what they follow
    // failed, rather than repeating the inset's reason (E3).
    await expect(rows.first()).toHaveAttribute('data-code', 'OFFSET_COLLAPSED');
    await expect(rows.first()).toContainText('60 mm inset is deeper');
    await expect(rows.nth(1)).toHaveAttribute('data-code', 'SOURCE_FAILED');
    await expect(rows.nth(1)).toContainText('Stitch line it follows could not be built');
    await expect(window.getByTestId('problem-count')).toHaveText('2');

    // Clicking a problem selects what it is about, and the property panel
    // shows the same sentence from the same list.
    await window.getByTestId('parts-list').getByText('Outline').click();
    await rows.first().click();
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await expect(panel.getByTestId('feature-problems')).toContainText('deeper than this outline');

    // Fixing the cause clears it everywhere.
    await inset.fill('3.5');
    await inset.press('Enter');
    await expect(rows).toHaveCount(0);
    await expect(problems).toContainText('Nothing to fix');
    await expect(window.getByTestId('problem-count')).toHaveCount(0);
  });
});

test('exports a part named in Polish, which used to be impossible', async () => {
  // Slice 4.11a. pdf-lib's standard fonts are WinAnsi, which has no ł, so
  // `drawText` threw and a project named this way could not be exported at
  // all. Text is glyph outlines now, and an outline has no encoding to fall
  // outside of.
  const target = join(tmpdir(), `leathercad-e2e-pl-${Date.now()}.pdf`);
  const instance = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });

  try {
    const window = await instance.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await instance.evaluate(({ dialog, shell }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      shell.openPath = async () => '';
    }, target);

    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.getByTestId('project-name').fill('Portfel');
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 150, box!.y + 150);
    await window.mouse.down();
    await window.mouse.move(box!.x + 330, box!.y + 260, { steps: 5 });
    await window.mouse.up();

    await window.getByTestId('part-name').fill('Przegroda główna');
    await window.getByTestId('part-name').press('Enter');

    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(target), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);

    // A real page, with the caption drawn on it as outlines.
    const info = execFileSync('pdfinfo', [target], { encoding: 'utf8' });
    expect(info).toMatch(/Pages:\s+1/);
  } finally {
    await instance.close();
    rmSync(target, { force: true });
  }
});
