import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test, type Page } from '@playwright/test';

import { closeApp } from '../closeApp.js';

/**
 * The README's pictures, taken from the real app: `pnpm docs:media`.
 *
 * Not a test of anything. It drafts the bifold wallet from
 * `docs/getting-started.md` the way a maker would — outer, lining and a card
 * pocket with a thumb scoop — and writes what it saw to `docs/images/`:
 *
 * - `design.png`, the finished pattern on the board;
 * - `sheets.png`, the same pieces on paper in the Sheets view;
 * - `print.png`, the first page of the exported PDF, rendered by poppler;
 * - `demo.gif`, the drafting itself, from the recorded video.
 *
 * Needs `pnpm build` first (the script runs it), a display (xvfb-run on a
 * server), and poppler, ffmpeg, gifsicle and pngquant on the PATH. Run it
 * again when the interface changes, and look at every image before committing.
 */

const ROOT = resolve(import.meta.dirname, '../..');
const DESKTOP_DIR = resolve(ROOT, 'apps/desktop');
const OUT = resolve(ROOT, 'docs/images');

/** The window the pictures are taken at: wide enough for every panel. */
const SIZE = { width: 1280, height: 800 };

/** A number as the app writes it: negatives carry a true minus (U+2212). */
function num(text: string | null): number {
  return Number.parseFloat((text ?? '').trim().replace('−', '-'));
}

/**
 * Where a millimetre lands on screen, read from the app's own cursor readout.
 *
 * Each probe waits for the readout to settle: a read taken the moment the
 * pointer arrives can still show where it was, and one stale probe skews every
 * click after it by millimetres. It probes with Select, which reports the
 * pointer itself; every caller picks its own tool afterwards.
 */
async function viewOf(window: Page): Promise<(xMm: number, yMm: number) => [number, number]> {
  // A drawing tool snaps the readout to nearby geometry; Select reports the pointer.
  await window.keyboard.press('Escape');
  await window.getByTestId('tool-select').click();
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  const readout = window.getByTestId('cursor-readout');
  const readAt = async (px: number, py: number): Promise<{ x: number; y: number }> => {
    await window.mouse.move(box.x + px, box.y + py);
    let last = '';
    await expect
      .poll(async () => {
        await window.waitForTimeout(60);
        const now = (await readout.textContent()) ?? '';
        const settled = now === last && now.includes(',');
        last = now;
        return settled;
      })
      .toBe(true);
    const [x, y] = last.split(',').map(num);
    return { x: x!, y: y! };
  };
  const a = await readAt(20, box.height - 20);
  const b = await readAt(260, box.height - 260);
  const mmPerPx = (b.x - a.x) / 240;
  return (xMm, yMm) => [
    box.x + 20 + (xMm - a.x) / mmPerPx,
    box.y + box.height - 20 - (yMm - a.y) / mmPerPx,
  ];
}

function field(window: Page, label: string) {
  return window
    .getByTestId('property-panel')
    .locator('label', { hasText: new RegExp(`^${label}`) })
    .locator('input');
}

/** Types a value the way a person does, so the demo shows it being typed. */
async function type(window: Page, label: string, value: number | string): Promise<void> {
  const input = field(window, label);
  await input.click();
  await input.fill('');
  await input.pressSequentially(String(value), { delay: 60 });
  await input.press('Enter');
}

async function useTool(window: Page, tool: string, drawAs?: string): Promise<void> {
  await window.getByTestId(`tool-${tool}`).click();
  await expect(window.getByTestId(`tool-${tool}`)).toHaveClass(/active/);
  if (drawAs !== undefined) {
    await window.getByTestId(`draw-as-${drawAs}`).click();
    await expect(window.getByTestId(`draw-as-${drawAs}`)).toHaveAttribute('aria-pressed', 'true');
  }
}

async function drag(window: Page, from: [number, number], to: [number, number]): Promise<void> {
  await window.mouse.move(...from);
  await window.mouse.down();
  await window.mouse.move(...to, { steps: 12 });
  await window.mouse.up();
}

/** Frames the whole pattern, as a double-click on empty board does. */
async function fit(window: Page): Promise<void> {
  await useTool(window, 'select');
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  // On the left ruler: nothing is drawn there, and the legend sits top right.
  await window.mouse.dblclick(box.x + 12, box.y + box.height / 2);
}

