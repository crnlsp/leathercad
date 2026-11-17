import { expect, test, type Page } from '@playwright/test';

import { boardMap } from './boardMap.js';
import { withApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * 3.18: a rivet dragged near the key fob strap's centre line lands on it
 * exactly (smart-guides spec §6). The strap is 140 × 26 mm at the origin, its
 * ends fully round, so its centre line is y = 13; its rivet sits at (14, 13),
 * mirrored across the fold. The rivet is typed 3 mm up first, then dragged
 * back near the line by its rim where it starts, at 0°.
 */

const ROOM = { size: [1440, 1000] } as const;

const panel = (window: Page) => window.getByTestId('property-panel');
const centreY = (window: Page) => panel(window).getByRole('textbox', { name: 'Y mm', exact: true });

async function openKeyFob(window: Page) {
  await fromProjectMenu(window, 'new-template');
  await window.getByTestId('template-builtin:key-fob').dblclick();
  await expect(window.getByTestId('project-name')).toHaveText('Key fob');
  await window.getByTestId('tool-select').click();
  await window.getByTestId('feature-row-strap-rivet-a').click();
  await centreY(window).fill('16');
  await centreY(window).press('Enter');
  await expect(centreY(window)).toHaveValue('16');
  return boardMap(window);
}

/** From the rivet's rim at 0°, 20 mm right and 2.6 mm down: raw, its centre at y = 13.4. */
async function carry(window: Page, board: Awaited<ReturnType<typeof boardMap>>, ctrl = false) {
  const from = board({ x: 16, y: 16 });
  const to = board({ x: 36, y: 13.4 });
  await window.mouse.move(from.x, from.y);
  await window.mouse.down();
  if (ctrl) await window.keyboard.down('Control');
  await window.mouse.move(to.x, to.y, { steps: 8 });
  await window.mouse.up();
  if (ctrl) await window.keyboard.up('Control');
}

test("a rivet dragged near the strap's centre line lands on it exactly, in one undo step (3.18)", async () => {
  await withApp(async (window) => {
    const board = await openKeyFob(window);
    await carry(window, board);
    await expect(centreY(window)).toHaveValue('13');

    await window.getByTestId('undo').click();
    await expect(centreY(window)).toHaveValue('16');
  }, ROOM);
});

test('Ctrl held while dragging the rivet suspends the line (3.18)', async () => {
  await withApp(async (window) => {
    const board = await openKeyFob(window);
    await carry(window, board, true);
    const value = Number((await centreY(window).inputValue()).replace('−', '-'));
    expect(value).toBeGreaterThan(13.1);
    expect(value).toBeLessThan(13.7);
  }, ROOM);
});
