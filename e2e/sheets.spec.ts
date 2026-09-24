import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';

import { closeApp } from './closeApp.js';
import { PRINT_TEST } from './printTest.js';

/**
 * The sheet workflow (7.4a–7.4d): the maker's question, answered before
 * printing — how many sheets, what goes on each, where a large piece is joined,
 * and what the paper will look like — from the one sheet plan the PDF writes.
 *
 * Every test opens the 7.7 print test: an outer panel and a card pocket that
 * pack onto one sheet of A4 portrait, and a 250 mm strap taped across two more.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

/** The screen-only furniture colour, `SHEET.furniture` (#c22a8c). */
const FURNITURE = [0xc2, 0x2a, 0x8c] as const;

interface Session {
  readonly app: ElectronApplication;
  readonly window: Page;
  readonly pdf: string;
}

async function withPrintTest(body: (session: Session) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-sheets-'));
  const pdf = join(dir, 'print-test.pdf');
  const app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await app.evaluate(
      ({ dialog, shell, BrowserWindow }, paths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.project] });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.pdf });
        // Do not launch a real PDF viewer during a test run.
        shell.openPath = async () => '';
        BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000);
      },
      { project: PRINT_TEST, pdf },
    );
    await window.getByTestId('open').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await body({ app, window, pdf });
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The Parts print line of the part with this name. */
function printLine(window: Page, name: string): Locator {
  return window
    .getByTestId('parts-list')
    .locator('section', { has: window.getByRole('button', { name, exact: false }) })
    .locator('[data-testid^="part-print-"]')
    .first();
}

/** How many pixels of a canvas are the not-ink furniture colour. */
async function furniturePixels(canvas: Locator): Promise<number> {
  return canvas.evaluate((element, colour) => {
    const c = element as HTMLCanvasElement;
    const context = c.getContext('2d');
    if (context === null) return 0;
    const { data } = context.getImageData(0, 0, c.width, c.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const d =
        Math.abs(data[i]! - colour[0]) +
        Math.abs(data[i + 1]! - colour[1]) +
        Math.abs(data[i + 2]! - colour[2]);
      if (d < 60) count += 1;
    }
    return count;
  }, FURNITURE);
}

/** Pages in a PDF, as pdfinfo reads them. */
function pageCount(pdf: string): number {
  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  return Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
}

/**
 * Whether any page of a PDF has a coloured pixel: everything LeatherCAD prints
 * is black or grey, so colour on paper means screen furniture leaked.
 */
function hasColour(pdf: string): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-colour-'));
  try {
    execFileSync('pdftoppm', ['-r', '40', pdf, join(dir, 'page')]);
    const pages = execFileSync('ls', [dir], { encoding: 'utf8' }).trim().split('\n');
    return pages.some((file) => {
      const bytes = readFileSync(join(dir, file));
      // P6 header: "P6\n<w> <h>\n255\n", then RGB triples.
      let newlines = 0;
      let start = 0;
      while (newlines < 3) if (bytes[start++] === 0x0a) newlines += 1;
      for (let i = start; i + 2 < bytes.length; i += 3) {
        const r = bytes[i]!;
        const g = bytes[i + 1]!;
        const b = bytes[i + 2]!;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 24) return true;
      }
      return false;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Parts says where each part prints, and why a part does not (7.4b)', async () => {
  await withPrintTest(async ({ window }) => {
    await expect(printLine(window, 'Outer panel')).toHaveText('Sheet 1');
    await expect(printLine(window, 'Pocket')).toHaveText('Sheet 1');
    await expect(printLine(window, 'Strap')).toHaveText('Sheets 2–3, taped');

    // Turned, everything fits whole on one sheet.
    await window.getByTestId('paper').selectOption('A4 landscape');
    for (const name of ['Outer panel', 'Pocket', 'Strap']) {
      await expect(printLine(window, name), name).toHaveText('Sheet 1');
    }
    await window.getByTestId('undo').click();

    // Hidden, the strap is left off the paper, and the count says so too.
    const strap = window.getByTestId('parts-list').locator('section', { hasText: 'Strap' });
    await strap.locator('[data-testid^="part-visible-"]').click();
    await expect(printLine(window, 'Strap')).toHaveText(/^Not printed\s*It is hidden\.$/);
    await expect(window.getByTestId('paper').locator('option:checked')).toHaveText(
      '1 sheet of A4, portrait',
    );
  });
});

