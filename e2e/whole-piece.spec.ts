import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';

/** Q30: a piece moved by its outline, dragged or typed, takes its rivet with it. */

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
