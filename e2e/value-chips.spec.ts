import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';

/**
 * U.14, R-12: a selected outline's sizes beside it on the board — width
 * below, height at the right, the corner by the top-right corner, the stitch
 * margin across the margin — each opened by a click or by Enter on the board,
 * typed as any size field is, and applied as one undo step. A corner the
 * rectangle would draw smaller than typed is refused with the reason, and
 * Enter takes the radius that fits. None of it prints.
 *
 * The sample's outer is 200 × 95 mm with 5 mm corners and a stitch line 3 mm in.
 */

async function withSample(run: (window: Page, app: ElectronApplication) => Promise<void>) {
  const app = await launchApp();
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await run(window, app);
  } finally {
    await closeApp(app);
  }
}

const chip = (window: Page, name: 'width' | 'height' | 'corner' | 'margin') =>
  window.getByTestId(`value-chip-${name}`);
const field = (window: Page, name: 'width' | 'height' | 'corner' | 'margin') =>
  chip(window, name).locator('input');

/** Gives the keys back to the board, as a click on empty board or Esc out of a field does. */
async function onTheBoard(window: Page): Promise<void> {
  await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Selects the outer's outline in Parts and frames it, so all four chips have room. */
async function selectOuter(window: Page): Promise<void> {
  await window.getByTestId('feature-row-outer-outline').click();
  await onTheBoard(window);
  await window.keyboard.press('Shift+2');
  await expect(chip(window, 'height')).toBeVisible();
}

test('a selected outline shows its sizes beside it, and a click edits one, one undo step (U.14)', async () => {
  await withSample(async (window) => {
    // Nothing selected, no chips.
    await expect(window.getByTestId('value-chips')).toHaveCount(0);
    await selectOuter(window);

    // At rest: the numbers, the corner and the margin labelled.
    await expect(field(window, 'width')).toHaveValue('200.0');
    await expect(field(window, 'height')).toHaveValue('95.0');
    await expect(chip(window, 'corner')).toHaveText(/^r/);
    await expect(field(window, 'corner')).toHaveValue('5.0');
    await expect(chip(window, 'margin')).toHaveText(/^margin/);
    await expect(field(window, 'margin')).toHaveValue('3.0');
    for (const name of ['width', 'height', 'corner', 'margin'] as const) {
      await expect(chip(window, name)).toBeVisible();
    }
    await expect(field(window, 'width')).toHaveAccessibleName('Width');

    // Width below the piece, height at its right, the corner above its top
    // right, the margin inside its left edge: none over the outline.
    const width = (await chip(window, 'width').boundingBox())!;
    const height = (await chip(window, 'height').boundingBox())!;
    const corner = (await chip(window, 'corner').boundingBox())!;
    const margin = (await chip(window, 'margin').boundingBox())!;
    expect(width.y).toBeGreaterThan(height.y + height.height / 2);
    expect(height.x).toBeGreaterThan(width.x + width.width);
    expect(corner.y + corner.height).toBeLessThan(height.y);
    expect(margin.x + margin.width).toBeLessThan(width.x);

    // Editing: a caret and the unit, the number as typed.
    await chip(window, 'width').click();
    await expect(field(window, 'width')).toBeFocused();
    await expect(field(window, 'width')).toHaveValue('200');
    await expect(chip(window, 'width')).toContainText('mm');

    await field(window, 'width').fill('95-2*3.5');
    await field(window, 'width').press('Enter');
    await expect(field(window, 'width')).toHaveValue('88.0');
    await expect(field(window, 'width')).not.toBeFocused();
    const panel = window.getByTestId('property-panel');
    await expect(panel.getByLabel('Width')).toHaveValue('88');

    // One step to undo.
    await window.getByTestId('undo').click();
    await expect(field(window, 'width')).toHaveValue('200.0');
    await expect(window.getByTestId('undo')).toBeDisabled();

    // Inches, shown in millimetres, and the margin.
    await chip(window, 'width').click();
    await field(window, 'width').fill('3.75in');
    await field(window, 'width').press('Enter');
    await expect(field(window, 'width')).toHaveValue('95.25');
    await chip(window, 'margin').click();
    await field(window, 'margin').fill('4');
    await field(window, 'margin').press('Enter');
    await expect(field(window, 'margin')).toHaveValue('4.0');
  });
});

test('Esc puts a chip back and leaves the document as it was (U.14)', async () => {
  await withSample(async (window) => {
    await selectOuter(window);
    await chip(window, 'height').click();
    await field(window, 'height').fill('40');
    await field(window, 'height').press('Escape');
    await expect(field(window, 'height')).toHaveValue('95.0');
    await expect(field(window, 'height')).not.toBeFocused();
    await expect(window.getByTestId('undo')).toBeDisabled();
    // The selection is kept: Esc in a chip is not Esc on the board.
    await expect(window.getByTestId('value-chips')).toBeVisible();
  });
});

test('by keyboard alone: Enter opens the sizes, Tab goes on, a corner too large is refused and Enter takes what fits (U.14)', async () => {
  await withSample(async (window) => {
    // Picked in Parts by its keys: Enter there selects, and is not the chips'.
    const row = window.getByTestId('feature-row-outer-outline');
    await row.focus();
    await row.press('Enter');
    await expect(window.getByTestId('value-chips')).toBeVisible();
    await expect(field(window, 'width')).not.toBeFocused();

    // Enter on the board opens the width — framed first, so it is in view.
    await onTheBoard(window);
    await window.keyboard.press('Shift+2');
    await expect(chip(window, 'width')).toBeVisible();
    await window.keyboard.press('Enter');
    await expect(field(window, 'width')).toBeFocused();
    await window.keyboard.type('95');
    await window.keyboard.press('Tab');
    await expect(field(window, 'height')).toBeFocused();
    await expect(field(window, 'width')).toHaveValue('95.0');
    await window.keyboard.type('60');
    await window.keyboard.press('Tab');
    await expect(field(window, 'corner')).toBeFocused();

    // Larger than half the height: kept open, said why, with a glyph.
    await window.keyboard.type('48');
    await window.keyboard.press('Enter');
    await expect(field(window, 'corner')).toBeFocused();
    await expect(field(window, 'corner')).toHaveAttribute('aria-invalid', 'true');
    const note = window.getByTestId('value-chip-note');
    await expect(note).toHaveText('Corner is larger than half the height (30.0). Enter uses 30.0.');
    await expect(note.locator('[data-glyph="warning"]')).toHaveCount(1);
    await expect(field(window, 'corner')).toHaveAccessibleDescription(/half the height/);

    const results = await new AxeBuilder({ page: window })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);

    // Enter again takes it.
    await window.keyboard.press('Enter');
    await expect(note).toHaveCount(0);
    await expect(field(window, 'corner')).toHaveValue('30.0');
    const panel = window.getByTestId('property-panel');
    for (const corner of ['↖', '↗', '↙', '↘']) {
      await expect(panel.getByLabel(corner)).toHaveValue('30');
    }

    // Three values, three steps to undo; Esc changed nothing.
    await window.keyboard.press('Enter');
    await expect(field(window, 'width')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(field(window, 'width')).not.toBeFocused();
    for (let step = 0; step < 3; step++) await window.getByTestId('undo').click();
    await expect(field(window, 'width')).toHaveValue('200.0');
    await expect(field(window, 'height')).toHaveValue('95.0');
    await expect(field(window, 'corner')).toHaveValue('5.0');
    await expect(window.getByTestId('undo')).toBeDisabled();

    // Tab past the last chip leaves them: no trap.
    await onTheBoard(window);
    await window.keyboard.press('Enter');
    for (let i = 0; i < 4; i++) await window.keyboard.press('Tab');
    const inChips = await window.evaluate(
      () => document.activeElement?.closest('[data-testid="value-chips"]') !== null,
    );
    expect(inChips).toBe(false);
  });
});

test('Enter finishes a polyline before it opens the chips (U.14)', async () => {
  await withSample(async (window) => {
    await window.getByTestId('feature-row-outer-outline').click();
    await window.getByTestId('tool-polyline').click();
    const canvas = window.getByTestId('editor-canvas');
    const box = (await canvas.boundingBox())!;
    await window.mouse.click(box.x + 120, box.y + box.height - 60);
    await window.mouse.click(box.x + 220, box.y + box.height - 60);
    await onTheBoard(window);
    // Refused — an outline that does not close keeps its points — and the
    // run's all the same: the selected outline's sizes stay shut.
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await expect(window.locator('.value-chip input:focus')).toHaveCount(0);
    await window.keyboard.press('Escape');
  });
});

test('Properties refuses a corner larger than fits, the same way (U.14)', async () => {
  await withSample(async (window) => {
    await window.getByTestId('feature-row-outer-outline').click();
    const panel = window.getByTestId('property-panel');
    const topLeft = panel.getByLabel('↖');
    // The other corners are 5: the left side, 95 tall, leaves this one 90.
    await topLeft.fill('95');
    await topLeft.press('Enter');
    await expect(topLeft).toBeFocused();
    await expect(topLeft).toHaveAttribute('aria-invalid', 'true');
    await expect(topLeft).toHaveAccessibleDescription(
      /Corner is larger than the height leaves it \(90\.0\)\. Enter uses 90\.0\.$/,
    );
    await topLeft.press('Enter');
    await expect(topLeft).toHaveValue('90');
    await expect(topLeft).not.toBeFocused();

    // Leaving drops a refused value, as it drops one it cannot read.
    const topRight = panel.getByLabel('↗');
    await topRight.fill('200');
    await topRight.press('Enter');
    await panel.getByLabel('Width').focus();
    await expect(topRight).toHaveValue('5');

    // The arrow keys stop at the most that fits, and a step that changes
    // nothing is no step to undo.
    const bottomRight = panel.getByLabel('↘');
    await bottomRight.fill('90');
    await bottomRight.press('Enter');
    await bottomRight.focus();
    await bottomRight.press('ArrowUp');
    await expect(bottomRight).toHaveValue('90');
    await window.getByTestId('undo').click();
    await expect(bottomRight).toHaveValue('5');
    await expect(topLeft).toHaveValue('90');
  });
});

test('the chips and their lines never print (U.14)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-e2e-u14-'));
  try {
    await withSample(async (window, app) => {
      await app.evaluate(({ dialog, shell }) => {
        shell.openPath = async () => '';
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: (globalThis as { pdfTarget?: string }).pdfTarget ?? '',
        });
      });
      const exportTo = async (path: string): Promise<void> => {
        await app.evaluate((_, file) => {
          (globalThis as { pdfTarget?: string }).pdfTarget = file;
        }, path);
        await window.getByTestId('export-pdf').click();
        await expect.poll(() => existsSync(path), { timeout: 10_000 }).toBe(true);
      };

      await exportTo(join(dir, 'none.pdf'));
      await selectOuter(window);
      for (const name of ['width', 'height', 'corner', 'margin'] as const) {
        await expect(chip(window, name)).toBeVisible();
      }
      await exportTo(join(dir, 'chips.pdf'));
    });

    // Every page the same, pixel for pixel.
    const pages = (name: string): Buffer[] => {
      const out = join(dir, name);
      execFileSync('pdftoppm', ['-r', '72', '-gray', join(dir, `${name}.pdf`), out]);
      return readdirSync(dir)
        .filter((file) => file.startsWith(name) && file.endsWith('.pgm'))
        .sort()
        .map((file) => readFileSync(join(dir, file)));
    };
    const without = pages('none');
    const withChips = pages('chips');
    expect(without.length).toBeGreaterThan(0);
    expect(withChips.length).toBe(without.length);
    withChips.forEach((page, index) => expect(page.equals(without[index]!)).toBe(true));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