test('the board shows where a taped piece joins, and the joins never reach paper (7.4b)', async () => {
  await withPrintTest(async ({ window, pdf }) => {
    const canvas = window.getByTestId('editor-canvas');
    // A4 portrait tapes the strap: its join is drawn on the board.
    await expect.poll(() => furniturePixels(canvas)).toBeGreaterThan(40);

    // A4 landscape holds it whole: no join, no furniture.
    await window.getByTestId('paper').selectOption('A4 landscape');
    await expect.poll(() => furniturePixels(canvas)).toBe(0);

    // Back on A4 portrait, the PDF has the three sheets the plan promised, all
    // ink: the board's magenta join is screen furniture and prints as grey.
    await window.getByTestId('undo').click();
    await expect.poll(() => furniturePixels(canvas)).toBeGreaterThan(40);
    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('export-notice')).toBeVisible();
    expect(pageCount(pdf)).toBe(3);
    expect(hasColour(pdf)).toBe(false);
  });
});

/** A fingerprint of what the canvas shows. */
async function canvasImage(canvas: Locator): Promise<string> {
  return canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
}

test('the Sheets view shows the plan, and changing the paper changes it (7.4c)', async () => {
  await withPrintTest(async ({ window }) => {
    const canvas = window.getByTestId('editor-canvas');
    await window.getByTestId('view-sheets').click();
    await expect(canvas).toHaveAttribute('data-view', 'sheets');
    await expect(window.getByTestId('view-sheets')).toHaveAttribute('aria-pressed', 'true');
    await expect(window.getByTestId('sheets-summary')).toHaveText(
      '3 sheets of A4, portrait. Strap is taped across sheets 2–3.',
    );
    // No tool acts on paper: Draw as and the tool hint make way for the plan,
    // and the rail shows Select.
    await expect(window.getByTestId('draw-as-outline')).toHaveCount(0);
    await expect(window.getByTestId('tool-select')).toHaveClass(/active/);
    // The sheet numbers are drawn, in the not-ink colour.
    await expect.poll(() => furniturePixels(canvas)).toBeGreaterThan(40);

    const before = await canvasImage(canvas);
    await window.getByTestId('paper').selectOption('A4 landscape');
    await expect(window.getByTestId('sheets-summary')).toHaveText('1 sheet of A4, landscape.');
    await expect.poll(() => canvasImage(canvas)).not.toBe(before);

    // One undo step brings the three sheets back.
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('sheets-summary')).toHaveText(
      '3 sheets of A4, portrait. Strap is taped across sheets 2–3.',
    );
  });
});

test('Design and Sheets each keep their camera, and switching changes nothing (7.4c)', async () => {
  await withPrintTest(async ({ window, app }) => {
    const canvas = window.getByTestId('editor-canvas');
    await window.getByTestId('tool-select').click();
    const design = await canvasImage(canvas);

    // By shortcut, and back by the menu.
    await window.keyboard.press('Control+2');
    await expect(canvas).toHaveAttribute('data-view', 'sheets');
    await app.evaluate(({ Menu }) => {
      const view = Menu.getApplicationMenu()?.items.find((item) => item.label === 'View');
      view?.submenu?.items.find((item) => item.label === 'Design')?.click();
    });
    await expect(canvas).toHaveAttribute('data-view', 'design');
    await expect.poll(() => canvasImage(canvas)).toBe(design);
    await expect(window.getByTestId('save-state')).not.toHaveText('Unsaved changes');

    // And by the menu to the sheets.
    await app.evaluate(({ Menu }) => {
      const view = Menu.getApplicationMenu()?.items.find((item) => item.label === 'View');
      view?.submenu?.items.find((item) => item.label === 'Sheets')?.click();
    });
    await expect(canvas).toHaveAttribute('data-view', 'sheets');
    await window.keyboard.press('Control+1');
    await expect(canvas).toHaveAttribute('data-view', 'design');
  });
});

test('a drawing tool on the Sheets view goes back to the board, and Delete deletes nothing (7.4c)', async () => {
  await withPrintTest(async ({ window }) => {
    const canvas = window.getByTestId('editor-canvas');
    // Something selected, then the sheets.
    await window.locator('[data-testid^="part-heading-"]', { hasText: 'Strap' }).click();
    await window.getByTestId('view-sheets').click();
    await window.keyboard.press('Delete');
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.getByTestId('undo')).toBeDisabled();

    // R is the rectangle tool: the board, with the rectangle.
    await window.keyboard.press('r');
    await expect(canvas).toHaveAttribute('data-view', 'design');
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/active/);
    await expect(window.getByTestId('draw-as-outline')).toBeVisible();
  });
});