/** A beat, so the demo can be followed. */
const pause = (window: Page, ms = 700): Promise<void> => window.waitForTimeout(ms);

/** Which part's which feature: each part is a section of Parts, its features rows in it. */
function part(window: Page, name?: string) {
  const sections = window.getByTestId('parts-list').locator('[data-testid^="part-section-"]');
  return name === undefined ? sections.last() : sections.filter({ hasText: name });
}

function row(window: Page, name: string | undefined, feature: string) {
  return part(window, name).locator('[data-testid^="feature-row-"]', { hasText: feature }).first();
}

test('README media', async () => {
  test.setTimeout(300_000);

  mkdirSync(OUT, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'leathercad-media-'));
  const pdf = join(work, 'wallet.pdf');

  const launchedAt = Date.now();
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    recordVideo: { dir: work, size: SIZE },
  });
  // When the demo starts and stops, in milliseconds into the recording.
  const demo = { from: 0, to: 0 };

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(size.width, size.height);
    }, SIZE);
    await app.evaluate(({ dialog, shell }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      // Never open a real viewer.
      shell.openPath = async () => '';
    }, pdf);
    await pause(window, 500);
    demo.from = Date.now() - launchedAt;

    await window.getByTestId('project-name').fill('Bifold wallet');
    const panel = window.getByTestId('property-panel');

    // ── The outer: drawn roughly, then typed exactly ────────────────────────
    let at = await viewOf(window);
    await useTool(window, 'rectangle', 'outline');
    await drag(window, at(0, 0), at(120, 60));
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('part-name').fill('Outer');
    await type(window, 'X', 0);
    await type(window, 'Y', 0);
    await type(window, 'Width', 200);
    await type(window, 'Height', 95);
    for (const corner of ['↖', '↗', '↙', '↘']) await type(window, corner, 5);
    await fit(window);
    await pause(window);

    // ── Stitched 3 mm in, holes at the iron's 3.85 mm pitch ─────────────────
    await row(window, 'Outer', 'Outline').click();
    await panel.getByTestId('add-stitch-line').click();
    await type(window, 'Edge margin', 3);
    await pause(window, 400);
    await panel.getByTestId('add-stitch-holes').click();
    await expect(panel.getByTestId('hole-count')).not.toBeEmpty();
    await pause(window, 1200);

    // ── The fold down the middle ────────────────────────────────────────────
    at = await viewOf(window);
    await row(window, 'Outer', 'Outline').click();
    await useTool(window, 'line', 'fold');
    await drag(window, at(100, 8), at(100, 87));
    await expect(window.getByTestId('feature-count')).toHaveText('4');
    await window.keyboard.press('Escape');
    await pause(window);

    // ── The lining, 2 mm smaller all round ──────────────────────────────────
    await useTool(window, 'rectangle', 'outline');
    await drag(window, at(0, -40), at(80, -10));
    await window.getByTestId('part-name').fill('Lining');
    await type(window, 'X', 2);
    await type(window, 'Y', -110);
    await type(window, 'Width', 196);
    await type(window, 'Height', 91);
    for (const corner of ['↖', '↗', '↙', '↘']) await type(window, corner, 4);
    await fit(window);
    at = await viewOf(window);
    await row(window, 'Lining', 'Outline').click();
    await useTool(window, 'line', 'fold');
    await drag(window, at(100, -104), at(100, -25));
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('feature-count')).toHaveText('6');
    await pause(window);

    // ── A card pocket with a thumb scoop, stitched on three sides ───────────
    // Under the lining, centred: the pattern then fills the board's frame.
    const px = 52;
    const py = -200;
    // Room below the lining: zoom out around the top of the board, which
    // stays put while the view grows downwards.
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.move(board.x + board.width / 2, board.y + 40);
    await window.mouse.wheel(0, 300);
    await pause(window, 300);
    at = await viewOf(window);
    await useTool(window, 'select');
    await window.keyboard.press('p');
    await window.getByTestId('draw-as-outline').click();
    const click = (x: number, y: number) => window.mouse.click(...at(px + x, py + y));
    await click(0, 0);
    await click(95, 0);
    await click(95, 60);
    await click(63, 60);
    await window.keyboard.press('a');
    await click(32, 60);
    await click(47.5, 48);
    await window.keyboard.press('l');
    await click(0, 60);
    await click(0, 0);
    await expect(window.getByTestId('feature-count')).toHaveText('7');
    await pause(window, 400);

    // Close in on the pocket, so the stitch line's points land where they are
    // aimed rather than snapping to the outline a few millimetres away: bring
    // it to the middle of the board (middle-drag pans), then zoom around it.
    await fit(window);
    at = await viewOf(window);
    const middle = (await window.getByTestId('editor-canvas').boundingBox())!;
    const centre: [number, number] = [middle.x + middle.width / 2, middle.y + middle.height / 2];
    await window.mouse.move(...at(px + 47.5, py + 30));
    await window.mouse.down({ button: 'middle' });
    await window.mouse.move(...centre, { steps: 10 });
    await window.mouse.up({ button: 'middle' });
    await window.mouse.wheel(0, -350);
    await pause(window, 300);
    at = await viewOf(window);
    await window.keyboard.press('p');
    await window.getByTestId('draw-as-stitch').click();
    await row(window, undefined, 'Outline').click();
    const stitch = (x: number, y: number) => window.mouse.click(...at(px + x, py + y));
    await stitch(4, 56);
    await stitch(4, 4);
    await stitch(91, 4);
    await stitch(91, 56);
    await window.keyboard.press('Enter');
    await row(window, undefined, 'Stitch line').click();
    await panel.getByTestId('add-stitch-holes').click();
    await expect(panel.getByTestId('hole-count')).not.toBeEmpty();
    await pause(window, 400);

    await row(window, undefined, 'Outline').click();
    await window.getByTestId('part-name').fill('Card pocket');
    await type(window, 'Cut', 2);
    await pause(window);

    // ── A dimension that reads the drawing: the pocket's width ─────────────
    await fit(window);
    at = await viewOf(window);
    await window.keyboard.press('m');
    await window.mouse.click(...at(px, py));
    await window.mouse.click(...at(px + 95, py));
    await expect(panel.getByTestId('dimension-value')).toContainText('95.0');
    await pause(window);

    // ── The finished pattern ────────────────────────────────────────────────
    // A clean pattern, or the README would be showing a mistake.
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
    await fit(window);
    await row(window, 'Outer', 'Stitch holes').click();
    await pause(window, 1500);
    await window.screenshot({ path: join(OUT, 'design.png') });

    // ── On paper ────────────────────────────────────────────────────────────
    await window.getByTestId('view-sheets').click();
    await expect(window.getByTestId('sheets-summary')).not.toBeEmpty();
    // Off the button, or its tooltip is in the picture.
    const sheetsBoard = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.move(
      sheetsBoard.x + sheetsBoard.width - 20,
      sheetsBoard.y + sheetsBoard.height - 20,
    );
    await pause(window, 1500);
    await window.screenshot({ path: join(OUT, 'sheets.png') });
    demo.to = Date.now() - launchedAt;

    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 15_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);
  } finally {
    await closeApp(app);
  }

  // ── What prints: the first sheet, as a viewer would show it ───────────────
  execFileSync('pdftoppm', [
    '-png',
    '-r',
    '110',
    '-f',
    '1',
    '-l',
    '1',
    '-singlefile',
    pdf,
    join(work, 'print'),
  ]);
  renameSync(join(work, 'print.png'), join(OUT, 'print.png'));

  // ── The demo, from the recorded video ─────────────────────────────────────
  const video = readdirSync(work).find((name) => name.endsWith('.webm'));
  expect(video).toBeDefined();
  const start = (demo.from / 1000).toFixed(2);
  const length = ((demo.to - demo.from) / 1000).toFixed(2);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    start,
    '-t',
    length,
    '-i',
    join(work, video!),
    '-vf',
    'fps=7,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none',
    join(work, 'demo.gif'),
  ]);
  execFileSync('gifsicle', [
    '-O3',
    '--lossy=60',
    join(work, 'demo.gif'),
    '-o',
    join(OUT, 'demo.gif'),
  ]);

  for (const still of ['design.png', 'sheets.png', 'print.png']) {
    try {
      execFileSync('pngquant', [
        '--force',
        '--skip-if-larger',
        '--ext',
        '.png',
        '--quality',
        '70-95',
        join(OUT, still),
      ]);
    } catch (error) {
      // 98 and 99: the quantised image would be larger or worse; the original stays.
      const status = (error as { status?: number }).status;
      if (status !== 98 && status !== 99) throw error;
    }
  }
  rmSync(work, { recursive: true, force: true });
});
