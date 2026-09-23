import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * Slice 4.13: one card holder, drafted the way a maker would, through every
 * part of Phase 4 at once.
 *
 * `shell.spec.ts` has a test per behaviour. This checks that they compose —
 * that a fold, a mirrored slot, a derived stitch line, a dimension and a label
 * can share one project, survive a save and reach the paper together. See
 * docs/superpowers/specs/2026-09-23-phase-4-close-out-design.md; the A-numbers
 * below are its acceptance criteria.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

type Window = Awaited<ReturnType<ElectronApplication['firstWindow']>>;

/** A number as the app writes it: negatives carry a true minus (U+2212). */
function num(text: string | null): number {
  return Number.parseFloat((text ?? '').trim().replace('\u2212', '-'));
}

/**
 * Where a millimetre lands on screen, read from the app itself.
 *
 * The scenario places everything by millimetres, so it reads the cursor
 * readout at two points and solves for the view. Changing tool no longer moves
 * the canvas (F.2, F.3), so this is read once, and again only after the view is
 * deliberately reframed. Grid snapping is off and the probes sit in the
 * canvas's empty lower-left corner, so the readout is the raw pointer position.
 */
async function viewOf(window: Window): Promise<(xMm: number, yMm: number) => [number, number]> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  const readout = window.getByTestId('cursor-readout');

  const readAt = async (px: number, py: number): Promise<{ x: number; y: number }> => {
    const previous = (await readout.textContent()) ?? '';
    await window.mouse.move(box.x + px, box.y + py);
    await expect.poll(async () => (await readout.textContent()) ?? '').not.toBe(previous);
    const [x, y] = ((await readout.textContent()) ?? '').split(',').map(num);
    return { x: x!, y: y! };
  };

  // A first move so the readout is not already showing the first probe's value.
  await window.mouse.move(box.x + 60, box.y + box.height - 60);
  const a = await readAt(20, box.height - 20);
  const b = await readAt(220, box.height - 220);
  const mmPerPx = (b.x - a.x) / 200;

  // Y is up in the model and down on screen.
  return (xMm, yMm) => [
    box.x + 20 + (xMm - a.x) / mmPerPx,
    box.y + box.height - 20 - (yMm - a.y) / mmPerPx,
  ];
}

/**
 * The window the app opens at, set explicitly. A desktop's window manager may
 * give a test a larger window than CI's virtual display does, and a layout
 * that only fails at the size CI runs (it has) should fail here too.
 */
async function atDefaultSize(instance: ElectronApplication): Promise<void> {
  await instance.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setSize(1280, 840),
  );
}

async function drag(window: Window, from: [number, number], to: [number, number]): Promise<void> {
  await window.mouse.move(...from);
  await window.mouse.down();
  await window.mouse.move(...to, { steps: 5 });
  await window.mouse.up();
}

/** A draw mode that is actually on before the canvas is touched. */
async function useTool(window: Window, tool: string, drawAs?: string): Promise<void> {
  await window.getByTestId(`tool-${tool}`).click();
  await expect(window.getByTestId(`tool-${tool}`)).toHaveClass(/active/);
  if (drawAs !== undefined) {
    await window.getByTestId(`draw-as-${drawAs}`).click();
    await expect(window.getByTestId(`draw-as-${drawAs}`)).toHaveAttribute('aria-pressed', 'true');
  }
}

function field(window: Window, label: string) {
  return window
    .getByTestId('property-panel')
    .locator('label', { hasText: new RegExp(`^${label}`) })
    .locator('input');
}

async function type(window: Window, label: string, value: number | string): Promise<void> {
  const input = field(window, label);
  await input.fill(String(value));
  await input.press('Enter');
}

function row(window: Window, name: RegExp) {
  return window
    .getByTestId('parts-list')
    .locator('[data-testid^="feature-row-"]', { hasText: name });
}

