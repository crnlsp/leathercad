import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { readoutAt } from './cursorReadout.js';
import { launchApp } from './launchApp.js';

/**
 * U.4 (R-03): the zoom control at the canvas's bottom-right — − · the zoom ·
 * + · Fit — true size on Ctrl+0, Fit drawing on Shift+1 and Fit selection on
 * Shift+2, on Design and on Sheets.
 */

/** CSS pixels per millimetre at true size: 96 to the inch. */
const TRUE_SIZE = 96 / 25.4;

async function launch(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await launchApp();
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  return { app, window };
}

/** The zoom the control says, as a number. */
async function percent(window: Page): Promise<number> {
  const text = (await window.getByTestId('zoom-level').textContent()) ?? '';
  return Number(/\d+/.exec(text.replace(/[\s,.]/g, ''))?.[0]);
}

/** A key press as a keyboard of another layout sends it, straight to the window. */
async function press(
  window: Page,
  init: { code: string; key: string; shiftKey?: boolean; ctrlKey?: boolean },
): Promise<void> {
  await window.evaluate((event) => {
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { ...event, bubbles: true }));
  }, init);
}

test('the control follows the zoom live, and Ctrl+0 is true size: 100 mm is 377.95 px', async () => {
  const { app, window } = await launch();
  try {
    await window.getByTestId('tool-select').click();
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    const start = await percent(window);

    await window.mouse.move(board.x + board.width / 2, board.y + board.height / 2);
    await window.mouse.wheel(0, -200);
    await expect.poll(() => percent(window)).toBeGreaterThan(start);
    // The keys, with the pointer off the board: nothing else changes the status.
    await window.getByTestId('status-bar').hover();
    const wheeled = await percent(window);
    await window.keyboard.press('Control+Equal');
    await expect.poll(() => percent(window)).toBeGreaterThan(wheeled);

    await window.keyboard.press('Control+0');
    await expect(window.getByTestId('zoom-level')).toHaveText('100 %');
    // The millimetres under two points 378 CSS px apart: 100 mm, to the readout's 0.01.
    const y = board.y + board.height / 2;
    const x = (text: string): number => Number(text.split(',')[0]!.trim());
    const left = x(await readoutAt(window, board.x + 120, y));
    const right = x(await readoutAt(window, board.x + 120 + 378, y));
    expect(Math.abs(right - left - 378 / TRUE_SIZE)).toBeLessThan(0.02);

    await window.keyboard.press('Control+Minus');
    await expect(window.getByTestId('zoom-level')).toHaveText('80 %');
  } finally {
    await closeApp(app);
  }
});

test('Shift+1 fits the drawing and Shift+2 the selection, a part picked by its heading included', async () => {
  const { app, window } = await launch();
  try {
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).not.toHaveText('0');
    await window.getByTestId('tool-select').click();
    const level = window.getByTestId('zoom-level');

    await window.keyboard.press('Control+0');
    await expect(level).toHaveText('100 %');
    await window.keyboard.press('Shift+Digit1');
    await expect.poll(() => percent(window)).not.toBe(100);
    const fitted = await percent(window);
    // A German keyboard types ! on Shift+1, a French one 1: the same key, the same fit.
    for (const key of ['!', '1']) {
      await window.keyboard.press('Control+0');
      await expect(level).toHaveText('100 %');
      await press(window, { code: 'Digit1', key, shiftKey: true });
      await expect.poll(() => percent(window)).toBe(fitted);
    }

    // Nothing selected: Shift+2 does nothing, and the menu says why.
    await window.keyboard.press('Shift+Digit2');
    await expect.poll(() => percent(window)).toBe(fitted);
    await level.click();
    const fitSelection = window.getByTestId('zoom-fit-selection');
    await expect(fitSelection).toHaveAttribute('aria-disabled', 'true');
    await expect(fitSelection).toContainText('Select something drawn on the board to fit it');
    await window.keyboard.press('Escape');
    await expect(level).toBeFocused();

    // A part picked by its heading is framed whole, bigger than the drawing.
    await window.locator('[data-testid^="part-heading-"]').last().click();
    await window.keyboard.press('Shift+Digit2');
    await expect.poll(() => percent(window)).toBeGreaterThan(fitted);
    const framed = await percent(window);
    await window.keyboard.press('Shift+Digit1');
    await expect.poll(() => percent(window)).toBe(fitted);
    await level.click();
    await expect(fitSelection).not.toHaveAttribute('aria-disabled');
    await fitSelection.click();
    await expect.poll(() => percent(window)).toBe(framed);

    // Typed into a field, Shift+1 is a !, not a fit.
    await window.keyboard.press('Control+0');
    const name = window.getByTestId('project-name');
    await name.click();
    await name.press('End');
    await name.press('Shift+Digit1');
    await expect(name).toHaveValue(/!$/);
    await expect(level).toHaveText('100 %');
  } finally {
    await closeApp(app);
  }
});

