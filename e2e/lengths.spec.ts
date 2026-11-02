import { expect, test, type Page } from '@playwright/test';

import { withSample, expectNoViolations } from './launchApp.js';

/**
 * U.15, R-12: a size typed in any unit, or as a sum. Every millimetre field
 * reads `95-2*3.5` and `3.75in` and shows the result in mm; Enter on text it
 * cannot read keeps the text and says why beneath; leaving the field, or
 * Escape, puts the stored size back.
 */

async function enter(field: ReturnType<Page['getByLabel']>, text: string): Promise<void> {
  await field.fill(text);
  await field.press('Enter');
}

test('a size field takes a sum and other units, and gives millimetres (U.15)', async () => {
  await withSample(async (window) => {
    await window.getByTestId('feature-row-outer-outline').click();
    const width = window.getByTestId('property-panel').getByLabel('Width');
    const before = await width.inputValue();

    // "95, less two margins": one size, one step to undo.
    await enter(width, '95-2*3.5');
    await expect(width).toHaveValue('88');
    await expect(width).not.toBeFocused();
    await window.getByTestId('undo').click();
    await expect(width).toHaveValue(before);

    await enter(width, '3.75in');
    await expect(width).toHaveValue('95.25');
    await enter(width, '9,5 cm');
    await expect(width).toHaveValue('95');
    await enter(width, '1/2" + 3in');
    await expect(width).toHaveValue('88.9');
  });
});

test('text a size field cannot read stays, and says why, until Escape or leaving puts the size back (U.15)', async () => {
  await withSample(async (window) => {
    await window.getByTestId('feature-row-outer-outline').click();
    const panel = window.getByTestId('property-panel');
    const width = panel.getByLabel('Width');
    const before = await width.inputValue();

    // American 3½ inches is 3 mm less half an inch as a sum: refused, not guessed.
    await enter(width, '3-1/2"');
    await expect(width).toHaveValue('3-1/2"');
    await expect(width).toBeFocused();
    await expect(width).toHaveAttribute('aria-invalid', 'true');
    await expect(width).toHaveAccessibleDescription(/3\.5in/);
    // The field keeps its own name while it says why.
    await expect(width).toHaveAccessibleName(/^Width/);

    await expectNoViolations(window);

    // Typing again clears the reason; a unit it does not know is named.
    await width.fill('3.75 inch');
    await expect(width).not.toHaveAttribute('aria-invalid');
    await width.press('Enter');
    await expect(width).toHaveAccessibleDescription(/“inch” is not a unit/);

    await width.press('Escape');
    await expect(width).toHaveValue(before);
    await expect(width).not.toHaveAttribute('aria-invalid');

    // Leaving the field drops what it could not read, as it always has.
    await width.fill('95-');
    await window.getByTestId('feature-row-outer-stitch').click();
    await window.getByTestId('feature-row-outer-outline').click();
    await expect(width).toHaveValue(before);
  });
});

test('the work bar’s corner radius takes inches too, and its reason hangs below the bar (U.15)', async () => {
  await withSample(async (window) => {
    await window.getByTestId('tool-points').click();
    const options = window.getByTestId('tool-options');
    const radius = options.getByRole('textbox');
    const bar = (await options.boundingBox())!;

    await enter(radius, '1/4in');
    await expect(radius).toHaveValue('6.35');
    // 3.175 mm, shown as written rather than as its binary 3.17499…
    await enter(radius, '1/8in');
    await expect(radius).toHaveValue('3.18');
    await enter(radius, '1/4in');

    await enter(radius, 'abc');
    await expect(radius).toHaveAttribute('aria-invalid', 'true');
    const reason = options.locator('.field-reason');
    await expect(reason).toBeVisible();
    // The bar keeps its height: the reason is below it, inside the window.
    expect((await options.boundingBox())!.height).toBe(bar.height);
    const box = (await reason.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(box.x + box.width).toBeLessThanOrEqual(await window.evaluate(() => innerWidth));
    await radius.press('Escape');
    await expect(radius).toHaveValue('6.35');
  });
});