/** The status bar's readout: coordinates on the board, the sheet on the Sheets view. */
function readout(window: Page): Locator {
  return window.getByTestId('cursor-readout');
}

/**
 * Where a sheet is on screen, found the way a maker would: by pointing and
 * reading the status bar's "Sheet 2 of 3".
 */
async function sheetBox(
  window: Page,
  label: string,
): Promise<{ left: number; right: number; top: number; bottom: number }> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  const on = async (x: number, y: number): Promise<boolean> => {
    await window.mouse.move(x, y);
    return (await readout(window).textContent()) === label;
  };
  // Across the canvas's middle for its sides, then down its middle for its top
  // and bottom: sheets sit in rows, so a row through the middle meets them.
  const xs: number[] = [];
  for (const y of [0.35, 0.5, 0.65].map((f) => box.y + box.height * f)) {
    for (let x = box.x + 8; x < box.x + box.width; x += 12) if (await on(x, y)) xs.push(x);
    if (xs.length > 0) {
      const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
      const ys: number[] = [];
      for (let yy = box.y + 8; yy < box.y + box.height; yy += 6)
        if (await on(middle, yy)) ys.push(yy);
      return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      };
    }
  }
  throw new Error(`no point on ${label}`);
}

/** Parses "12.50" and "−3.2 mm" alike. */
function num(text: string): number {
  return Number(text.replace('−', '-').replace(/[^\d.-]/g, ''));
}

/** Where a millimetre of the board lands on screen, read from the status bar. */
async function boardView(window: Page): Promise<(xMm: number, yMm: number) => [number, number]> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  const readAt = async (px: number, py: number): Promise<{ x: number; y: number }> => {
    const previous = (await readout(window).textContent()) ?? '';
    await window.mouse.move(box.x + px, box.y + py);
    await expect.poll(async () => (await readout(window).textContent()) ?? '').not.toBe(previous);
    const [x, y] = ((await readout(window).textContent()) ?? '').split(',').map(num);
    return { x: x!, y: y! };
  };
  await window.mouse.move(box.x + 60, box.y + box.height - 60);
  const a = await readAt(20, box.height - 20);
  const b = await readAt(220, box.height - 220);
  const mmPerPx = (b.x - a.x) / 200;
  return (xMm, yMm) => [
    box.x + 20 + (xMm - a.x) / mmPerPx,
    box.y + box.height - 20 - (yMm - a.y) / mmPerPx,
  ];
}

