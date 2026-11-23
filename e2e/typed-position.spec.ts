import { expect, test, type Page } from '@playwright/test';

import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';
import { expectPieces } from './counts.js';

/**
 * 3.15: Properties › Arrange says where the selection is — its box's left and
 * bottom, as the rulers read them — and takes a place or a distance typed, with
 * the sums and units every length field takes (smart-guides spec §4). Each is
 * one undo step.
 */

const panel = (window: Page) => window.getByTestId('property-panel');
const position = (window: Page) => panel(window).getByTestId('position-fields');
const field = (window: Page, name: string) => position(window).getByLabel(name);

/** Picks the first piece in Parts: its outline, which Properties shows. */
async function pickThePiece(window: Page): Promise<void> {
  await window.locator('[data-testid^="feature-row-"]').first().click();
  await expect(position(window)).toBeVisible();
}

async function type(window: Page, name: string, text: string): Promise<void> {
  const input = field(window, name);
  await input.fill(text);
  await input.press('Enter');
}

test("typing Left puts the piece's left edge there, a sum and a unit read, one undo each (3.15)", async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await pickThePiece(window);
    const bottom = await field(window, 'Bottom').inputValue();
    const width = await panel(window).getByLabel('Width').inputValue();

    await type(window, 'Left', '10+10');
    await expect(field(window, 'Left')).toHaveValue('20');
    // The piece moved, not resized.
    await expect(panel(window).getByLabel('Width')).toHaveValue(width);
    await expect(field(window, 'Bottom')).toHaveValue(bottom);

    await type(window, 'Bottom', '-1.5cm');
    await expect(field(window, 'Bottom')).toHaveValue('−15');

    await window.getByTestId('undo').click();
    await expect(field(window, 'Bottom')).toHaveValue(bottom);
    await expect(field(window, 'Left')).toHaveValue('20');
    await window.getByTestId('undo').click();
    await expect(field(window, 'Left')).not.toHaveValue('20');

    await expectNoViolations(window, 'Properties with the position fields');
  });
});

test('Move by −12 moves the piece 12 mm left in one undo step, and again on a second Move (3.15)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await pickThePiece(window);
    await type(window, 'Left', '50');
    const move = position(window).getByTestId('move-by');
    await expect(move).toBeDisabled();

    await type(window, 'Right', '-12');
    await move.click();
    await expect(field(window, 'Left')).toHaveValue('38');
    await move.click();
    await expect(field(window, 'Left')).toHaveValue('26');

    await window.getByTestId('undo').click();
    await expect(field(window, 'Left')).toHaveValue('38');
  });
});

test('a locked piece shows the fields disabled, and says why (3.15)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await window.locator('[data-testid^="feature-locked-"]').first().click();
    await pickThePiece(window);

    await expect(position(window).getByTestId('position-reason')).toContainText(/locked/i);
    for (const name of ['Left', 'Bottom', 'Right', 'Up'])
      await expect(field(window, name)).toBeDisabled();
    await expect(position(window).getByTestId('move-by')).toBeDisabled();
  });
});

test('a place or a move past what a project holds offers the farthest that fits (QA F2, F6)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await pickThePiece(window);
    await type(window, 'Left', '0');
    const width = Number(await panel(window).getByLabel('Width').inputValue());
    const errors: Error[] = [];
    window.on('pageerror', (error) => errors.push(error));

    // Left at the limit would put the right edge past it: refused, then Enter takes what fits.
    await type(window, 'Left', '100000');
    await expect(field(window, 'Left')).toHaveAccessibleDescription(/100,000 mm either way/);
    await field(window, 'Left').press('Enter');
    await expect(field(window, 'Left')).toHaveValue(String(100_000 - width));

    // Move by 1e305, as the QA run typed it: refused, and Move stays off.
    await type(window, 'Right', '1' + '0'.repeat(305));
    await expect(field(window, 'Right')).toHaveAttribute('aria-invalid', 'true');
    await field(window, 'Right').press('Escape');
    await expect(position(window).getByTestId('move-by')).toBeDisabled();

    // A move that fits once, but not twice, is refused the second time.
    await type(window, 'Left', '0');
    await type(window, 'Right', String(60_000));
    await position(window).getByTestId('move-by').click();
    await expect(field(window, 'Left')).toHaveValue('60000');
    await expect(position(window).getByTestId('move-by')).toBeDisabled();
    await expect(position(window).getByTestId('move-by-reason')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('a shape is placed in one place, Left and Bottom, with no X or Y of its own (QA U9)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    await pickThePiece(window);
    // One position editor: a second pair, named X and Y, said the same in other words.
    await expect(panel(window).getByRole('textbox', { name: /^[XY] mm$/ })).toHaveCount(0);

    // A circle too, whose X and Y were its centre where Left and Bottom are its box.
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-circle').click();
    await window.mouse.move(box.x + 500, box.y + 300);
    await window.mouse.down();
    await window.mouse.move(box.x + 540, box.y + 300, { steps: 4 });
    await window.mouse.up();
    await expectPieces(window, '2');
    await window.locator('[data-testid^="feature-row-"]').last().click();
    await expect(position(window)).toBeVisible();
    await expect(panel(window).getByRole('textbox', { name: /^[XY] mm$/ })).toHaveCount(0);
    const diameter = await panel(window).getByLabel('Diameter').inputValue();

    await type(window, 'Left', '30');
    await type(window, 'Bottom', '40');
    await expect(field(window, 'Left')).toHaveValue('30');
    await expect(field(window, 'Bottom')).toHaveValue('40');
    await expect(panel(window).getByLabel('Diameter')).toHaveValue(diameter);
  });
});
