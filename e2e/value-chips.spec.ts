import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { withSample, expectNoViolations } from './launchApp.js';
import { resizeWindow } from './windowSize.js';

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
  await window.keyboard.press('Shift+@');
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
    await window.keyboard.press('Shift+@');
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
    // Each applied to the outline as it is now: the height did not put the
    // width it was opened beside back (a Tab opens the next chip in the same
    // keypress that applied the last).
    await expect(field(window, 'width')).toHaveValue('95.0');
    await expect(field(window, 'height')).toHaveValue('60.0');

    // Larger than half the height: kept open, said why, with a glyph.
    await window.keyboard.type('48');
    await window.keyboard.press('Enter');
    await expect(field(window, 'corner')).toBeFocused();
    await expect(field(window, 'corner')).toHaveAttribute('aria-invalid', 'true');
    const note = window.getByTestId('value-chip-note');
    await expect(note).toHaveText('Corner is larger than half the height (30.0). Enter uses 30.0.');
    await expect(note.locator('[data-glyph="warning"]')).toHaveCount(1);
    await expect(field(window, 'corner')).toHaveAccessibleDescription(/half the height/);

    await expectNoViolations(window);

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

/** What has focus: a chip, the board, the page itself, or a control by its test id. */
async function focused(window: Page): Promise<string> {
  return window.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) return 'body';
    if (element.closest('[data-testid="value-chips"]') !== null) return 'chip';
    return element.getAttribute('data-testid') ?? element.tagName.toLowerCase();
  });
}

test('at rest the chips are not Tab stops: Tab reaches the board, and never a chip (U.14)', async () => {
  await withSample(async (window) => {
    await selectOuter(window);
    await onTheBoard(window);
    const stops: string[] = [];
    // Round the window more than once: it has about forty stops.
    for (let i = 0; i < 120; i++) {
      await window.keyboard.press('Tab');
      stops.push(await focused(window));
    }
    expect(stops).not.toContain('chip');
    expect(stops).toContain('editor-canvas');
    await expect(window.getByTestId('value-chips')).toBeVisible();
  });
});

