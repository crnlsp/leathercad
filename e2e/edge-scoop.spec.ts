import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * Slice 3.9a: the product spec's own example — "the card pockets are 95 × 60 mm
 * with a curved thumb scoop" — drawn, stitched on its three sewn sides, saved
 * and opened again.
 *
 * Before it, no closed outline could have a curve in it. The polyline now
 * takes an arc mid-run: A, then the arc's end, then a point it passes through;
 * L goes straight again. A and L are the Arc and Line tools' own shortcuts, so
 * the polyline claims them only while a run is live.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

function num(text: string | null): number {
  return Number.parseFloat((text ?? '').trim().replace('−', '-'));
}

/** Where a millimetre lands on screen, read from the app's own cursor readout. */
async function viewOf(window: Page): Promise<(xMm: number, yMm: number) => [number, number]> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  const readout = window.getByTestId('cursor-readout');
  const readAt = async (px: number, py: number): Promise<{ x: number; y: number }> => {
    const previous = (await readout.textContent()) ?? '';
    await window.mouse.move(box.x + px, box.y + py);
    await expect.poll(async () => (await readout.textContent()) ?? '').not.toBe(previous);
    const [x, y] = ((await readout.textContent()) ?? '').split(',').map(num);
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

test('a card pocket with a thumb scoop is drawn, stitched on three sides, and reopened', async () => {
  const file = join(tmpdir(), `leathercad-e2e-scoop-${Date.now()}.lcp`);
  const app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 840));

    const at = await viewOf(window);
    const click = (x: number, y: number) => window.mouse.click(...at(x, y));
    const polyline = window.getByTestId('tool-polyline');

    // ── The pocket: 96 × 60 mm, a 30 mm scoop 12 mm deep in its top edge ────
    await window.keyboard.press('p');
    await expect(polyline).toHaveClass(/active/);
    await click(0, 0);
    await click(96, 0);
    await click(96, 60);
    await click(63, 60);

    // A mid-run is the next segment, not the Arc tool: the run survives.
    await window.keyboard.press('a');
    await expect(polyline).toHaveClass(/active/);
    await click(33, 60); // where the scoop ends
    await click(48, 48); // a point it passes through
    await window.keyboard.press('l');
    await expect(polyline).toHaveClass(/active/);
    await click(0, 60);
    await click(0, 0); // on the first point: closed

    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('feature-count')).toHaveText('1');

    // The curve is really in the outline. A straight top would measure
    // 312.0 mm; the scoop's arc (r 15.375 mm, 41.5 mm long) makes it 323.5 —
    // give or take the pixel a click lands on.
    const panel = window.getByTestId('property-panel');
    const perimeter = async (): Promise<number> =>
      num(
        ((await panel.locator('.readout', { hasText: 'Perimeter' }).textContent()) ?? '').replace(
          'Perimeter',
          '',
        ),
      );
    await window.getByTestId('parts-list').getByText('Outline').click();
    const drawn = await perimeter();
    expect(Math.abs(drawn - 323.5)).toBeLessThan(1);

    // With no run live, A is the Arc tool again, as it always was.
    await window.keyboard.press('a');
    await expect(window.getByTestId('tool-arc')).toHaveClass(/active/);

    // ── Stitched on the three sewn sides; the scoop is the opening ──────────
    await window.keyboard.press('p');
    await window.getByTestId('draw-as-stitch').click();
    await window.getByTestId('parts-list').getByText('Outline').click();
    await click(4, 56);
    await click(4, 4);
    await click(92, 4);
    await click(92, 56);
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('feature-count')).toHaveText('2');

    await window.getByTestId('parts-list').getByText('Stitch line').click();
    await panel.getByTestId('add-stitch-holes').click();
    await expect(window.getByTestId('feature-count')).toHaveText('3');
    const holes = (await panel.getByTestId('hole-count').textContent()) ?? '';
    expect(Number(holes)).toBeGreaterThan(40);
    const verdict = (await window.getByTestId('problems-toggle').textContent()) ?? '';

    // ── Saved, and the same pocket when it is opened again ──────────────────
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save')).toHaveText('Save');
    await window.getByTestId('new').click();
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await window.getByTestId('open').click();

    await expect(window.getByTestId('feature-count')).toHaveText('3');
    await window.getByTestId('parts-list').getByText('Outline').click();
    await expect.poll(perimeter).toBe(drawn);
    await window.getByTestId('parts-list').getByText('Stitch holes').click();
    await expect(panel.getByTestId('hole-count')).toHaveText(holes);
    await expect(window.getByTestId('problems-toggle')).toHaveText(verdict);
  } finally {
    await closeApp(app);
    rmSync(file, { force: true });
  }
});
