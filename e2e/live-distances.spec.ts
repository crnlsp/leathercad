import { expect, test, type Page } from '@playwright/test';

import { boardMap } from './boardMap.js';
import { withApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * 3.17: a move says how far it went and how near the edges it is
 * (smart-guides spec §7, §11). The key fob's strap is 140 × 26 mm at the
 * origin, its 4 mm rivet at (14, 13), mirrored across the fold. The rivet is
 * pressed on its rim at 0° and carried up with Ctrl held, so no guide takes
 * it: its rim comes `clearance` short of the strap's top edge, at y = 26.
 */

const ROOM = { size: [1440, 1000] } as const;

async function openKeyFob(window: Page) {
  await fromProjectMenu(window, 'new-template');
  await window.getByTestId('template-builtin:key-fob').dblclick();
  await expect(window.getByTestId('project-name')).toHaveText('Key fob');
  await window.getByTestId('tool-select').click();
  await expect(window.getByTestId('print-problems')).toHaveAttribute('data-state', 'clear');
  return boardMap(window);
}

/** Presses the rivet's rim and carries it up until its rim is `clearance` from the top edge. */
async function carryUp(
  window: Page,
  board: Awaited<ReturnType<typeof boardMap>>,
  clearance: number,
) {
  const from = board({ x: 16, y: 13 });
  const to = board({ x: 16, y: 26 - 2 - clearance });
  await window.mouse.move(from.x, from.y);
  await window.mouse.down();
  await window.keyboard.down('Control');
  await window.mouse.move(to.x, to.y, { steps: 8 });
}

async function drop(window: Page) {
  await window.mouse.up();
  await window.keyboard.up('Control');
}

const listed = (window: Page) =>
  window.getByTestId('problem-row').filter({ hasText: 'Too near the edge' });

test('a rivet carried within 1.5 mm of the edge is warned of before the drop, and listed after it (3.17)', async () => {
  await withApp(async (window) => {
    const board = await openKeyFob(window);
    await carryUp(window, board, 1);

    const clearance = window.getByTestId('move-clearance');
    await expect(clearance).toHaveAttribute('data-tone', 'warning');
    await expect(clearance).toContainText('Too near the edge');
    // Ten millimetres up, to the board's pixels.
    await expect(window.getByTestId('move-delta')).toContainText(/Δy (9\.\d|10\.\d) mm/);
    await expect(window.getByTestId('move-readout')).toContainText(/Δy (9\.\d|10\.\d) mm/);

    await drop(window);
    await expect(window.getByTestId('move-chip')).toHaveCount(0);
    await expect(window.getByTestId('move-announcer')).toContainText(
      /Moved .*mm up; [01]\.\d\d mm from the edge · Too near the edge\./,
    );
    await window.getByTestId('problems-toggle').click();
    await expect(listed(window)).not.toHaveCount(0);
  }, ROOM);
});

test('a rivet carried to 2 mm from the edge reads clear, and nothing is listed (3.17)', async () => {
  await withApp(async (window) => {
    const board = await openKeyFob(window);
    await carryUp(window, board, 2);

    const clearance = window.getByTestId('move-clearance');
    await expect(clearance).toContainText('from the edge');
    await expect(clearance).not.toHaveAttribute('data-tone', 'warning');

    await drop(window);
    await expect(window.getByTestId('move-announcer')).toContainText('mm from the edge.');
    await expect(window.getByTestId('print-problems')).toHaveAttribute('data-state', 'clear');
  }, ROOM);
});

test('a nudge kept is said through the live region (3.14, 3.17)', async () => {
  await withApp(async (window) => {
    await openKeyFob(window);
    await window.getByTestId('feature-row-strap-rivet-a').click();
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('ArrowRight');

    // At (15, 13) the straight sides are nearest, 13 mm off: the round end's
    // arc lies wholly left of its centre at x = 13.
    const announcer = window.getByTestId('move-announcer');
    await expect(announcer).toHaveText('Moved 1.0 mm right; 11.00 mm from the edge.');
    const first = await announcer.locator('span').elementHandle();
    await window.keyboard.press('ArrowRight');
    // Said again: the same words, in a new node a screen reader reads afresh.
    await expect.poll(() => first?.evaluate((node) => node.isConnected)).toBe(false);
    await expect(announcer).toHaveText('Moved 1.0 mm right; 11.00 mm from the edge.');
  }, ROOM);
});