test('Enter on the board opens the first chip, Tab and Shift+Tab go through them and out, and the keys come back to the board (U.14)', async () => {
  await withSample(async (window) => {
    await selectOuter(window);
    const board = window.getByTestId('editor-canvas');
    await board.focus();
    await window.keyboard.press('Enter');
    await expect(field(window, 'width')).toBeFocused();

    // Shift+Tab from the first chip leaves the sequence backwards, to the board.
    await window.keyboard.press('Shift+Tab');
    await expect(board).toBeFocused();
    await expect(chip(window, 'width')).not.toHaveAttribute('data-editing', 'true');

    // While one is open, Tab goes on through the others, Shift+Tab back.
    await window.keyboard.press('Enter');
    for (const next of ['height', 'corner', 'margin'] as const) {
      await window.keyboard.press('Tab');
      await expect(field(window, next)).toBeFocused();
    }
    await window.keyboard.press('Shift+Tab');
    await expect(field(window, 'corner')).toBeFocused();

    // Past the last, Tab leaves them for the window's next stop, and
    // Shift+Tab from there is the board again — not a chip: no trap.
    await window.keyboard.press('Tab');
    await window.keyboard.press('Tab');
    expect(await focused(window)).not.toMatch(/^(chip|body)$/);
    await expect(chip(window, 'margin')).not.toHaveAttribute('data-editing', 'true');
    await window.keyboard.press('Shift+Tab');
    await expect(board).toBeFocused();

    // Esc, and an Enter that applies, give the keys back to the board.
    await window.keyboard.press('Enter');
    await expect(field(window, 'width')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(board).toBeFocused();
    await window.keyboard.press('Enter');
    await window.keyboard.type('190');
    await window.keyboard.press('Enter');
    await expect(board).toBeFocused();
    await expect(field(window, 'width')).toHaveValue('190.0');
  });
});

test('a right-click in an open chip is the field’s menu, and the chip stays open (U.14, U.20)', async () => {
  await withSample(async (window) => {
    await selectOuter(window);
    await field(window, 'width').click();
    await expect(chip(window, 'width')).toHaveAttribute('data-editing', 'true');
    await window.keyboard.type('150');
    await field(window, 'width').click({ button: 'right' });
    const menu = window.getByTestId('field-menu');
    await expect(menu).toBeVisible();
    // The menu taking focus is not the maker leaving the chip.
    await expect(chip(window, 'width')).toHaveAttribute('data-editing', 'true');
    await expect(field(window, 'width')).toHaveValue('150');
    await window.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(field(window, 'width')).toBeFocused();
    await window.keyboard.press('Enter');
    await expect(field(window, 'width')).toHaveValue('150.0');
  });
});

test('Enter finishes a polyline before it opens the chips (U.14)', async () => {
  await withSample(async (window) => {
    await window.getByTestId('feature-row-outer-outline').click();
    await window.getByTestId('tool-polyline').click();
    const canvas = window.getByTestId('editor-canvas');
    const box = (await canvas.boundingBox())!;
    // The canvas's empty upper-left: the legend holds its lower-left (U.10)
    // and the zoom control its lower-right (U.4).
    await window.mouse.click(box.x + 120, box.y + 60);
    await window.mouse.click(box.x + 220, box.y + 60);
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

test('a width or height its corners do not fit in is refused, on the board and in Properties, and Enter takes the least that fits (U.14)', async () => {
  await withSample(async (window) => {
    // The outer's 5 mm corners need 10 mm of width and of height.
    await selectOuter(window);
    const note = window.getByTestId('value-chip-note');

    await field(window, 'width').click();
    await window.keyboard.type('8');
    await window.keyboard.press('Enter');
    await expect(field(window, 'width')).toBeFocused();
    await expect(field(window, 'width')).toHaveAttribute('aria-invalid', 'true');
    await expect(note).toHaveText('Width is less than its corners need (10.0). Enter uses 10.0.');
    await window.keyboard.press('Enter');
    await expect(field(window, 'width')).toHaveValue('10.0');

    const panel = window.getByTestId('property-panel');
    const height = panel.getByLabel('Height');
    await height.fill('6');
    await height.press('Enter');
    await expect(height).toHaveAttribute('aria-invalid', 'true');
    // After the warning glyph's own word, as a corner's refusal reads.
    await expect(height).toHaveAccessibleDescription(
      /Height is less than its corners need \(10\.0\)\. Enter uses 10\.0\.$/,
    );
    await expect(field(window, 'height')).toHaveValue('95.0');
    await height.press('Enter');
    await expect(field(window, 'height')).toHaveValue('10.0');

    // Stored as drawn: the corners are still the 5 mm typed.
    for (const corner of ['↖', '↗', '↙', '↘']) {
      await expect(panel.getByLabel(corner)).toHaveValue('5');
    }
    // Two sizes accepted, two steps back; the refusals were none.
    for (let step = 0; step < 2; step++) await window.getByTestId('undo').click();
    await expect(field(window, 'width')).toHaveValue('200.0');
    await expect(field(window, 'height')).toHaveValue('95.0');
    await expect(window.getByTestId('undo')).toBeDisabled();
  });
});

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every chip in view, by its box on screen. */
async function chipBoxes(window: Page): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const name of ['width', 'height', 'corner', 'margin'] as const) {
    const element = chip(window, name);
    if ((await element.count()) === 0 || !(await element.isVisible())) continue;
    boxes.push((await element.boundingBox())!);
  }
  return boxes;
}

// The legend open with names (1440), folded to its chip with Properties a
// strip (1024), and the smallest window, where panels open over the board (860).
for (const [width, height] of [
  [1440, 900],
  [1024, 700],
  [860, 600],
] as const) {
  test(`the chips keep clear of the legend and the zoom control at ${String(width)} × ${String(height)} (U.14, U.10)`, async () => {
    await withSample(async (window, app) => {
      await resizeWindow(app, window, width, height);
      const legend = (await window.getByTestId('canvas-legend').boundingBox())!;
      const zoom = (await window.getByTestId('zoom-control').boundingBox())!;
      // A piece drawn just above each, wider than it: its width's place is on
      // the control, and a clear stretch of its line beside it.
      for (const [left, right, foot] of [
        [legend.x + 10, legend.x + legend.width + 180, legend.y - 12],
        [zoom.x - 180, zoom.x + zoom.width - 10, zoom.y - 12],
      ] as const) {
        await window.getByTestId('tool-rectangle').click();
        await window.mouse.move(left, foot - 90);
        await window.mouse.down();
        await window.mouse.move(right, foot, { steps: 5 });
        await window.mouse.up();
        await expect(chip(window, 'width')).toBeVisible();
        const boxes = await chipBoxes(window);
        for (const box of boxes) {
          expect(overlap(box, legend), `a chip on the legend: ${JSON.stringify(box)}`).toBe(false);
          expect(overlap(box, zoom), `a chip on the zoom control: ${JSON.stringify(box)}`).toBe(
            false,
          );
        }
      }
    });
  });
}
