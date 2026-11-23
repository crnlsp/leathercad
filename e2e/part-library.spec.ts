import { expect, test } from '@playwright/test';

import { expectNoViolations, openSample, withApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';
import { expectFeatures, expectPieces, expectSelected } from './counts.js';

/** Slice 9.7: a piece saved as a template, and inserted into any project. */

test("the wallet's card pocket, saved as a piece, inserts into a new project as it was, one undo step (9.7)", async () => {
  await withApp(async (window) => {
    await openSample(window);
    await window.getByTestId('part-heading-pocket').click({ button: 'right' });
    await window.getByTestId('context-save-template').click();
    // Named for the piece; nothing in it points at another, so nothing is said.
    await expect(window.getByTestId('template-name')).toHaveValue('Card pocket');
    await window.getByTestId('template-save').click();
    await expect(window.getByTestId('save-template-dialog')).toHaveCount(0);
    await expect(window.getByTestId('file-notice')).toHaveCount(0);

    await window.keyboard.press('ControlOrMeta+N');
    await expectPieces(window, '0');
    await fromProjectMenu(window, 'insert-pieces');
    const dialog = window.getByTestId('template-dialog');
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(
      'Insert pieces from template',
    );
    // The piece tag finds it.
    await dialog.getByTestId('template-search').fill('piece');
    await expect(dialog.getByTestId('template-mine:Card pocket')).toBeVisible();
    await dialog.getByTestId('template-mine:Card pocket').click();
    await expect(dialog.locator('.template-tags')).toContainText('piece');
    const pieces = dialog.getByTestId('template-pieces').getByRole('checkbox');
    await expect(pieces).toHaveCount(1);
    await expect(pieces.first()).toBeChecked();
    await expectNoViolations(window, 'template picker choosing pieces to insert');

    await dialog.getByTestId('template-use').click();
    await expect(dialog).toHaveCount(0);
    await expectPieces(window, '1');
    await expectFeatures(window, '4');
    await expectSelected(window, '1', 'pieces');
    await expect(window.getByTestId('parts-list')).toContainText('Card pocket');
    await expect(window.getByTestId('print-problems')).toHaveAttribute('data-state', 'clear');

    await window.getByTestId('undo').click();
    await expectPieces(window, '0');
  });
});

test("a built-in template's pieces insert too, only the ones ticked (9.7)", async () => {
  await withApp(async (window) => {
    await openSample(window);
    await expectPieces(window, '3');
    await fromProjectMenu(window, 'insert-pieces');
    const dialog = window.getByTestId('template-dialog');
    await dialog.getByTestId('template-builtin:card-holder').click();
    const pieces = dialog.getByTestId('template-pieces').getByRole('checkbox');
    const count = await pieces.count();
    expect(count).toBeGreaterThan(1);
    await pieces.first().uncheck();
    await expect(dialog.getByTestId('template-use')).toHaveText(
      count - 1 === 1 ? 'Insert piece' : `Insert ${String(count - 1)} pieces`,
    );
    await dialog.getByTestId('template-use').click();
    await expectPieces(window, String(3 + count - 1));
    await expectSelected(window, String(count - 1), 'pieces');

    // Nothing ticked, nothing to insert.
    await fromProjectMenu(window, 'insert-pieces');
    await dialog.getByTestId('template-builtin:key-fob').click();
    for (const box of await pieces.all()) await box.uncheck();
    await expect(dialog.getByTestId('template-use')).toBeDisabled();
  });
});
