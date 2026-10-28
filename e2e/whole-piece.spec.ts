import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { parseNumber } from '../packages/core/src/index.js';
import { closeApp } from './closeApp.js';
import { withApp } from './launchApp.js';

/**
 * Q30: a piece moved by its outline, dragged or typed, takes its rivet with it.
 * Q31: scaled by its outline, it keeps its rivet hole and slot their sizes.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

test('dragging or retyping a piece’s outline moves its rivet with it (Q30)', async () => {
  const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-piece-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    // Its own state too, so no other run's crash-recovery copy is offered here.
    env: { ...process.env, XDG_CONFIG_HOME: fresh(), XDG_STATE_HOME: fresh() },
  });
  try {
    const window = await app.firstWindow();
    window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
    await window.waitForLoadState('domcontentloaded');
    // The app starts on its start screen (8.12).
    await window.getByTestId('start-new').click();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 300, box.y + 260, { steps: 5 });
    await window.mouse.up();
    await window.getByTestId('tool-hardware').click();
    await window.mouse.click(box.x + 170, box.y + 205);

    const rows = window.locator('[data-testid^="feature-row-"]');
    await expect(rows).toHaveCount(2);
    const x = async (row: number): Promise<number> => {
      await rows.nth(row).click();
      return Number(await window.getByTestId('property-panel').getByLabel('X').inputValue());
    };
    const outline = await x(0);
    const rivet = await x(1);

    // Dragged by its outline's left edge.
    await window.getByTestId('tool-select').click();
    await window.mouse.move(box.x + 150, box.y + 200);
    await window.mouse.down();
    await window.mouse.move(box.x + 230, box.y + 200, { steps: 5 });
    await window.mouse.up();
    const moved = (await x(0)) - outline;
    expect(moved).toBeGreaterThan(5);
    // Each reading is shown to 0.01 mm.
    expect((await x(1)) - rivet).toBeCloseTo(moved, 1);

    // Retyped: the outline's X, ten millimetres on.
    await rows.nth(0).click();
    const field = window.getByTestId('property-panel').getByLabel('X');
    await field.fill(String(outline + moved + 10));
    await field.press('Enter');
    expect((await x(1)) - rivet).toBeCloseTo(moved + 10, 1);

    // Each was one step of undo.
    await window.getByTestId('undo').click();
    await window.getByTestId('undo').click();
    expect(await x(1)).toBeCloseTo(rivet, 2);
  } finally {
    await closeApp(app);
  }
});

/** Q31: a piece scaled by its outline grows, and its rivet hole and slot keep their sizes. */
test('scaling a piece by its outline keeps its rivet hole and slot their sizes (Q31)', async () => {
  await withApp(async (window) => {
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    const panel = window.getByTestId('property-panel');
    const rows = window.locator('[data-testid^="feature-row-"]');
    const read = async (row: number, field: string): Promise<number> => {
      await rows.nth(row).click();
      return parseNumber(
        await panel
          .locator('label', { hasText: new RegExp(`^${field}`) })
          .locator('input')
          .inputValue(),
      );
    };

    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 450, box.y + 350, { steps: 5 });
    await window.mouse.up();
    // A slot cut in it, and a rivet punched in it.
    await window.getByTestId('draw-as-cut-out').click();
    await window.mouse.move(box.x + 180, box.y + 180);
    await window.mouse.down();
    await window.mouse.move(box.x + 260, box.y + 220, { steps: 5 });
    await window.mouse.up();
    await window.getByTestId('tool-hardware').click();
    await window.mouse.click(box.x + 400, box.y + 300);
    await expect(rows).toHaveCount(3);

    const outline = await read(0, 'Width');
    const slot = { width: await read(1, 'Width'), height: await read(1, 'Height') };
    const rivet = await read(2, 'Diameter');
    // How far the rivet sits from the outline's X: the scale stretches it.
    const offset = async (): Promise<number> => (await read(2, 'X')) - (await read(0, 'X'));
    const apart = await offset();

    // The outline picked, and grown evenly by half again: pressed on its right
    // edge, 150 px from its centre, and dragged 75 px further.
    await rows.nth(0).click();
    await window.getByTestId('tool-scale').click();
    await window.keyboard.down('Shift');
    await window.mouse.move(box.x + 450, box.y + 250);
    await window.mouse.down();
    await window.mouse.move(box.x + 525, box.y + 250, { steps: 6 });
    await window.mouse.up();
    await window.keyboard.up('Shift');
    await window.getByTestId('tool-select').click();

    expect(await read(0, 'Width')).toBeCloseTo(outline * 1.5, 0);
    expect(await read(1, 'Width')).toBeCloseTo(slot.width, 2);
    expect(await read(1, 'Height')).toBeCloseTo(slot.height, 2);
    expect(await read(2, 'Diameter')).toBeCloseTo(rivet, 2);
    // The rivet went with the piece, where the scale sends its centre.
    expect(await offset()).toBeCloseTo(apart * 1.5, 0);

    // One step of undo.
    await window.getByTestId('undo').click();
    expect(await read(0, 'Width')).toBeCloseTo(outline, 2);
  });
});
