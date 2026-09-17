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

    // A draw tool does have something to say: what the next thing drawn
    // becomes. Outline is the default — a new piece of leather.
    await window.getByTestId('tool-rectangle').click();
    await expect(window.getByTestId('tool-options')).toHaveCount(1);
    await expect(window.getByTestId('draw-as-outline')).toHaveAttribute('aria-pressed', 'true');

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

    // An arc has two ends, so it is a run to mark rather than an outline to
    // cut — and since §3.8 that means drawing it in Marking mode, on a part.
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 200, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 560, box!.y + 460, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    await window.getByTestId('tool-arc').click();
    await window.getByTestId('draw-as-marking').click();
    await expect(window.getByTestId('draw-as-marking')).toHaveAttribute('aria-pressed', 'true');

    // Start, end, then the bulge — the arc bends through the third click.
    await window.mouse.click(box!.x + 250, box!.y + 400);
    await window.mouse.click(box!.x + 450, box!.y + 400);
    await window.mouse.move(box!.x + 350, box!.y + 300);
    await window.mouse.click(box!.x + 350, box!.y + 300);

    // On the panel, not in a part of its own.
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('2');

    const panel = window.getByTestId('property-panel');
    await expect(panel).toContainText('Marking line');
    await expect(panel.locator('label', { hasText: /^Radius/ })).toBeVisible();
    await expect(panel.locator('label', { hasText: /^Sweep/ })).toBeVisible();

    const radius = panel.locator('label', { hasText: /^Radius/ }).locator('input');
    await radius.fill('30');
    await radius.press('Enter');

    await window.getByTestId('undo').click();
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('feature-count')).toHaveText('1');
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

    const inset = panel.locator('label', { hasText: /^Edge margin/ }).locator('input');
    await inset.fill('60');
    await inset.press('Enter');

    const problems = window.getByTestId('problems-panel');
    const rows = problems.getByTestId('problem-row');
    await expect(rows).toHaveCount(2);

    // The root says what is wrong; the holes say only that what they follow
    // failed, rather than repeating the inset's reason (E3).
    await expect(rows.first()).toHaveAttribute('data-code', 'OFFSET_COLLAPSED');
    await expect(rows.first()).toContainText('60 mm edge margin is deeper');
    await expect(rows.nth(1)).toHaveAttribute('data-code', 'SOURCE_FAILED');
    await expect(rows.nth(1)).toContainText('Stitch line it follows could not be built');
    await expect(window.getByTestId('problem-count')).toHaveText('2');

    // Clicking a problem selects what it is about, and the property panel
    // shows the same sentence from the same list.
    await window.getByTestId('parts-list').getByText('Outline').click();
    await rows.first().click();
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await expect(panel.getByTestId('feature-problems')).toContainText('deeper than this edge');

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

test('a label is placed on a part, typed in the panel, and survives a save', async () => {
  // Slice 4.11b. The words are the user's own, so unlike a part caption they
  // are stored — as words, a place and a size, never as outlines.
  const target = join(tmpdir(), `leathercad-e2e-label-${Date.now()}.lcp`);
  const instance = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });

  try {
    const window = await instance.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await instance.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, target);

    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 200, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 500, box!.y + 380, { steps: 5 });
    await window.mouse.up();

    // One click places it; the panel is where it is typed.
    await window.getByTestId('tool-text').click();
    // Wait for the mode to actually be on: clicking and placing in the same
    // breath races React, as the fold-line test found.
    await expect(window.getByTestId('tool-text')).toHaveClass(/active/);
    await window.mouse.move(box!.x + 260, box!.y + 300);
    await window.mouse.down();
    await window.mouse.up();

    await expect(window.getByTestId('feature-count')).toHaveText('2');
    const panel = window.getByTestId('property-panel');
    const text = panel.getByTestId('label-text');
    await expect(text).toHaveValue('Text');

    await text.fill('Zszyć przed klejeniem');
    // The parts list follows the words, so the label is findable by what it says.
    await expect(window.getByTestId('parts-list')).toContainText('Zszyć przed klejeniem');

    await window.getByTestId('save').click();
    await expect(window.getByTestId('save')).not.toContainText('•');

    // Throw it away and get it back from disk, at format version 5.
    await window.getByTestId('tool-select').click();
    await window.getByTestId('parts-list').getByRole('button', { name: /Zszyć/ }).click();
    await window.keyboard.press('Delete');
    await expect(window.getByTestId('feature-count')).toHaveText('1');

    await window.getByTestId('open').click();
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await expect(window.getByTestId('parts-list')).toContainText('Zszyć przed klejeniem');

    // Back as parameters: the panel can still retype it.
    await window.getByTestId('parts-list').getByRole('button', { name: /Zszyć/ }).click();
    await expect(panel.getByTestId('label-text')).toHaveValue('Zszyć przed klejeniem');
  } finally {
    await instance.close();
    rmSync(target, { force: true });
  }
});