test('a card holder, from the first outline to the printed page', async () => {
  test.setTimeout(180_000);

  const file = join(tmpdir(), `leathercad-e2e-close-out-${Date.now()}.lcp`);
  const pdf = join(tmpdir(), `leathercad-e2e-close-out-${Date.now()}.pdf`);

  // What the reopened project has to match (A7).
  let holes: string;
  let spacing: string;

  const first = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  try {
    const window = await first.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await atDefaultSize(first);
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await first.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);

    const panel = window.getByTestId('property-panel');
    const problems = window.getByTestId('problems-panel');
    const features = window.getByTestId('feature-count');

    await window.getByTestId('project-name').fill('Wizytownik łączony');

    // ── The shell: drawn roughly, then typed exactly ─────────────────────────
    await useTool(window, 'rectangle', 'outline');
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await drag(
      window,
      [box.x + 120, box.y + box.height * 0.3],
      [box.x + 340, box.y + box.height * 0.3 + 110],
    );
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // Keep it where it was drawn, on whole millimetres, so everything after
    // can be placed relative to it.
    const ox = Math.round(num(await field(window, 'X').inputValue()));
    const oy = Math.round(num(await field(window, 'Y').inputValue()));
    await type(window, 'X', ox);
    await type(window, 'Y', oy);
    await type(window, 'Width', 180);
    await type(window, 'Height', 95);
    for (const corner of ['↖', '↗', '↙', '↘']) await type(window, corner, 6);
    await window.getByTestId('part-name').fill('Shell');

    // ── Stitched: a derived line at the project's margin, holes along it (A1) ─
    await panel.getByTestId('add-stitch-line').click();
    await expect(field(window, 'Edge margin')).toHaveValue('3.5');
    await panel.getByTestId('add-stitch-holes').click();
    await expect(features).toHaveText('3');

    holes = (await panel.getByTestId('hole-count').textContent()) ?? '';
    spacing = (await panel.getByTestId('achieved-spacing').textContent()) ?? '';
    expect(Number(holes)).toBeGreaterThan(100);
    expect(Math.abs(parseFloat(spacing) - 3.85) / 3.85).toBeLessThan(0.05);

    // ── A fold down the middle ───────────────────────────────────────────────
    // Just inside the edges: a fold drawn onto the outline trips DR2's sampled
    // containment, a known issue tracked apart from this slice.
    await useTool(window, 'line', 'fold');
    let at = await viewOf(window);
    await window.mouse.click(...at(ox + 90, oy + 15));
    await window.mouse.click(...at(ox + 90, oy + 80));
    await expect(features).toHaveText('4');

    // ── A card slot on the left half, mirrored across the fold (A2) ──────────
    await useTool(window, 'rectangle', 'cut-out');
    await drag(window, at(ox + 20, oy + 55), at(ox + 70, oy + 65));
    await expect(features).toHaveText('5');
    await type(window, 'X', ox + 15);
    await type(window, 'Y', oy + 60);
    await type(window, 'Width', 60);
    await type(window, 'Height', 3);

    await panel.getByTestId('mirror-across-fold').click();
    await expect(features).toHaveText('6');
    await expect(panel.getByTestId('mirror-note')).toContainText(/Mirrors .* across/);
    await expect(problems).toContainText('Nothing to fix');

    const counterpart = window.getByTestId('parts-list').locator('[data-testid^="feature-row-"]', {
      has: window.locator('[data-testid^="mirrored-mark-"]'),
    });
    await useTool(window, 'select');
    await counterpart.click();
    await expect(panel.locator('.readout').first()).toContainText('126.00 mm');

    // Widen the original; the counterpart is the same size because it is the
    // original's geometry, not a copy of it.
    await row(window, /Cut-out/)
      .first()
      .click();
    await type(window, 'Width', 64);
    await counterpart.click();
    await expect(panel.locator('.readout').first()).toContainText('134.00 mm');

    // ── A pocket drafted from its opening (A3) ───────────────────────────────
    // Drawn roughly where there is room on screen — below the shell — and then
    // typed to where it belongs, beside it: the typing is the precise part.
    await useTool(window, 'rectangle', 'stitch-allowance');
    await drag(window, at(ox + 10, oy - 60), at(ox + 60, oy - 25));
    await expect(window.getByTestId('part-count')).toHaveText('2');
    await expect(features).toHaveText('8');
    await expect(panel).toContainText('Stitch line');
    await type(window, 'X', ox + 210);
    await type(window, 'Y', oy);
    await type(window, 'Width', 90);
    await type(window, 'Height', 60);
    for (const corner of ['↖', '↗', '↙', '↘']) await type(window, corner, 0);
    await window.getByTestId('part-name').fill('Pocket');
    await expect(problems).toContainText('Nothing to fix');

    // ── A dimension across the opening, which keeps reading it (A4) ──────────
    // Frame the drawing first: the pocket may have been drawn past the edge.
    await useTool(window, 'select');
    await window.getByTestId('editor-canvas').dblclick({ position: { x: 10, y: 10 } });
    await useTool(window, 'measure');
    at = await viewOf(window);
    await window.mouse.click(...at(ox + 300, oy));
    await window.mouse.click(...at(ox + 300, oy + 60));
    await expect(features).toHaveText('9');
    await expect(panel).toContainText('Dimension');
    await expect(problems).toContainText('Nothing to fix');

    await useTool(window, 'select');
    await row(window, /Stitch line/)
      .last()
      .click();
    await type(window, 'Height', 65);
    await expect(problems).toContainText('Nothing to fix');
    await expect(features).toHaveText('9');

    // ── A label on the shell ─────────────────────────────────────────────────
    await window.getByTestId('parts-list').getByText('Shell').click();
    await useTool(window, 'text');
    await window.mouse.click(...at(ox + 115, oy + 25));
    await expect(features).toHaveText('10');
    await panel.getByTestId('label-text').fill('Zszyć przed klejeniem');
    await expect(window.getByTestId('parts-list')).toContainText('Zszyć przed klejeniem');
    await expect(problems).toContainText('Nothing to fix');

    // ── A mistake the rules catch, found from the list, fixed by typing (A5) ─
    await useTool(window, 'select');
    await row(window, /Cut-out/)
      .first()
      .click();
    await type(window, 'Y', oy + 89);
    // The slot now crosses the stitching, so the line and its holes run into it.
    await expect(problems.getByTestId('count-badge')).toHaveText('2');
    await window.getByTestId('problems-toggle').click();
    await expect(problems).toContainText('Off the material');

    // Clicking selects what is wrong, not what was just edited.
    await problems.getByTestId('problem-row').first().click();
    await expect(panel.getByTestId('follows')).toContainText('Shell › Outline');

    await row(window, /Cut-out/)
      .first()
      .click();
    await type(window, 'Y', oy + 60);
    await expect(window.getByTestId('count-badge')).toHaveCount(0);
    await expect(problems).toContainText('Nothing to fix');

    // ── Deleting the fold asks, and freezing keeps the slot (A6) ─────────────
    await row(window, /Fold/).first().click();
    await panel.getByTestId('delete-feature').click();
    const dialog = window.getByTestId('delete-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Cut-out/);
    await dialog.getByTestId('delete-freeze').click();
    await expect(dialog).toHaveCount(0);
    await expect(features).toHaveText('9');

    await window.getByTestId('undo').click();
    await expect(features).toHaveText('10');
    await counterpart.click();
    await expect(panel.getByTestId('mirror-note')).toContainText(/Mirrors .* across/);
    await expect(problems).toContainText('Nothing to fix');

    // ── Saved ────────────────────────────────────────────────────────────────
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save')).not.toContainText('•');
    expect(existsSync(file)).toBe(true);
  } finally {
    await closeApp(first);
  }

  // ── Reopened in a fresh instance: parameters in, the same numbers out (A7) ─
  const second = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  try {
    const window = await second.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await atDefaultSize(second);
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await second.evaluate(
      ({ dialog, shell }, paths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.file] });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.pdf });
        // Do not launch a real PDF viewer during a test run.
        shell.openPath = async () => '';
      },
      { file, pdf },
    );

    const panel = window.getByTestId('property-panel');
    await window.getByTestId('open').click();

    await expect(window.getByTestId('part-count')).toHaveText('2');
    await expect(window.getByTestId('feature-count')).toHaveText('10');
    await expect(window.getByTestId('problems-panel')).toContainText('Nothing to fix');
    await expect(window.getByTestId('parts-list')).toContainText('Zszyć przed klejeniem');

    await row(window, /Stitch holes/)
      .first()
      .click();
    await expect(panel.getByTestId('hole-count')).toHaveText(holes);
    await expect(panel.getByTestId('achieved-spacing')).toHaveText(spacing);

    await window
      .getByTestId('parts-list')
      .locator('[data-testid^="feature-row-"]', {
        has: window.locator('[data-testid^="mirrored-mark-"]'),
      })
      .click();
    await expect(panel.getByTestId('mirror-note')).toContainText(/Mirrors .* across/);

    // ── And onto paper (A8) ──────────────────────────────────────────────────
    await window.getByTestId('export-pdf').click();
    await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
    await expect(window.getByTestId('file-error')).toHaveCount(0);
    await expect(window.getByTestId('export-notice')).toHaveCount(0);

    const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    expect(info).toMatch(/Page size:\s+595\.276 x 841\.89 pts \(A4\)/);
  } finally {
    await closeApp(second);
    rmSync(file, { force: true });
    rmSync(pdf, { force: true });
  }
});
