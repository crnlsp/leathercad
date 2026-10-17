import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { readoutAt } from './cursorReadout.js';
import { launchApp } from './launchApp.js';

/**
 * U.17, R-14: the bar under the selected piece — how its stitching came out,
 * in the numbers and words Properties shows, and *Next: Stitch line › Stitch
 * holes › Seam allowance*, the first not made a button that makes it with My
 * tools' values, one undo step. F6 goes into it and out again, by whatever
 * key the maker gave it; Settings › Appearance turns it off, for good. It
 * never covers the piece, at any zoom.
 */

const fresh = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-bar-'));

async function launch(
  configHome: string = fresh(),
): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await launchApp({ env: { XDG_CONFIG_HOME: configHome } });
  const window = await app.firstWindow();
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  return { app, window };
}

async function openSample(window: Page): Promise<void> {
  await window.getByTestId('open-sample').click();
  await expect(window.getByTestId('part-count')).toHaveText('3');
}

/** Picks a feature in Parts, gives the keys to the board, and frames the piece at 50 %. */
async function pick(window: Page, row: string): Promise<void> {
  await window.getByTestId(`feature-row-${row}`).click();
  await window.getByTestId('editor-canvas').focus();
  await window.keyboard.press('Shift+Digit2');
  await zoomOutTo(window, 50);
  await window.getByTestId('editor-canvas').focus();
}

async function zoomOutTo(window: Page, percent: number): Promise<void> {
  const level = window.getByTestId('zoom-level');
  for (let i = 0; i < 20; i++) {
    const shown = Number.parseInt((await level.textContent()) ?? '', 10);
    if (shown <= percent) return;
    await window.getByTestId('zoom-out').click();
  }
}

const bar = (window: Page): Locator => window.getByTestId('selection-bar');
const summary = (window: Page): Locator => window.getByTestId('selection-bar-summary');
const step = (window: Page): Locator => window.getByTestId('selection-bar-step');