test('placing a label with no part selected changes nothing, and says why', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-text').click();
    // Wait for the mode to actually be on: clicking and placing in the same
    // breath races React, as the fold-line test found.
    await expect(window.getByTestId('tool-text')).toHaveClass(/active/);
    await window.mouse.move(box!.x + 300, box!.y + 300);
    await window.mouse.down();
    await window.mouse.up();

    // A label belongs to a part, like a fold line does.
    await expect(window.getByTestId('tool-notice')).toContainText('Select a part');
    await expect(window.getByTestId('tool-notice')).toContainText('label');
    await expect(window.getByTestId('feature-count')).toHaveText('0');
    await expect(window.getByTestId('part-count')).toHaveText('0');
  });
});

test('flipping a panel mirrors it, rather than turning it round', async () => {
  // Slice 3.7b, defect D2. Before the fix a reflection kept the origin and
  // changed the rotation, so the panel stayed put with its rounded corners
  // diagonally opposite — which looks almost right until it is cut.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 250);
    await window.mouse.down();
    await window.mouse.move(box!.x + 550, box!.y + 420, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    const field = (label: string) =>
      panel.locator('label', { hasText: new RegExp(`^${label}`) }).locator('input');
    const set = async (label: string, value: string): Promise<void> => {
      const input = field(label);
      await input.fill(value);
      await input.press('Enter');
    };

    await set('X', '10');
    await set('Y', '20');
    await set('Width', '100');
    await set('Height', '60');
    // One rounded corner, so the flip has something to carry across.
    await set('↙', '8');

    await window.getByTestId('flip-horizontal').click();

    // The piece stays on its own footprint. Either spelling: a field the user
    // typed keeps their text until the model gives it a new number.
    await expect(field('X')).toHaveValue(/^10(\.00)?$/);
    await expect(field('Y')).toHaveValue(/^20(\.00)?$/);
    // ...lying the way it was...
    await expect(field('Turn')).toHaveValue(/^0(\.00)?$/);
    // ...with the rounded corner now on the other side, adjacent rather than
    // diagonally opposite.
    await expect(field('↙')).toHaveValue(/^0(\.00)?$/);
    await expect(field('↘')).toHaveValue(/^8(\.00)?$/);

    // And one Undo puts it back.
    await window.getByTestId('undo').click();
    await expect(field('↙')).toHaveValue(/^8(\.00)?$/);
    await expect(field('↘')).toHaveValue(/^0(\.00)?$/);
  });
});

test('a label cannot be flipped, and the button says why', async () => {
  // Slice 3.7b keeps this a deliberate restriction: a mirror is a similarity,
  // so without refusing it the words would come out rotated rather than
  // reflected. What a mirrored label should mean is 4.8's question.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 250);
    await window.mouse.down();
    await window.mouse.move(box!.x + 520, box!.y + 400, { steps: 5 });
    await window.mouse.up();

    await window.getByTestId('tool-text').click();
    await expect(window.getByTestId('tool-text')).toHaveClass(/active/);
    await window.mouse.move(box!.x + 300, box!.y + 320);
    await window.mouse.down();
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    await expect(panel.getByTestId('label-text')).toHaveValue('Text');

    // Offered, but not as something that would quietly do nothing.
    await expect(panel.getByTestId('flip-horizontal')).toBeDisabled();
    await expect(panel.getByTestId('flip-horizontal')).toHaveAttribute('title', /read backwards/i);

    // The panel still flips the panel itself.
    await window.getByTestId('parts-list').getByText('Outline').click();
    await expect(panel.getByTestId('flip-horizontal')).toBeEnabled();
  });
});

