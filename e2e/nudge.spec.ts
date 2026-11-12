import { expect, test, type Page } from '@playwright/test';

import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';

/**
 * 3.14: with the board focused, the arrow keys move what is selected — 1 mm,
 * 10 mm with Shift, 0.1 mm with Alt — and the command key with A selects every
 * piece (smart-guides spec §4). In a field, a tree or a tab strip the same keys
 * stay that control's.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const panel = (window: Page) => window.getByTestId('property-panel');
const rows = (window: Page) => window.locator('[data-testid^="feature-row-"]');

/** Where a piece's outline starts, read from Properties — which takes the focus to its row. */
async function origin(window: Page, row = 0): Promise<{ x: number; y: number }> {
  await rows(window).nth(row).click();
  return {
    x: Number(await panel(window).getByLabel('X').inputValue()),
    y: Number(await panel(window).getByLabel('Y').inputValue()),
  };
}

/** A click on the first panel's leather: the piece picked, or kept (3.13), and the board focused. */
async function pickOnBoard(window: Page): Promise<void> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.getByTestId('tool-select').click();
  await window.mouse.click(box.x + 225, box.y + 205);
  await expect(window.getByTestId('selected-count')).toHaveText('1');
  await expect(window.getByTestId('editor-canvas')).toBeFocused();
}

test('each arrow moves the selection by its step, Y up, and each press is one undo (3.14)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    const start = await origin(window);

    await pickOnBoard(window);
    await window.keyboard.press('ArrowRight');
    await window.keyboard.press('Shift+ArrowUp');
    await window.keyboard.press('Alt+ArrowLeft');
    await window.keyboard.press('Alt+ArrowLeft');

    const moved = await origin(window);
    expect(moved.x - start.x).toBeCloseTo(1 - 0.2, 4);
    expect(moved.y - start.y).toBeCloseTo(10, 4);

    // Four presses, four steps back.
    for (let step = 0; step < 4; step++) await window.getByTestId('undo').click();
    expect(await origin(window)).toEqual(start);
    await expect(window.getByTestId('undo')).toBeEnabled();
  });
});

test('a held arrow moves on with each repeat and undoes as one step (3.14, D9)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    const start = await origin(window);

    await pickOnBoard(window);
    // A key held down sends its key-down again and again, and one key-up.
    for (let repeat = 0; repeat < 6; repeat++) await window.keyboard.down('ArrowDown');
    await window.keyboard.up('ArrowDown');

    const moved = await origin(window);
    expect(moved.y - start.y).toBeCloseTo(-6, 4);
    expect(moved.x).toBe(start.x);

    await window.getByTestId('undo').click();
    expect(await origin(window)).toEqual(start);
  });
});

test('a locked piece stays where it is under the arrows, and the board says why (3.14)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    const start = await origin(window);
    await window.locator('[data-testid^="feature-locked-"]').first().click();

    // A locked outline is out of a click's reach on the board, so it is picked
    // in Parts and the board is given the focus by the keyboard's way.
    await rows(window).first().click();
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('ArrowRight');

    await expect(window.getByTestId('status-bar')).toContainText(/locked/i);
    expect(await origin(window)).toEqual(start);
  });
});

test('in a field the arrows move the caret and the select-all key selects its text (3.14)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    const start = await origin(window);

    const field = panel(window).getByLabel('X');
    await field.click();
    await field.press('End');
    await field.press('ArrowLeft');
    const caret = await field.evaluate((input: HTMLInputElement) => [
      input.selectionStart,
      input.value.length,
    ]);
    expect(caret[0]).toBe(caret[1]! - 1);

    await field.press(`${MOD}+a`);
    const selected = await field.evaluate((input: HTMLInputElement) => [
      input.selectionStart,
      input.selectionEnd,
      input.value.length,
    ]);
    expect(selected).toEqual([0, selected[2], selected[2]]);
    await field.press('Escape');

    // Nothing moved, and the piece's feature is still what is picked — not every piece.
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    expect(await origin(window)).toEqual(start);
  });
});

test('in the Parts tree the arrows move between rows, not the piece (3.14)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    const start = await origin(window);

    // The row has the focus after `origin` clicked it.
    await window.keyboard.press('ArrowUp');
    await window.keyboard.press('ArrowRight');
    await window.keyboard.press('ArrowDown');

    expect(await origin(window)).toEqual(start);
    await expect(window.getByTestId('undo')).toBeEnabled();
    await window.getByTestId('undo').click();
    // The one step there was to undo was the panel being drawn.
    await expect(window.getByTestId('part-count')).toHaveText('0');
  });
});

test('the command key with A on the board selects every piece, and one arrow moves them all (3.14)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await drawAPanel(window, { left: 350, parts: '2' });
    const first = await origin(window, 0);
    const second = await origin(window, 1);

    await pickOnBoard(window);
    await window.keyboard.press(`${MOD}+a`);
    await expect(window.getByTestId('status-counts')).toContainText('2 parts selected');

    await window.keyboard.press('Shift+ArrowRight');
    expect((await origin(window, 0)).x - first.x).toBeCloseTo(10, 4);
    expect((await origin(window, 1)).x - second.x).toBeCloseTo(10, 4);

    // One press moved both: one step.
    await window.getByTestId('undo').click();
    expect(await origin(window, 0)).toEqual(first);
    expect(await origin(window, 1)).toEqual(second);
  });
});

test('the board focused with a piece nudged has no accessibility violations (3.14)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await pickOnBoard(window);
    await window.keyboard.press('ArrowRight');
    await expect(window.getByTestId('editor-canvas')).toBeFocused();
    await expectNoViolations(window, 'the board focused, after a nudge');
  });
});

test('Settings lists the nudges and Select all, by the keys they have (3.14)', async () => {
  await withApp(async (window) => {
    await window.keyboard.press('?');
    const list = window.getByRole('dialog');
    await expect(list.getByText('Move what is selected 10 mm left')).toBeVisible();
    await expect(list.getByText('Move what is selected 0.1 mm up')).toBeVisible();
    await expect(list.getByText('Select every piece on the board')).toBeVisible();
  });
});