test('the zoom menu works by keyboard alone, and gives focus back', async () => {
  const { app, window } = await launch();
  try {
    const level = window.getByTestId('zoom-level');
    await level.focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('zoom-fit-drawing')).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('ArrowDown');
    await expect(window.getByTestId('zoom-true-size')).toBeFocused();
    await expect(window.getByTestId('zoom-true-size')).toContainText('Ctrl+0');
    await window.keyboard.press('Enter');
    await expect(level).toHaveText('100 %');
    await expect(level).toBeFocused();

    await window.keyboard.press('Enter');
    await window.keyboard.press('End');
    await expect(window.getByTestId('zoom-400')).toBeFocused();
    await window.keyboard.press('ArrowUp');
    await window.keyboard.press('Enter');
    await expect(level).toHaveText('200 %');
    await expect(level).toBeFocused();

    // Every part is a stop of its own, named.
    await window.keyboard.press('Tab');
    await expect(window.getByTestId('zoom-in')).toBeFocused();
    await expect(window.getByTestId('zoom-in')).toHaveAccessibleName('Zoom in');
    await window.keyboard.press('Enter');
    await expect(level).toHaveText('250 %');
    await window.keyboard.press('Tab');
    await expect(window.getByTestId('zoom-fit')).toBeFocused();
    await expect(window.getByRole('tooltip')).toContainText('double-click');
    await window.keyboard.press('Shift+Tab');
    await window.keyboard.press('Shift+Tab');
    await window.keyboard.press('Shift+Tab');
    await expect(window.getByTestId('zoom-out')).toBeFocused();
    await window.keyboard.press('Enter');
    await expect(level).toHaveText('200 %');
  } finally {
    await closeApp(app);
  }
});

test('the same control drives the Sheets view, where Fit selection says why it cannot', async () => {
  const { app, window } = await launch();
  try {
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).not.toHaveText('0');
    const level = window.getByTestId('zoom-level');
    await window.keyboard.press('Control+0');
    await expect(level).toHaveText('100 %');

    // The Sheets camera's own zoom, not the board's.
    await window.keyboard.press('Control+2');
    await expect(window.getByTestId('editor-canvas')).toHaveAttribute('data-view', 'sheets');
    await expect.poll(() => percent(window)).not.toBe(100);
    const sheets = await percent(window);

    await window.keyboard.press('Control+0');
    await expect(level).toHaveText('100 %');
    await window.getByTestId('zoom-fit').click();
    await expect.poll(() => percent(window)).toBe(sheets);
    for (const size of ['50', '200', '400']) {
      await level.click();
      await window.getByTestId(`zoom-${size}`).click();
      await expect(level).toHaveText(`${size} %`);
    }

    await level.click();
    const fitSelection = window.getByTestId('zoom-fit-selection');
    await expect(fitSelection).toHaveAttribute('aria-disabled', 'true');
    await expect(fitSelection).toContainText('On Design only');
    await window.keyboard.press('Escape');

    // Back on the board, its own zoom, as it was left.
    await window.keyboard.press('Control+1');
    await expect(level).toHaveText('100 %');
  } finally {
    await closeApp(app);
  }
});