test('the outer’s stitching reads as Properties reads it, every step done (U.17)', async () => {
  const { app, window } = await launch();
  try {
    await openSample(window);
    await pick(window, 'outer-holes');
    await expect(bar(window)).toBeVisible();

    // The numbers Properties shows beside it, the same.
    const panel = window.getByTestId('property-panel');
    const holes = (await panel.getByTestId('hole-count').textContent())!;
    const spacing = (await panel.getByTestId('achieved-spacing').textContent())!.replace(
      /\s*mm$/,
      '',
    );
    const runs = (await panel.getByTestId('hole-runs').textContent())!;
    expect([holes, spacing, runs]).toEqual(['146', '3.85', '24 · 51 · 24 · 51']);
    await expect(summary(window)).toContainText(`${holes} holes`);
    await expect(summary(window)).toContainText(`${spacing} mm, pitch 3.85`);
    await expect(summary(window)).toContainText(`runs ${runs}`);
    await expect(summary(window)).toContainText('Cut ×1');
    // It matches: a check, and no words for it on screen.
    await expect(window.getByTestId('selection-bar-spacing')).toHaveAttribute(
      'data-glyph',
      'check',
    );
    await expect(summary(window)).not.toContainText('stretched');

    // Outline first, stitched, punched: nothing left to offer.
    await expect(step(window)).toHaveCount(0);
    await expect(window.getByTestId('selection-bar-steps')).toHaveText(
      /Next.*Stitch line.*Stitch holes.*Seam allowance/,
    );
    await expect(bar(window)).toHaveAccessibleName('Stitching of Outer');

    // Not the board's: a fold has no bar, and neither has nothing.
    await window.getByTestId('feature-row-outer-fold').click();
    await expect(bar(window)).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

test('a new outline offers its stitch line, then its holes, each one click and one undo (U.17)', async () => {
  const { app, window } = await launch();
  try {
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 250, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 430, box.y + 270, { steps: 5 });
    await window.mouse.up();
    const panel = window.getByTestId('property-panel');
    const set = async (label: string, value: string): Promise<void> => {
      const input = panel.locator('label', { hasText: new RegExp(`^${label}`) }).locator('input');
      await input.fill(value);
      await input.press('Enter');
    };
    // 3.5 mm in from 107 × 47 is a 100 × 40 stitch line (properties.spec.ts).
    await set('Width', '107');
    await set('Height', '47');
    await window.getByTestId('tool-select').click();

    // Mockup 14's third state.
    await expect(summary(window)).toHaveText('No stitching yet');
    await expect(step(window)).toHaveText('Stitch line');
    await expect(step(window)).toHaveAttribute('data-step', 'stitchLine');

    // One click: the stitch line, at My tools' margin, selected.
    await step(window).click();
    await expect(window.getByTestId('property-header')).toContainText('Stitch line');
    await expect(panel.locator('label', { hasText: /^Edge margin/ }).locator('input')).toHaveValue(
      '3.5',
    );
    await expect(summary(window)).toHaveText('No holes yet');
    await expect(step(window)).toHaveAttribute('data-step', 'holes');

    // One more: holes from the default iron, 3.85, stretched on this line —
    // mockup 14's second state, with the stretch's own mark: Problems is silent.
    await step(window).click();
    await expect(panel.getByTestId('hole-count')).toHaveText('72');
    await expect(summary(window)).toContainText('72 holes');
    await expect(summary(window)).toContainText('3.89 mm, pitch 3.85');
    await expect(summary(window)).toContainText('stretched 1 %');
    await expect(window.getByTestId('selection-bar-spacing')).toHaveAttribute(
      'data-glyph',
      'stretched',
    );
    await expect(step(window)).toHaveCount(0);

    // A 4 mm iron fits it exactly: the check.
    await set('Pitch', '4');
    await expect(window.getByTestId('selection-bar-spacing')).toHaveAttribute(
      'data-glyph',
      'check',
    );
    // A 100 mm one, and Problems warns: the warning glyph, the same as Properties'.
    await set('Pitch', '100');
    await expect(window.getByTestId('selection-bar-spacing')).toHaveAttribute(
      'data-glyph',
      'warning',
    );
    await expect(summary(window)).toContainText('squeezed 30 %');

    // Undo, a step at a time: the pitches, then the holes, then the stitch line.
    const undo = async (): Promise<void> => {
      await window.getByTestId('editor-canvas').focus();
      await window.keyboard.press('Control+KeyZ');
    };
    await undo();
    await undo();
    await expect(window.getByTestId('selection-bar-spacing')).toHaveAttribute(
      'data-glyph',
      'stretched',
    );
    await undo();
    await expect(window.getByTestId('feature-count')).toHaveText('2');
    await undo();
    await expect(window.getByTestId('feature-count')).toHaveText('1');
  } finally {
    await closeApp(app);
  }
});

test('F6 goes from the board into the bar and back; Esc goes back too (U.17)', async () => {
  const { app, window } = await launch();
  try {
    await openSample(window);
    await pick(window, 'lining-outline');
    const canvas = window.getByTestId('editor-canvas');
    await expect(canvas).toBeFocused();

    await window.keyboard.press('F6');
    await expect(step(window)).toBeFocused();
    await window.keyboard.press('F6');
    await expect(canvas).toBeFocused();
    await window.keyboard.press('F6');
    await window.keyboard.press('Escape');
    await expect(canvas).toBeFocused();
    // The selection stays: Esc in the bar is not the board's Esc.
    await expect(bar(window)).toBeVisible();

    // F6, Enter: the stitch line, and the keys stay in the bar for the next.
    await window.keyboard.press('F6');
    await window.keyboard.press('Enter');
    await expect(step(window)).toHaveAttribute('data-step', 'holes');
    await expect(step(window)).toBeFocused();
    await window.keyboard.press('Enter');
    await expect(step(window)).toHaveCount(0);
    await expect(summary(window)).toContainText('holes');

    // The shortcut list says what F6 does.
    await window.keyboard.press('Escape');
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-shortcuts').click();
    await expect(window.getByTestId('shortcut-keys-selectionBar').locator('kbd')).toHaveText('F6');
  } finally {
    await closeApp(app);
  }
});

test('a rebound F6 follows: the new key goes to the bar, F6 does nothing (U.17)', async () => {
  const configHome = fresh();
  mkdirSync(join(configHome, 'leathercad'), { recursive: true });
  writeFileSync(
    join(configHome, 'leathercad', 'preferences.json'),
    JSON.stringify({ version: 2, keyBindings: { selectionBar: [{ code: 'F8' }] } }),
  );
  const { app, window } = await launch(configHome);
  try {
    await openSample(window);
    await pick(window, 'lining-outline');
    await window.keyboard.press('F6');
    await expect(window.getByTestId('editor-canvas')).toBeFocused();
    await window.keyboard.press('F8');
    await expect(step(window)).toBeFocused();
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-shortcuts').click();
    await expect(window.getByTestId('shortcut-keys-selectionBar').locator('kbd')).toHaveText('F8');
  } finally {
    await closeApp(app);
  }
});

test('off in Settings › Appearance means off, and stays off after a restart (U.17)', async () => {
  const configHome = fresh();
  const first = await launch(configHome);
  try {
    await openSample(first.window);
    await pick(first.window, 'outer-holes');
    await expect(bar(first.window)).toBeVisible();

    await first.window.getByTestId('settings').click();
    await first.window.getByTestId('settings-tab-appearance').click();
    await first.window.getByTestId('setting-selection-bar').uncheck();
    await first.window.getByTestId('settings-close').click();
    await expect(bar(first.window)).toHaveCount(0);
  } finally {
    await closeApp(first.app);
  }

  const second = await launch(configHome);
  try {
    await openSample(second.window);
    await pick(second.window, 'lining-outline');
    await expect(bar(second.window)).toHaveCount(0);
    // No key, nothing to focus.
    await second.window.keyboard.press('F6');
    await expect(second.window.getByTestId('editor-canvas')).toBeFocused();
    await second.window.getByTestId('settings').click();
    await second.window.getByTestId('settings-tab-appearance').click();
    await expect(second.window.getByTestId('setting-selection-bar')).not.toBeChecked();
  } finally {
    await closeApp(second.app);
  }
});

test('it never covers the selected piece, at any zoom, and hides while dragging (U.17)', async () => {
  const { app, window } = await launch();
  try {
    await openSample(window);
    // The outer is 200 × 95 mm from the origin.
    await pick(window, 'outer-holes');
    const level = window.getByTestId('zoom-level');
    const seen = new Set<string>();
    for (let zoom = 0; zoom < 8; zoom++) {
      const shown = bar(window);
      if (await shown.isVisible()) {
        const box = (await shown.boundingBox())!;
        // Just outside the bar's edge nearest the piece, at both its ends: off
        // the piece, by the board's own readout — with Ctrl held, which
        // suspends snapping, so it reads the point itself and not the outline
        // a few pixels off.
        const side = await shown.getAttribute('data-side');
        seen.add(side ?? '');
        const y = side === 'above' ? box.y + box.height + 1 : box.y - 1;
        for (const x of [box.x + 1, box.x + box.width - 1]) {
          await window.keyboard.down('Control');
          const read = await readoutAt(window, x, y);
          await window.keyboard.up('Control');
          const [, mmY] = read
            .replace(/\u2212/g, '-')
            .split(',')
            .map((n) => Number.parseFloat(n));
          if (side === 'above') expect(mmY).toBeGreaterThan(95);
          else expect(mmY).toBeLessThan(0);
        }
      }
      // The next zoom, and the frame that placed the bar for it: measured
      // before that frame, the bar is where the last zoom put it.
      const was = (await level.textContent()) ?? '';
      await window.getByTestId('zoom-in').click();
      await expect(level).not.toHaveText(was);
      await window.evaluate(
        () =>
          new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          ),
      );
    }
    expect(seen.has('below')).toBe(true);

    // Dragging the outline: the bar goes while the piece moves, and comes back.
    await window.getByTestId('tool-select').click();
    await window.getByTestId('feature-row-outer-outline').click();
    await window.keyboard.press('Shift+Digit2');
    await zoomOutTo(window, 50);
    const canvas = (await window.getByTestId('editor-canvas').boundingBox())!;
    const chip = (await window.getByTestId('value-chip-width').boundingBox())!;
    // On the outline's lower edge, just above its width chip.
    const x = chip.x + chip.width / 2 + 40;
    const edge = chip.y - 9;
    expect(edge).toBeGreaterThan(canvas.y);
    await expect(bar(window)).toBeVisible();
    await window.mouse.move(x, edge);
    await window.mouse.down();
    await window.mouse.move(x + 20, edge + 20, { steps: 4 });
    await expect(bar(window)).toBeHidden();
    await window.mouse.up();
    await expect(bar(window)).toBeVisible();
  } finally {
    await closeApp(app);
  }
});

test('a drag that starts on the bar draws on the board under it; only its button is its own (U.17)', async () => {
  const { app, window } = await launch();
  try {
    await openSample(window);
    await pick(window, 'outer-holes');
    const box = (await bar(window).boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    // On the bar's first line, its words: the board's press.
    await window.mouse.move(box.x + 12, box.y + 10);
    await window.mouse.down();
    await window.mouse.move(box.x + 120, box.y + 80, { steps: 4 });
    await window.mouse.up();
    await expect(window.getByTestId('part-count')).toHaveText('4');
  } finally {
    await closeApp(app);
  }
});