test('a cut-out joins the selected part, and an open one is refused', async () => {
  // Slice 4.3a. Each mode has one fixed result and selection only chooses the
  // part (X4); a cut-out has to enclose something (S6).
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    // Outline mode is the default, and never reads the selection.
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 600, box!.y + 450, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // The outline is selected, so the cut-out knows which part it belongs to.
    await window.getByTestId('draw-as-cut-out').click();
    await expect(window.getByTestId('draw-as-cut-out')).toHaveAttribute('aria-pressed', 'true');
    await window.mouse.move(box!.x + 330, box!.y + 280);
    await window.mouse.down();
    await window.mouse.move(box!.x + 430, box!.y + 360, { steps: 5 });
    await window.mouse.up();

    // One part, two features: a hole belongs to the piece it is cut in.
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await expect(window.getByTestId('parts-list')).toContainText('Cut-out');
    // On the material, so nothing to report.
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');

    // An open run cannot be cut out of anything, and says so rather than
    // quietly becoming a marking line, which is what used to happen.
    await window.getByTestId('tool-line').click();
    await expect(window.getByTestId('draw-as-cut-out')).toHaveAttribute('aria-pressed', 'true');
    await window.mouse.move(box!.x + 300, box!.y + 420);
    await window.mouse.down();
    await window.mouse.up();
    await window.mouse.move(box!.x + 420, box!.y + 420);
    await window.mouse.down();
    await window.mouse.up();

    await expect(window.getByTestId('tool-notice')).toContainText('nothing to cut');
    await expect(window.getByTestId('feature-count')).toHaveText('2');
  });
});

test('a refused outline keeps its points, and closing it is the correction', async () => {
  // X10, from the 4.3a review. A refusal that discards eleven clicks round a
  // gusset is a correct rule delivered as a punishment: the run stays live
  // until the user closes it or gives it up.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    const click = async (x: number, y: number) => {
      await window.mouse.move(box!.x + x, box!.y + y);
      await window.mouse.down();
      await window.mouse.up();
    };

    await window.getByTestId('tool-polyline').click();
    await expect(window.getByTestId('draw-as-outline')).toHaveAttribute('aria-pressed', 'true');

    await click(250, 200);
    await click(500, 200);
    await click(500, 400);
    // Enter finishes the run — open, which an outline may not be (S6).
    await window.keyboard.press('Enter');

    await expect(window.getByTestId('tool-notice')).toContainText('nothing to cut');
    await expect(window.getByTestId('part-count')).toHaveText('0');

    // The points are still there: clicking back on the first one closes the
    // run that was refused, rather than starting a new one.
    await click(250, 200);

    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('1');
    // The notice element only exists while there is something to say.
    await expect(window.getByTestId('tool-notice')).toHaveCount(0);
    // A cut contour, which is what an outline is — not the marking line an
    // open run used to be quietly filed as.
    await expect(window.getByTestId('property-panel')).toContainText('Cut line');
  });
});

test('an arc drawn where it cannot be cut says so instead of vanishing', async () => {
  // The arc tool had no held refusal of its own, so three clicks in Outline
  // mode drew nothing and said nothing at all (X1). Every draw tool now
  // commits through the same boundary.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-arc').click();
    await expect(window.getByTestId('draw-as-outline')).toHaveAttribute('aria-pressed', 'true');

    await window.mouse.click(box!.x + 250, box!.y + 400);
    await window.mouse.click(box!.x + 450, box!.y + 400);
    await window.mouse.click(box!.x + 350, box!.y + 300);

    await expect(window.getByTestId('tool-notice')).toContainText('nothing to cut');
    await expect(window.getByTestId('part-count')).toHaveText('0');
  });
});

