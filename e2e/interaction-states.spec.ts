import { expect, test, type Page } from '@playwright/test';

import { boardMap } from './boardMap.js';
import { expectNoViolations, openSample, withApp } from './launchApp.js';
import { expectSelected } from './counts.js';

/**
 * U.22: hover, selected, editing and locked read apart, on the board and in
 * Parts. On the sample bifold: the outer is 200 × 95 mm at the origin, folded
 * at x = 100. The board's own pictures of the four are the pixel baseline's
 * (`e2e/visual`); here, what Parts says of each, and that a lock still keeps a
 * click off the piece it shows.
 */

/** Room for the whole bifold, framed as it opens. */
const ROOM = { size: [1600, 1000] } as const;

const outerRow = (window: Page) => window.getByTestId('part-heading-outer');
const foldRow = (window: Page) => window.getByTestId('feature-row-outer-fold');
const outlineRow = (window: Page) => window.getByTestId('feature-row-outer-outline');

test('the row of what a click on the board would take is highlighted in Parts (U.22)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    await window.getByTestId('tool-select').click();
    const board = await boardMap(window);

    // Over the outer's body: its piece row, and nothing selected yet.
    const body = board({ x: 150, y: 47.5 });
    await window.mouse.move(body.x, body.y);
    await expect(outerRow(window)).toHaveAttribute('data-board-hover');
    await expect(outerRow(window)).toHaveAttribute('aria-selected', 'false');

    // Over the fold: the fold's row instead, since a click there takes the fold.
    const fold = board({ x: 100, y: 47.5 });
    await window.mouse.move(fold.x, fold.y);
    await expect(foldRow(window)).toHaveAttribute('data-board-hover');
    await expect(outerRow(window)).not.toHaveAttribute('data-board-hover');

    // Off the board: nothing.
    await window.mouse.move(0, 0);
    await expect(window.locator('[data-board-hover]')).toHaveCount(0);

    // Selected is the row's border, a state of its own beside the hover.
    await window.mouse.click(body.x, body.y);
    await expect(outerRow(window)).toHaveAttribute('aria-selected', 'true');
    await expect(outerRow(window)).toHaveClass(/\bselected\b/);
    await expectNoViolations(window, 'a piece hovered and selected');
  }, ROOM);
});

test('the feature Edit points is changing is marked on its row, and said (U.22)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    // A rectangle has no points of its own: the outer's outline as a drawn path.
    await outlineRow(window).click();
    await window.getByTestId('convert-to-path').click();
    await expect(window.getByTestId('convert-to-path-section')).toHaveCount(0);

    await expect(window.getByTestId('editing-mark-outer-outline')).toHaveCount(0);
    await window.getByTestId('tool-points').click();
    await expect(window.getByTestId('editing-mark-outer-outline')).toBeVisible();
    await expect(outlineRow(window)).toHaveAccessibleDescription(
      /points are being edited with Edit points/,
    );
    await expectNoViolations(window, 'a drawn outline under Edit points');

    // Back to Select: selected still, no longer being edited.
    await window.getByTestId('tool-select').click();
    await expect(window.getByTestId('editing-mark-outer-outline')).toHaveCount(0);
    await expect(outlineRow(window)).toHaveAttribute('aria-selected', 'true');
  }, ROOM);
});

test('a locked piece pointed at highlights its row, and a click still passes over it (U.22)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    await outlineRow(window).hover();
    await window.getByTestId('feature-locked-outer-outline').click();
    await window.getByTestId('tool-select').click();
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('Escape');
    await expectSelected(window, '0');

    const board = await boardMap(window);
    const body = board({ x: 150, y: 70 });
    await window.mouse.move(body.x, body.y);
    await expect(outerRow(window)).toHaveAttribute('data-board-hover');
    await expect(outlineRow(window)).toHaveAccessibleDescription(/Locked/);

    await window.mouse.click(body.x, body.y);
    await expectSelected(window, '0');
  }, ROOM);
});