test('the maker’s journey: design, paper, sheets, and a PDF that is what was shown (7.4d)', async () => {
  await withPrintTest(async ({ app, window, pdf }) => {
    const paper = window.getByTestId('paper');
    const summary = window.getByTestId('sheets-summary');
    const strapSection = window.locator('[data-testid^="part-section-"]', { hasText: 'Strap' });

    // 1. The paper says what it will print, before anything is exported.
    await expect(paper.locator('option:checked')).toHaveText(
      '3 sheets of A4, portrait (Strap taped)',
    );
    await expect(printLine(window, 'Strap')).toHaveText('Sheets 2–3, taped');

    // 2. The sheets: the same answer, in pictures and in words.
    await window.getByTestId('view-sheets').click();
    await expect(summary).toHaveText('3 sheets of A4, portrait. Strap is taped across sheets 2–3.');

    // 3. Pointing at the strap on sheet 2: the status bar names the sheet,
    //    Parts lights the strap's row, and a click selects the strap.
    const second = await sheetBox(window, 'Sheet 2 of 3');
    const width = second.right - second.left;
    const height = second.bottom - second.top;
    const target = { x: second.left + width * 0.62, y: second.top + height * 0.4 };
    let found = false;
    for (let dy = -12; dy <= 12 && !found; dy += 3) {
      await window.mouse.move(target.x, target.y + dy);
      found = /hovered/.test((await strapSection.getAttribute('class')) ?? '');
      if (found) target.y += dy;
    }
    expect(found, 'the strap on sheet 2 lights its Parts row').toBe(true);
    await expect(readout(window)).toHaveText('Sheet 2 of 3');
    await window.mouse.click(target.x, target.y);
    // Its outline is selected, as a click on the board would select it, and
    // Properties shows the part.
    const strapOutline = strapSection.locator('[data-testid^="feature-row-"]', {
      hasText: 'Outline',
    });
    await expect(strapOutline).toHaveClass(/selected/);
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await expect(window.getByTestId('part-name')).toHaveValue('Strap');

    // Dragging it moves nothing, and says why.
    await window.mouse.move(target.x, target.y);
    await window.mouse.down();
    await window.mouse.move(target.x + 40, target.y + 30, { steps: 5 });
    await expect(window.getByTestId('sheets-notice')).toContainText(
      'LeatherCAD places pieces on sheets for you.',
    );
    await window.mouse.up();
    await expect(window.getByTestId('sheets-notice')).toHaveCount(0);
    await expect(summary).toHaveText('3 sheets of A4, portrait. Strap is taped across sheets 2–3.');
    await expect(window.getByTestId('undo')).toBeDisabled();

    // The selection is the board's too.
    await window.getByTestId('view-design').click();
    await expect(strapOutline).toHaveClass(/selected/);
    await expect(window.getByTestId('selected-count')).toHaveText('1');

    // 4. Moving the strap on the board moves nothing on paper.
    await window.getByTestId('tool-select').click();
    const at = await boardView(window);
    const [sx, sy] = at(200, 0);
    await window.mouse.move(sx, sy);
    await window.mouse.down();
    const [tx, ty] = at(260, -60);
    await window.mouse.move(tx, ty, { steps: 8 });
    await window.mouse.up();
    // A move is an edit: undo has something to undo.
    await expect(window.getByTestId('undo')).toBeEnabled();
    await expect(printLine(window, 'Strap')).toHaveText('Sheets 2–3, taped');
    await expect(paper.locator('option:checked')).toHaveText(
      '3 sheets of A4, portrait (Strap taped)',
    );

    // 5. Nor does the window's size.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1100, 760));
    await window.getByTestId('view-sheets').click();
    await expect(summary).toHaveText('3 sheets of A4, portrait. Strap is taped across sheets 2–3.');

    // 6. Export: the PDF is the plan that was shown — three A4 portrait sheets.
    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('export-notice')).toBeVisible();
    expect(pageCount(pdf)).toBe(3);
    const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    expect(info).toMatch(/Page size:\s+595\.276 x 841\.89 pts/);
    expect(hasColour(pdf)).toBe(false);
  });
});

test('what does not print is said, in Parts, in the sheets and in the PDF (7.4d)', async () => {
  await withPrintTest(async ({ window, pdf }) => {
    // Hide the panel's stitch holes: the panel still prints, without them.
    const panel = window.locator('[data-testid^="part-section-"]', { hasText: 'Outer panel' });
    const holes = panel.locator('[data-testid^="feature-row-"]', { hasText: 'Stitch holes' });
    const holesId = ((await holes.getAttribute('data-testid')) ?? '').replace('feature-row-', '');
    await window.getByTestId(`feature-visible-${holesId}`).click();
    await expect(printLine(window, 'Outer panel')).toHaveText(
      /^Sheet 1\s*1 hidden feature isn't printed\.$/,
    );

    // Hide the strap: it leaves the paper, and the plan shrinks to one sheet.
    const strap = window.locator('[data-testid^="part-section-"]', { hasText: 'Strap' });
    await strap.locator('[data-testid^="part-visible-"]').click();
    await window.getByTestId('view-sheets').click();
    await expect(window.getByTestId('sheets-summary')).toHaveText(
      "1 sheet of A4, portrait. Strap isn't printed.",
    );
    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => pageCount(pdf)).toBe(1);
  });
});

test('an empty project is one scale-check sheet, on screen and in the PDF (7.4d)', async () => {
  await withPrintTest(async ({ window, pdf }) => {
    await window.getByTestId('new').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await expect(window.getByTestId('paper').locator('option:checked')).toHaveText(
      '1 sheet of A4, portrait, scale check only',
    );
    await window.getByTestId('view-sheets').click();
    await expect(window.getByTestId('sheets-summary')).toHaveText(
      '1 sheet of A4, portrait, scale check only.',
    );
    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => pageCount(pdf)).toBe(1);
  });
});