test('the parts panel shows what follows what, and locks it down', async () => {
  // Slice 4.3b. The tree is where the reference graph becomes visible, and the
  // lock is what `locked` should have meant all along (D8).
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 600, box!.y + 450, { steps: 5 });
    await window.mouse.up();

    await window.getByTestId('add-stitch-line').click();
    await window.getByTestId('add-stitch-holes').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');

    // Outline ▸ Stitch line ▸ Holes, each nested a step further in.
    const panel = window.getByTestId('parts-list');
    const rows = panel.locator('.feature-row');
    await expect(rows).toHaveCount(3);
    const indents = await rows.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).style.paddingLeft),
    );
    expect(indents).toEqual(['0px', '12px', '24px']);

    // Lock the outline. It is still selectable here — the panel is the only
    // way back, because a locked feature is out of hit-testing.
    const outline = panel.locator('[data-testid^="feature-locked-"]').first();
    await outline.click();
    await expect(outline).toHaveAttribute('aria-pressed', 'true');

    await panel.locator('[data-testid^="feature-row-"]').first().click();
    await expect(window.getByTestId('selected-count')).toHaveText('1');

    // Deleting it is not merely refused: the button says why, rather than
    // opening a dialog about a delete that was never going to happen.
    const remove = window.getByTestId('property-panel').getByTestId('delete-feature');
    await expect(remove).toBeDisabled();
    await expect(remove).toHaveAttribute('title', /locked/i);

    // Unlock, and it deletes as it always did.
    await outline.click();
    await expect(outline).toHaveAttribute('aria-pressed', 'false');
    await expect(remove).toBeEnabled();
  });
});

test('a duplicated part gets its own stitching, beside the original', async () => {
  // §3.2: a duplicate is a copy with *no* relationship to its original, so the
  // copy's stitch line follows the copy's outline.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 500, box!.y + 400, { steps: 5 });
    await window.mouse.up();
    await window.getByTestId('add-stitch-line').click();

    const panel = window.getByTestId('parts-list');
    await panel.locator('[data-testid^="duplicate-part-"]').first().click();

    await expect(window.getByTestId('part-count')).toHaveText('2');
    await expect(window.getByTestId('feature-count')).toHaveText('4');
    await expect(panel).toContainText('Panel copy');
    // Nothing is off the material: the copy's stitch line follows the copy's
    // own outline, so it sits inside the copy rather than back on the original.
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
  });
});

test('hiding a part takes it off the drawing, and brings it back', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 500, box!.y + 400, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('parts-list');
    const eye = panel.locator('[data-testid^="part-visible-"]').first();

    await eye.click();
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await expect(panel.locator('[data-testid^="feature-visible-"]').first()).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await eye.click();
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
  });
});

test('selecting a part heading makes it the target for a cut-out', async () => {
  // X4 plus §3.1: selection chooses *where*, and a part heading is a way to
  // say where without picking something inside it first.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 600, box!.y + 450, { steps: 5 });
    await window.mouse.up();

    // Drop the selection the way reopening a file would.
    await window.getByTestId('tool-select').click();
    await window.mouse.click(box!.x + 100, box!.y + 550);
    await expect(window.getByTestId('selected-count')).toHaveText('0');

    const heading = window.getByTestId('parts-list').locator('[data-testid^="part-heading-"]');
    await heading.first().click();
    await expect(heading.first()).toHaveAttribute('aria-pressed', 'true');

    await window.getByTestId('tool-circle').click();
    await window.getByTestId('draw-as-cut-out').click();
    await window.mouse.move(box!.x + 400, box!.y + 320);
    await window.mouse.down();
    await window.mouse.move(box!.x + 450, box!.y + 320, { steps: 5 });
    await window.mouse.up();

    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('2');
  });
});

test('a mirrored counterpart stays matched to the piece it came from', async () => {
  // Slice 4.8a. Flip changes this piece; mirror makes a counterpart that keeps
  // following it (ADR 0012).
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 500, box!.y + 400, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('feature-count')).toHaveText('1');

    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('mirror-horizontal').click();

    // The counterpart joins the same part — a pair belongs to the piece it is
    // cut in — and is selected, because it is what you are now placing.
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await expect(window.getByTestId('parts-list')).toContainText('mirrored');

    // A selected counterpart never reads as an ordinary independent feature:
    // it is badged, its relationship is named, and the note says what the
    // fixed mirror line means before the maker meets it by accident.
    await expect(panel.getByTestId('mirrored-badge')).toBeVisible();
    await expect(panel).toContainText('Mirrored from');
    await expect(panel.getByTestId('mirror-note')).toContainText('opposite way');
    await expect(panel.getByTestId('mirror-note')).toContainText('changes the gap');
    await expect(panel.getByTestId('follows')).toBeVisible();

    // And it is marked in the dependency tree too, where it nests under the
    // piece it mirrors.
    await expect(
      window.getByTestId('parts-list').locator('[data-testid^="mirrored-mark-"]'),
    ).toHaveCount(1);

    // It has no shape of its own — the fields belong to its original.
    await expect(panel.locator('label', { hasText: /^Width/ })).toHaveCount(0);

    // And it cannot be resized: a counterpart is the size of its original.
    // The reason appears *during* the drag, while the user can still let go.
    await window.getByTestId('tool-scale').click();
    await window.mouse.move(box!.x + 620, box!.y + 400);
    await window.mouse.down();
    await window.mouse.move(box!.x + 700, box!.y + 460, { steps: 5 });

    await expect(window.getByTestId('tool-notice')).toContainText(/size/i);

    await window.mouse.up();
    // Refused means unchanged: the counterpart is still its original's size.
    await expect(window.getByTestId('feature-count')).toHaveText('2');
  });
});

test('a counterpart follows when its original is resized', async () => {
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 500, box!.y + 400, { steps: 5 });
    await window.mouse.up();

    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('mirror-horizontal').click();
    await expect(window.getByTestId('feature-count')).toHaveText('2');

    // Back to the original, and widen it.
    await window.getByTestId('tool-select').click();
    await window.getByTestId('parts-list').locator('[data-testid^="feature-row-"]').first().click();

    const width = panel.locator('label', { hasText: /^Width/ }).locator('input');
    const before = await width.inputValue();
    await width.fill(String(Number(before) + 40));
    await width.press('Enter');

    // Nothing is broken by the change: the counterpart followed rather than
    // detaching or landing off the material.
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
    await expect(window.getByTestId('feature-count')).toHaveText('2');
  });
});

test('the wallet scenario: card slots mirrored across a fold that then moves', async () => {
  // Slice 4.8b, §2 of the design, end to end. The value is not the reflection
  // — it is that the two halves stay each other's mirror while the piece is
  // still being decided.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    const panel = window.getByTestId('property-panel');

    // The shell.
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 650, box!.y + 420, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // A fold down the middle, drawn on the shell.
    await window.getByTestId('tool-line').click();
    await window.getByTestId('draw-as-fold').click();
    // Just inside the edges: a fold drawn exactly onto the outline trips the
    // sampled containment rule, which is a boundary case of DR2 and not this
    // slice's to change.
    await window.mouse.click(box!.x + 450, box!.y + 210);
    await window.mouse.click(box!.x + 450, box!.y + 410);
    await expect(window.getByTestId('feature-count')).toHaveText('2');

    // A card slot on the left half.
    await window.getByTestId('tool-rectangle').click();
    await window.getByTestId('draw-as-cut-out').click();
    await window.mouse.move(box!.x + 290, box!.y + 250);
    await window.mouse.down();
    await window.mouse.move(box!.x + 410, box!.y + 270, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('feature-count')).toHaveText('3');

    // Fold it across the crease.
    await panel.getByTestId('mirror-across-fold').click();
    await expect(window.getByTestId('feature-count')).toHaveText('4');
    await expect(panel.getByTestId('mirror-note')).toContainText('Folded across');
    await expect(panel.getByTestId('mirrored-badge')).toBeVisible();
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');

    // The counterpart cannot be dragged: it is placed by the fold.
    await window.getByTestId('tool-select').click();
    await window.getByTestId('parts-list').locator('[data-testid^="feature-row-"]').last().click();
    await window.mouse.move(box!.x + 520, box!.y + 260);
    await window.mouse.down();
    await window.mouse.move(box!.x + 560, box!.y + 300, { steps: 5 });
    await window.mouse.up();
    // Nothing broke, and the drawing still validates.
    await expect(window.getByTestId('feature-count')).toHaveText('4');
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
  });
});

test('an outline cannot be completed by mirroring it across its own fold', async () => {
  // The refusal that keeps the door open for booleans instead of building a
  // workaround: a piece of leather has one edge (S5).
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    const panel = window.getByTestId('property-panel');

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 600, box!.y + 420, { steps: 5 });
    await window.mouse.up();

    await window.getByTestId('tool-line').click();
    await window.getByTestId('draw-as-fold').click();
    await window.mouse.click(box!.x + 425, box!.y + 210);
    await window.mouse.click(box!.x + 425, box!.y + 410);

    // Select the outline and ask to fold it.
    await window.getByTestId('tool-select').click();
    await window.getByTestId('parts-list').locator('[data-testid^="feature-row-"]').first().click();

    const fold = panel.getByTestId('mirror-across-fold');
    await expect(fold).toBeDisabled();
    await expect(fold).toHaveAttribute('title', /one edge|second piece/i);
  });
});

test('a pocket dimensioned from its opening, with the edge derived outward', async () => {
  // Slice 4.9. The other direction of one relationship: the maker specifies
  // the opening and the cut edge is whatever leaves the allowance outside it.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    const panel = window.getByTestId('property-panel');

    await window.getByTestId('tool-rectangle').click();
    await window.getByTestId('draw-as-stitch-allowance').click();
    await expect(window.getByTestId('draw-as-stitch-allowance')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await window.mouse.move(box!.x + 260, box!.y + 220);
    await window.mouse.down();
    await window.mouse.move(box!.x + 560, box!.y + 400, { steps: 5 });
    await window.mouse.up();

    // One part, two features: what was drawn is the stitch line, and the edge
    // follows it.
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');

    // The stitch line is what is selected — it is what the maker dimensioned.
    await expect(panel).toContainText('Stitch line');

    // Retype the opening, and the edge follows it.
    const width = panel.locator('label', { hasText: /^Width/ }).locator('input');
    await width.fill('95');
    await width.press('Enter');
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
    await expect(window.getByTestId('feature-count')).toHaveText('2');

    // The edge is derived, so it has no shape of its own to edit.
    await window.getByTestId('parts-list').locator('[data-testid^="feature-row-"]').last().click();
    await expect(panel.getByTestId('follows')).toBeVisible();
    await expect(panel.locator('label', { hasText: /^Edge margin/ })).toBeVisible();
  });
});

test('a seam allowance can be added to a stitch line drawn earlier', async () => {
  // The common order: draw the stitching, decide on the edge after.
  await withFreshApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    const panel = window.getByTestId('property-panel');

    await window.getByTestId('tool-rectangle').click();
    await window.getByTestId('draw-as-outline').click();
    await window.mouse.move(box!.x + 250, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 600, box!.y + 420, { steps: 5 });
    await window.mouse.up();

    // A stitch line inset from that outline cannot take an allowance: its part
    // already has an edge (S5).
    await window.getByTestId('add-stitch-line').click();
    await expect(panel.getByTestId('add-allowance')).toBeDisabled();
    await expect(panel.getByTestId('add-allowance')).toHaveAttribute('title', /outline|edge/i);

    // Draw a stitch line on a part of its own, and it can.
    await window.getByTestId('tool-rectangle').click();
    await window.getByTestId('draw-as-stitch-allowance').click();
    await window.mouse.move(box!.x + 680, box!.y + 200);
    await window.mouse.down();
    await window.mouse.move(box!.x + 860, box!.y + 340, { steps: 5 });
    await window.mouse.up();

    await expect(window.getByTestId('part-count')).toHaveText('2');
    // It already has its edge, so the action is spent.
    await expect(panel.getByTestId('add-allowance')).toBeDisabled();
  });
});
